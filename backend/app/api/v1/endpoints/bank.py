import re
import uuid
from collections import Counter
from decimal import Decimal
from datetime import datetime, date, timezone
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, delete
from pydantic import BaseModel, field_validator
from app.core.database import get_db
from app.core.bank_statement_parser import parse_statement, StatementParseError
from app.core.bank_chart import GRANULARITIES, AccountSeries, build_chart
from app.api.v1.endpoints.settings import get_setting
from app.api.v1.endpoints.auth import get_current_user
from app.models.bank_account import BankAccount, BankStatementImport, BankTransaction, BankPayeeRule
from app.models.client_payment import ClientPayment, PaymentAllocation
from app.models.company import Company
from app.models.invoice import Invoice
from app.models.payment import PaymentMethod
from app.core import bank_matching as bm
from app.api.v1.endpoints.payments import _recalculate_invoice_status
from app.models.user import User
from app.models.purchases import Vendor

router = APIRouter()

# Releves originaux : hors du dossier /uploads (servi publiquement), jamais commites
STATEMENTS_DIR = Path(__file__).resolve().parents[4] / "storage" / "bank_statements"
MAX_STATEMENT_BYTES = 5 * 1024 * 1024

ACCOUNT_TYPES = ("bank", "credit_card", "petty_cash")


# ── Schemas ──────────────────────────────────────────────────────────────────

class BankAccountOut(BaseModel):
    id: uuid.UUID
    account_type: str
    name: str
    institution: str | None
    account_last4: str | None
    notes: str | None
    feed_connected: bool
    last_synced_at: datetime | None
    is_active: bool
    # Calcules depuis les releves importes
    unclassified_count: int = 0
    bank_balance: float | None = None
    bank_balance_date: date | None = None
    last_feed_date: date | None = None
    model_config = {"from_attributes": True}


class StatementImportOut(BaseModel):
    id: uuid.UUID
    filename: str
    file_format: str
    period_start: date | None
    period_end: date | None
    rows_total: int
    rows_new: int
    rows_duplicate: int
    ledger_balance: float | None
    ledger_balance_date: date | None
    created_at: datetime
    model_config = {"from_attributes": True}


class TransactionOut(BaseModel):
    id: uuid.UUID
    posted_date: date
    amount: float
    description: str
    payee: str | None
    reference: str | None
    status: str
    import_id: uuid.UUID | None
    company_id: uuid.UUID | None = None
    company_name: str | None = None
    company_source: str | None = None
    client_payment_id: uuid.UUID | None = None
    payment_created: bool = False
    matched_at: datetime | None = None
    invoice_numbers: list[str] = []
    suggestion: dict | None = None  # onglet « Reconnu » : suggestion sure pour « Valider »
    auto_matched: bool = False      # associee automatiquement a l'import (TASK-042.2)
    ai_status: str | None = None
    ai_company_id: uuid.UUID | None = None
    ai_company_name: str | None = None
    ai_confidence: int | None = None
    ai_note: str | None = None
    vendor_id: uuid.UUID | None = None      # retraits (TASK-042.4)
    vendor_name: str | None = None
    vendor_source: str | None = None        # manual | rule | name (name = proposition a accepter)
    expense_id: uuid.UUID | None = None
    vendor_payment_id: uuid.UUID | None = None
    withdrawal_label: str | None = None     # ce qui explique le retrait associe
    ai_queue_position: int | None = None    # place dans la file de l'IA (1 = la prochaine)
    ai_eta_seconds: int | None = None       # attente estimee
    model_config = {"from_attributes": True}


class AllocIn(BaseModel):
    invoice_id: uuid.UUID
    amount: float


class MatchIn(BaseModel):
    """Soit lier un encaissement existant (client_payment_id), soit repartir le depot sur des factures."""
    client_payment_id: uuid.UUID | None = None
    allocations: list[AllocIn] = []
    method_code: str | None = None
    remember_payee: bool = True


class CompanyAssignIn(BaseModel):
    company_id: uuid.UUID | None = None
    remember: bool = True
    auto_match: bool = True     # « Accepter » va jusqu'au bout : associe aussitot si c'est sur


class RuleUpdate(BaseModel):
    company_id: uuid.UUID


class BulkIn(BaseModel):
    ids: list[uuid.UUID]
    action: str  # exclude | restore | validate


def _check_type(v: str | None) -> str | None:
    if v is not None and v not in ACCOUNT_TYPES:
        raise ValueError(f"Type de compte invalide (attendu : {', '.join(ACCOUNT_TYPES)})")
    return v


def _check_last4(v: str | None) -> str | None:
    if v in (None, ""):
        return None
    if not (v.isdigit() and len(v) == 4):
        raise ValueError("Le numero de compte doit etre les 4 derniers chiffres")
    return v


class BankAccountCreate(BaseModel):
    account_type: str = "bank"
    name: str
    institution: str | None = None
    account_last4: str | None = None
    notes: str | None = None

    _type = field_validator("account_type")(_check_type)
    _last4 = field_validator("account_last4")(_check_last4)


class BankAccountUpdate(BaseModel):
    account_type: str | None = None
    name: str | None = None
    institution: str | None = None
    account_last4: str | None = None
    notes: str | None = None
    is_active: bool | None = None

    _type = field_validator("account_type")(_check_type)
    _last4 = field_validator("account_last4")(_check_last4)


# ── Comptes ──────────────────────────────────────────────────────────────────

async def _account_out(acc: BankAccount, db: AsyncSession) -> BankAccountOut:
    out = BankAccountOut.model_validate(acc)
    out.unclassified_count = (await db.execute(
        select(func.count()).where(BankTransaction.account_id == acc.id, BankTransaction.status == "unclassified")
    )).scalar() or 0
    out.last_feed_date = (await db.execute(
        select(func.max(BankTransaction.posted_date)).where(BankTransaction.account_id == acc.id)
    )).scalar()
    # Solde du releve le plus recent qui en fournit un (OFX) ; un CSV n'en donne pas
    last = (await db.execute(
        select(BankStatementImport)
        .where(BankStatementImport.account_id == acc.id, BankStatementImport.ledger_balance.is_not(None))
        .order_by(BankStatementImport.ledger_balance_date.desc().nulls_last(), BankStatementImport.created_at.desc())
        .limit(1)
    )).scalar_one_or_none()
    if last:
        out.bank_balance = float(last.ledger_balance)
        out.bank_balance_date = last.ledger_balance_date
    return out


async def _get_account(account_id: uuid.UUID, db: AsyncSession) -> BankAccount:
    acc = await db.get(BankAccount, account_id)
    if not acc:
        raise HTTPException(status_code=404, detail="Compte introuvable")
    return acc


@router.get("/accounts", response_model=list[BankAccountOut])
async def list_accounts(include_inactive: bool = False, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    q = select(BankAccount).order_by(BankAccount.name)
    if not include_inactive:
        q = q.where(BankAccount.is_active == True)
    result = await db.execute(q)
    return [await _account_out(a, db) for a in result.scalars().all()]


@router.post("/accounts", response_model=BankAccountOut, status_code=status.HTTP_201_CREATED)
async def create_account(payload: BankAccountCreate, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    if not payload.name.strip():
        raise HTTPException(status_code=400, detail="Nom requis")
    acc = BankAccount(**payload.model_dump())
    db.add(acc)
    await db.commit()
    await db.refresh(acc)
    return await _account_out(acc, db)


@router.put("/accounts/{account_id}", response_model=BankAccountOut)
async def update_account(account_id: uuid.UUID, payload: BankAccountUpdate, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    acc = await db.get(BankAccount, account_id)
    if not acc:
        raise HTTPException(status_code=404, detail="Compte introuvable")
    data = payload.model_dump(exclude_unset=True)
    if "name" in data and not (data["name"] or "").strip():
        raise HTTPException(status_code=400, detail="Nom requis")
    for field, value in data.items():
        setattr(acc, field, value)
    await db.commit()
    await db.refresh(acc)
    return await _account_out(acc, db)


# ── Releves bancaires ────────────────────────────────────────────────────────

@router.post("/accounts/{account_id}/statements")
async def import_statement(
    account_id: uuid.UUID,
    file: UploadFile = File(...),
    dry_run: bool = Form(True),
    include_probable: bool = Form(False),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Lit un releve OFX/QFX/QBO ou CSV. dry_run=true : apercu sans rien enregistrer
    (nouvelles lignes vs deja importees) ; dry_run=false : importe les nouvelles lignes.

    TASK-042.2 : en plus des doublons exacts (meme FITID ou meme cle), les « doublons probables »
    -- meme date et meme montant qu'une transaction deja importee depuis un AUTRE fichier ou format
    (ex. CSV depose a la main + releve recu par SFTP) -- sont ecartes, sauf include_probable. Compte
    par compte : deux frais identiques le meme jour restent deux lignes. Apres l'import, les depots
    dont l'association est sure (bm.best_exact) sont associes automatiquement ; les depots non
    reconnus sont confies a l'IA locale, qui propose un client sans jamais confirmer."""
    acc = await _get_account(account_id, db)
    if acc.account_type == "petty_cash":
        raise HTTPException(status_code=400, detail="Une petite caisse n'a pas de relevé bancaire")
    raw = await file.read()
    if len(raw) > MAX_STATEMENT_BYTES:
        raise HTTPException(status_code=400, detail="Fichier trop volumineux (5 Mo maximum)")
    filename = file.filename or "releve"
    try:
        st = parse_statement(raw, filename)
    except StatementParseError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Lignes a 0,00 $ (avis de frais nuls) : aucun argent n'a bouge, rien a classer -- ignorees
    zero_count = sum(1 for l in st.lines if l.amount == 0)
    st.lines = [l for l in st.lines if l.amount != 0]
    if not st.lines:
        raise HTTPException(status_code=400, detail="Le fichier ne contient que des lignes à 0,00 $")

    keys = [l.dedup_key for l in st.lines]
    existing = set((await db.execute(
        select(BankTransaction.dedup_key).where(BankTransaction.account_id == acc.id, BankTransaction.dedup_key.in_(keys))
    )).scalars().all())
    new_lines, seen = [], set()
    for l in st.lines:
        if l.dedup_key in existing or l.dedup_key in seen:
            continue
        seen.add(l.dedup_key)
        new_lines.append(l)

    # Doublons probables : meme date + meme montant qu'une ligne deja en base, en surplus des doublons exacts
    probable = []
    if new_lines:
        dates = [l.posted_date for l in st.lines]
        in_db = Counter((d, Decimal(a)) for d, a in (await db.execute(
            select(BankTransaction.posted_date, BankTransaction.amount).where(
                BankTransaction.account_id == acc.id, BankTransaction.posted_date >= min(dates), BankTransaction.posted_date <= max(dates))
        )).all())
        explained = Counter((l.posted_date, l.amount) for l in st.lines if l.dedup_key in existing)
        avail = in_db - explained
        kept = []
        for l in new_lines:
            k = (l.posted_date, l.amount)
            if avail[k] > 0:
                avail[k] -= 1
                probable.append(l)
            else:
                kept.append(l)
        if not include_probable:
            new_lines = kept

    # Le numero du fichier doit finir par les 4 chiffres du compte choisi -- avertissement seulement
    file_digits = re.sub(r"\D", "", st.account_number or "")
    mismatch = bool(acc.account_last4 and file_digits and not file_digits.endswith(acc.account_last4))

    result = {
        "file_format": st.file_format,
        "period_start": st.period_start,
        "period_end": st.period_end,
        "rows_total": len(st.lines),
        "rows_new": len(new_lines),
        "rows_duplicate": len(st.lines) - len(new_lines) - (0 if include_probable else len(probable)),
        "rows_probable_duplicate": len(probable),
        "probable_duplicates": [{"posted_date": l.posted_date, "amount": float(l.amount), "description": l.description} for l in probable[:20]],
        "rows_zero_skipped": zero_count,
        "ledger_balance": float(st.ledger_balance) if st.ledger_balance is not None else None,
        "ledger_balance_date": st.ledger_balance_date,
        "file_account_last4": file_digits[-4:] if file_digits else None,
        "account_mismatch": mismatch,
        "preview": [
            {"posted_date": l.posted_date, "amount": float(l.amount), "description": l.description, "new": l in new_lines}
            for l in sorted(st.lines, key=lambda x: x.posted_date, reverse=True)[:10]
        ],
        "import_id": None,
    }
    if dry_run:
        return result
    if not new_lines:
        raise HTTPException(status_code=400, detail="Toutes les transactions de ce fichier sont déjà importées")

    imp = BankStatementImport(
        account_id=acc.id, filename=filename[:255], file_format=st.file_format,
        period_start=st.period_start, period_end=st.period_end,
        rows_total=len(st.lines), rows_new=len(new_lines), rows_duplicate=len(st.lines) - len(new_lines),
        ledger_balance=st.ledger_balance, ledger_balance_date=st.ledger_balance_date,
        imported_by=current_user.id,
    )
    db.add(imp)
    await db.flush()
    for l in new_lines:
        db.add(BankTransaction(
            account_id=acc.id, import_id=imp.id, posted_date=l.posted_date, amount=l.amount,
            description=l.description, payee=l.payee, reference=(l.reference or None) and l.reference[:100],
            fitid=l.fitid and l.fitid[:255], dedup_key=l.dedup_key,
        ))

    STATEMENTS_DIR.mkdir(parents=True, exist_ok=True)
    safe = re.sub(r"[^A-Za-z0-9._-]+", "_", filename)[-100:]
    path = STATEMENTS_DIR / f"{imp.id}_{safe}"
    path.write_bytes(raw)
    imp.stored_path = str(path)

    await db.flush()
    result["rows_recognized"] = await bm.apply_rules(db, account_id=acc.id)
    await db.flush()
    new_tx_ids = list((await db.execute(select(BankTransaction.id).where(BankTransaction.import_id == imp.id))).scalars().all())
    result["rows_vendor_recognized"] = await bm.propose_vendors(db, new_tx_ids)
    await db.commit()
    result["import_id"] = imp.id
    new_ids = list((await db.execute(select(BankTransaction.id).where(BankTransaction.import_id == imp.id))).scalars().all())
    result["rows_auto_matched"] = await _auto_associate(db, new_ids)
    result["rows_sent_to_ai"] = await _queue_for_ai(db, new_ids)
    return result


def _match_body(sug: dict) -> "MatchIn":
    """Suggestion sure -> association : paiement a lier, ou factures (les plus vieilles d'abord)."""
    if sug["kind"] == "payment":
        return MatchIn(client_payment_id=sug["id"])
    allocs = sug.get("allocations") or [{"invoice_id": sug["id"], "amount": sug["balance"]}]
    return MatchIn(allocations=[AllocIn(invoice_id=a["invoice_id"], amount=a["amount"]) for a in allocs])


async def _auto_associate(db: AsyncSession, tx_ids: list) -> int:
    """Associe les depots dont la suggestion est unique et exacte (compagnie reconnue par une regle
    ou attribuee, ET un seul paiement en attente ou une seule facture ouverte au solde exact).
    Rien d'approximatif, rien venant de l'IA ; chaque association reste annulable."""
    n = 0
    for tid in tx_ids:
        tx = await db.get(BankTransaction, tid)
        if not tx or tx.status != "unclassified":
            continue
        if tx.amount < 0:
            sug = await bm.best_exact_withdrawal(db, tx)
            if not sug:
                continue
            try:
                await match_withdrawal(tx.id, _withdrawal_body(sug), db)
            except HTTPException:
                await db.rollback()
                continue
            tx = await db.get(BankTransaction, tid)
            tx.auto_matched = True
            await db.commit()
            n += 1
            continue
        if tx.amount <= 0 or not tx.company_id:
            continue
        sug = await bm.best_exact(db, tx)
        if not sug:
            continue
        body = _match_body(sug)
        try:
            await match_transaction(tx.id, body, db)
        except HTTPException:
            await db.rollback()
            continue
        tx = await db.get(BankTransaction, tid)
        tx.auto_matched = True
        await db.commit()
        n += 1
    return n


async def _queue_for_ai(db: AsyncSession, tx_ids: list) -> int:
    """Depots encore non reconnus -> file de l'IA locale (services/bank_ai_poller.py)."""
    from app.core.config import settings
    if not settings.LOCAL_AI_URL:
        return 0
    n = 0
    for tid in tx_ids:
        tx = await db.get(BankTransaction, tid)
        if tx and tx.status == "unclassified" and tx.amount > 0 and not tx.company_id and tx.ai_status is None:
            tx.ai_status = "pending"
            n += 1
    await db.commit()
    return n


@router.post("/accounts/{account_id}/auto-associate")
async def auto_associate_account(account_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    """« Associer ce qui est sûr » sur toutes les lignes non classees du compte, puis confie a l'IA
    les depots encore non reconnus."""
    await _get_account(account_id, db)
    ids = list((await db.execute(select(BankTransaction.id).where(
        BankTransaction.account_id == account_id, BankTransaction.status == "unclassified"))).scalars().all())
    await bm.propose_vendors(db, ids)
    await db.commit()
    return {"auto_matched": await _auto_associate(db, ids), "sent_to_ai": await _queue_for_ai(db, ids)}


@router.get("/accounts/{account_id}/statements", response_model=list[StatementImportOut])
async def list_statements(account_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    await _get_account(account_id, db)
    result = await db.execute(
        select(BankStatementImport).where(BankStatementImport.account_id == account_id).order_by(BankStatementImport.created_at.desc())
    )
    return result.scalars().all()


@router.delete("/statements/{import_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_statement(import_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    """Annule un import (mauvais fichier, mauvais compte) : retire ses lignes encore non traitees."""
    imp = await db.get(BankStatementImport, import_id)
    if not imp:
        raise HTTPException(status_code=404, detail="Import introuvable")
    treated = (await db.execute(
        select(func.count()).where(BankTransaction.import_id == imp.id, BankTransaction.status.not_in(["unclassified", "excluded"]))
    )).scalar() or 0
    if treated:
        raise HTTPException(status_code=400, detail=f"{treated} transaction(s) de ce relevé sont déjà traitées : impossible d'annuler l'import")
    await db.execute(delete(BankTransaction).where(BankTransaction.import_id == imp.id))
    stored = imp.stored_path
    await db.delete(imp)
    await db.commit()
    if stored:
        Path(stored).unlink(missing_ok=True)


# ── Transactions recues de la banque ─────────────────────────────────────────

@router.get("/accounts/{account_id}/transactions", response_model=list[TransactionOut])
async def list_transactions(account_id: uuid.UUID, status_filter: str = "unclassified", db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    await _get_account(account_id, db)
    q = select(BankTransaction).where(BankTransaction.account_id == account_id)
    if status_filter != "all":
        q = q.where(BankTransaction.status == status_filter)
    txs = (await db.execute(q.order_by(BankTransaction.posted_date.desc(), BankTransaction.created_at.desc()))).scalars().all()
    out = [await _tx_out(t, db) for t in txs]
    # Decompte de la file de l'IA (meme ordre que services/bank_ai_poller.py, tous comptes confondus)
    from app.services.bank_ai_poller import QUEUE_ORDER, SECONDS_PER_DEPOSIT
    queue = list((await db.execute(select(BankTransaction.id).where(BankTransaction.ai_status == "pending").order_by(*QUEUE_ORDER))).scalars().all())
    pos = {tid: k + 1 for k, tid in enumerate(queue)}
    for o in out:
        if o.id in pos:
            o.ai_queue_position, o.ai_eta_seconds = pos[o.id], pos[o.id] * SECONDS_PER_DEPOSIT
    return out


async def _tx_out(t: BankTransaction, db: AsyncSession, with_suggestion: bool = True) -> TransactionOut:
    out = TransactionOut.model_validate(t)
    if t.company_id:
        out.company_name = (await db.get(Company, t.company_id)).name
    if t.ai_company_id:
        c = await db.get(Company, t.ai_company_id)
        out.ai_company_name = c.name if c else None
    if t.client_payment_id:
        out.invoice_numbers = list((await db.execute(
            select(Invoice.number).join(PaymentAllocation, PaymentAllocation.invoice_id == Invoice.id)
            .where(PaymentAllocation.payment_id == t.client_payment_id).order_by(Invoice.number)
        )).scalars().all())
    if with_suggestion and t.status == "unclassified" and t.company_id:
        out.suggestion = await bm.best_exact(db, t)
    if t.vendor_id:
        v = (await db.execute(select(Vendor).where(Vendor.id == t.vendor_id).execution_options(populate_existing=True))).scalar_one_or_none()
        out.vendor_name = v.name if v else None
    if t.expense_id:
        from app.models.purchases import Expense
        e = (await db.execute(select(Expense).where(Expense.id == t.expense_id).execution_options(populate_existing=True))).scalar_one_or_none()
        if e:
            out.withdrawal_label = "Dépense" + (f" — {e.category.name}" if e.category else "") + (f" · {e.vendor.name}" if e.vendor else "")
    elif t.vendor_payment_id:
        from app.models.purchases import VendorPayment
        p = (await db.execute(select(VendorPayment).where(VendorPayment.id == t.vendor_payment_id).execution_options(populate_existing=True))).scalar_one_or_none()
        if p:
            out.withdrawal_label = "Paiement fournisseur — " + (p.vendor.name if p.vendor else (p.payee_label or ""))
    if with_suggestion and t.status == "unclassified" and t.amount < 0:
        out.suggestion = await bm.best_exact_withdrawal(db, t)
    return out


async def _get_tx(tx_id: uuid.UUID, db: AsyncSession) -> BankTransaction:
    tx = await db.get(BankTransaction, tx_id)
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction introuvable")
    return tx


async def _remember(db: AsyncSession, payee: str | None, company_id: uuid.UUID) -> None:
    """Mode 3 : cree ou met a jour la regle beneficiaire -> compagnie, puis l'applique."""
    key = bm.payee_key(payee)
    if not key:
        return
    rule = (await db.execute(select(BankPayeeRule).where(BankPayeeRule.payee_key == key))).scalar_one_or_none()
    if rule and rule.company_id is None:
        rule.company_id = company_id        # meme beneficiaire deja connu comme fournisseur (retraits)
    elif rule:
        if rule.company_id != company_id:
            rule.company_id = company_id
            # Les lignes deja reconnues par l'ancienne regle suivent la nouvelle compagnie
            for t in (await db.execute(select(BankTransaction).where(
                BankTransaction.status == "unclassified", BankTransaction.company_source == "rule"))).scalars().all():
                if bm.payee_key(t.payee) == key:
                    t.company_id = company_id
    else:
        db.add(BankPayeeRule(payee_key=key, payee_label=payee.strip(), company_id=company_id))
    await db.flush()
    await bm.apply_rules(db, only_key=key)


# ── Attribution (3 modes) ────────────────────────────────────────────────────

@router.get("/transactions/{tx_id}/suggestions")
async def tx_suggestions(tx_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    """Mode 1 : paiements a lier, factures probables, combinaisons de factures."""
    tx = await _get_tx(tx_id, db)
    out = await bm.suggestions(db, tx)
    out["method_code"] = bm.guess_method(tx.description)
    return out


@router.get("/companies/{company_id}/invoices")
async def company_invoices(company_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    """Mode 2 : toutes les factures emises de la compagnie, avec paye / solde (les plus recentes d'abord)."""
    comp = await db.get(Company, company_id)
    if not comp:
        raise HTTPException(status_code=404, detail="Compagnie introuvable")
    invs = (await db.execute(
        select(Invoice).where(Invoice.company_id == company_id, Invoice.status.not_in(["brouillon", "annulee"]))
        .order_by(Invoice.issue_date.desc(), Invoice.number.desc())
    )).scalars().all()
    paid = await bm.invoice_balances(db, [i.id for i in invs])
    return [bm.invoice_dict(i, paid.get(i.id) or Decimal("0"), comp.name) for i in invs]


@router.post("/transactions/{tx_id}/match", response_model=TransactionOut)
async def match_transaction(tx_id: uuid.UUID, payload: MatchIn, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    """Associe un depot : lie un encaissement existant (le confirme s'il etait en attente)
    ou cree un encaissement confirme reparti sur les factures choisies."""
    tx = await _get_tx(tx_id, db)
    if tx.status != "unclassified":
        raise HTTPException(status_code=400, detail="Transaction déjà traitée")
    if tx.amount <= 0:
        raise HTTPException(status_code=400, detail="Seuls les dépôts s'associent à des paiements clients")

    if payload.client_payment_id:
        cp = await db.get(ClientPayment, payload.client_payment_id)
        if not cp:
            raise HTTPException(status_code=404, detail="Paiement introuvable")
        if cp.id in await bm.linked_payment_ids(db):
            raise HTTPException(status_code=400, detail="Ce paiement est déjà associé à une autre transaction bancaire")
        if cp.amount != tx.amount:
            raise HTTPException(status_code=400, detail="Le montant du paiement ne correspond pas au dépôt")
        if cp.status != "confirmed":
            cp.status = "confirmed"
            cp.received_at = tx.posted_date
            await db.flush()
            for iid in (await db.execute(select(PaymentAllocation.invoice_id).where(PaymentAllocation.payment_id == cp.id))).scalars().all():
                await _recalculate_invoice_status(iid, db)
        tx.client_payment_id, tx.payment_created, company_id = cp.id, False, cp.company_id
    else:
        if not payload.allocations:
            raise HTTPException(status_code=400, detail="Choisissez au moins une facture")
        total = sum((Decimal(str(a.amount)) for a in payload.allocations), Decimal("0"))
        if any(a.amount <= 0 for a in payload.allocations) or total > Decimal(tx.amount):
            raise HTTPException(status_code=400, detail="Montants invalides : la répartition dépasse le dépôt")
        invs = [await db.get(Invoice, a.invoice_id) for a in payload.allocations]
        if any(i is None for i in invs):
            raise HTTPException(status_code=404, detail="Facture introuvable")
        if len({i.company_id for i in invs}) != 1:
            raise HTTPException(status_code=400, detail="Toutes les factures doivent appartenir à la même compagnie")
        if any(i.status in ("brouillon", "annulee") for i in invs):
            raise HTTPException(status_code=400, detail="Impossible d'associer un brouillon ou une facture annulée")
        company_id = invs[0].company_id
        code = payload.method_code or bm.guess_method(tx.description)
        method = (await db.execute(select(PaymentMethod).where(PaymentMethod.code == code))).scalar_one_or_none()
        if not method:
            raise HTTPException(status_code=400, detail="Mode de paiement inconnu")
        cp = ClientPayment(
            company_id=company_id, status="confirmed", source="bank_import",
            method_code=method.code, method_name=method.name, amount=Decimal(tx.amount),
            received_at=tx.posted_date,
            notes=f"Dépôt bancaire du {tx.posted_date} : {tx.description}" + (f" — {tx.payee}" if tx.payee else ""),
        )
        db.add(cp)
        await db.flush()
        for a, inv in zip(payload.allocations, invs):
            db.add(PaymentAllocation(payment_id=cp.id, invoice_id=inv.id, amount_allocated=Decimal(str(a.amount))))
        await db.flush()
        for inv in invs:
            await _recalculate_invoice_status(inv.id, db)
        tx.client_payment_id, tx.payment_created = cp.id, True

    tx.status, tx.matched_at = "matched", datetime.now(timezone.utc)
    tx.company_id, tx.company_source = company_id, "manual"
    if payload.remember_payee and tx.payee:
        await _remember(db, tx.payee, company_id)
    await db.commit()
    return await _tx_out(tx, db, with_suggestion=False)


@router.post("/transactions/{tx_id}/unmatch", response_model=TransactionOut)
async def unmatch_transaction(tx_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    """Annule une association : supprime l'encaissement s'il a ete cree par l'association,
    sinon le delie (un paiement declare au portail redevient en attente)."""
    tx = await _get_tx(tx_id, db)
    if tx.status == "matched" and (tx.expense_id or tx.vendor_payment_id):
        return await _unmatch_withdrawal(tx, db)
    if tx.status != "matched" or not tx.client_payment_id:
        raise HTTPException(status_code=400, detail="Transaction non associée")
    cp = await db.get(ClientPayment, tx.client_payment_id)
    invoice_ids = list((await db.execute(select(PaymentAllocation.invoice_id).where(PaymentAllocation.payment_id == cp.id))).scalars().all()) if cp else []
    tx.client_payment_id, tx.status, tx.matched_at = None, "unclassified", None
    if cp and tx.payment_created:
        await db.delete(cp)
    elif cp and cp.source == "portal":
        cp.status = "pending"
    tx.payment_created = False
    await db.flush()
    for iid in invoice_ids:
        await _recalculate_invoice_status(iid, db)
    await db.commit()
    return await _tx_out(tx, db)


@router.put("/transactions/{tx_id}/company", response_model=TransactionOut)
async def set_transaction_company(tx_id: uuid.UUID, payload: CompanyAssignIn, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    """Mode 3 : attribue le beneficiaire (ou la ligne) a une compagnie ; avec remember,
    toutes les lignes non classees de ce beneficiaire sont reconnues, et les prochaines aussi."""
    tx = await _get_tx(tx_id, db)
    if tx.status == "matched":
        raise HTTPException(status_code=400, detail="Annulez d'abord l'association")
    if payload.company_id and not await db.get(Company, payload.company_id):
        raise HTTPException(status_code=404, detail="Compagnie introuvable")
    tx.company_id = payload.company_id
    tx.company_source = "manual" if payload.company_id else None
    if payload.company_id and tx.ai_company_id == payload.company_id:
        tx.ai_status = "accepted"
    if payload.company_id and payload.remember and tx.payee:
        await _remember(db, tx.payee, payload.company_id)
    await db.commit()
    if payload.company_id and payload.auto_match and tx.amount > 0 and tx.status == "unclassified":
        sug = await bm.best_exact(db, tx)
        if sug:
            try:
                await match_transaction(tx.id, _match_body(sug), db)
                tx = await _get_tx(tx_id, db)
                tx.auto_matched = True
                await db.commit()
            except HTTPException:
                await db.rollback()
                tx = await _get_tx(tx_id, db)
    return await _tx_out(tx, db)


@router.post("/transactions/bulk")
async def bulk_transactions(payload: BulkIn, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    """Actions groupees : exclure, restaurer, ou valider les suggestions sures (onglet Reconnu)."""
    if payload.action not in ("exclude", "restore", "validate"):
        raise HTTPException(status_code=400, detail="Action inconnue")
    done, skipped = 0, 0
    for tid in payload.ids:
        tx = await db.get(BankTransaction, tid)
        if not tx:
            skipped += 1
            continue
        if payload.action == "exclude" and tx.status == "unclassified":
            tx.status = "excluded"; done += 1
        elif payload.action == "restore" and tx.status == "excluded":
            tx.status = "unclassified"; done += 1
        elif payload.action == "validate" and tx.status == "unclassified":
            sug = await (bm.best_exact_withdrawal(db, tx) if tx.amount < 0 else bm.best_exact(db, tx))
            if not sug:
                skipped += 1
                continue
            await db.commit()
            if tx.amount < 0:
                await match_withdrawal(tx.id, _withdrawal_body(sug), db)
            else:
                await match_transaction(tx.id, _match_body(sug), db)
            done += 1
        else:
            skipped += 1
    await db.commit()
    return {"done": done, "skipped": skipped}


# ── Retraits (TASK-042.4) ────────────────────────────────────────────────────

class BillAllocIn(BaseModel):
    bill_id: uuid.UUID
    amount: float


class NewExpenseIn(BaseModel):
    vendor_id: uuid.UUID | None = None
    category_id: uuid.UUID | None = None
    line_class: str | None = None   # une des classes de ligne (Materiel taxable, Assurance...) -- TASK-044.1
    description: str | None = None
    tax_mode: str = "inclusive"     # le montant du releve contient deja les taxes
    tax_code: str = "tps_tvq"


class WithdrawalMatchIn(BaseModel):
    """Une seule option : lier une depense ou un paiement deja enregistre, payer des factures
    fournisseurs (cree le paiement), ou enregistrer une nouvelle depense."""
    expense_id: uuid.UUID | None = None
    vendor_payment_id: uuid.UUID | None = None
    bill_allocations: list[BillAllocIn] = []
    payee_label: str | None = None  # paiement groupe sans fournisseur unique (ex. carte de credit)
    new_expense: NewExpenseIn | None = None
    remember_payee: bool = True


class VendorAssignIn(BaseModel):
    vendor_id: uuid.UUID | None = None
    category_id: uuid.UUID | None = None
    remember: bool = True
    auto_match: bool = True


def _withdrawal_body(sug: dict) -> WithdrawalMatchIn:
    if sug["kind"] == "expense":
        return WithdrawalMatchIn(expense_id=sug["id"])
    if sug["kind"] == "vendor_payment":
        return WithdrawalMatchIn(vendor_payment_id=sug["id"])
    return WithdrawalMatchIn(bill_allocations=[BillAllocIn(**a) for a in sug["allocations"]])


async def _remember_vendor(db: AsyncSession, payee: str | None, vendor_id: uuid.UUID, category_id: uuid.UUID | None) -> None:
    """Regle beneficiaire -> fournisseur (+ compte de depense habituel), appliquee aux autres retraits."""
    key = bm.payee_key(payee)
    if not key:
        return
    rule = (await db.execute(select(BankPayeeRule).where(BankPayeeRule.payee_key == key))).scalar_one_or_none()
    if rule:
        rule.vendor_id = vendor_id
        if category_id:
            rule.category_id = category_id
    else:
        db.add(BankPayeeRule(payee_key=key, payee_label=payee.strip(), vendor_id=vendor_id, category_id=category_id))
    await db.flush()
    for t in (await db.execute(select(BankTransaction).where(BankTransaction.amount < 0, BankTransaction.status == "unclassified"))).scalars().all():
        if bm.payee_key(t.payee or t.description) == key and t.vendor_source != "manual":
            t.vendor_id, t.vendor_source = vendor_id, "rule"


@router.post("/transactions/{tx_id}/match-withdrawal", response_model=TransactionOut)
async def match_withdrawal(tx_id: uuid.UUID, payload: WithdrawalMatchIn, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    from app.models.purchases import Expense, VendorPayment, Vendor
    from app.api.v1.endpoints.purchases import ExpenseIn, VendorPaymentIn, AllocIn as BillAlloc, _apply_expense, _save_payment
    tx = await _get_tx(tx_id, db)
    if tx.status != "unclassified":
        raise HTTPException(status_code=400, detail="Transaction déjà traitée")
    if tx.amount >= 0:
        raise HTTPException(status_code=400, detail="Seuls les retraits se lient à une dépense ou à un paiement fournisseur")
    amount = -Decimal(tx.amount)
    options = sum(bool(x) for x in (payload.expense_id, payload.vendor_payment_id, payload.bill_allocations, payload.new_expense))
    if options != 1:
        raise HTTPException(status_code=400, detail="Choisissez une seule façon d'expliquer ce retrait")
    linked_e, linked_p = await bm.linked_withdrawal_ids(db)
    acc = await db.get(BankAccount, tx.account_id)
    vendor_id, category_id, created = tx.vendor_id, None, False

    if payload.expense_id:
        e = await db.get(Expense, payload.expense_id)
        if not e:
            raise HTTPException(status_code=404, detail="Dépense introuvable")
        if e.id in linked_e:
            raise HTTPException(status_code=400, detail="Cette dépense est déjà liée à une autre transaction bancaire")
        if e.total != amount:
            raise HTTPException(status_code=400, detail="Le montant de la dépense ne correspond pas au retrait")
        tx.expense_id, vendor_id, category_id = e.id, e.vendor_id or vendor_id, e.category_id
    elif payload.vendor_payment_id:
        p = await db.get(VendorPayment, payload.vendor_payment_id)
        if not p:
            raise HTTPException(status_code=404, detail="Paiement introuvable")
        if p.id in linked_p:
            raise HTTPException(status_code=400, detail="Ce paiement est déjà lié à une autre transaction bancaire")
        if p.amount != amount:
            raise HTTPException(status_code=400, detail="Le montant du paiement ne correspond pas au retrait")
        tx.vendor_payment_id, vendor_id = p.id, p.vendor_id or vendor_id
    elif payload.bill_allocations:
        from app.models.purchases import Bill
        bills = [await db.get(Bill, a.bill_id) for a in payload.bill_allocations]
        if any(b is None for b in bills):
            raise HTTPException(status_code=404, detail="Facture fournisseur introuvable")
        vendors = {b.vendor_id for b in bills}
        pay_vendor = vendors.pop() if len(vendors) == 1 else None
        label = payload.payee_label or (None if pay_vendor else (tx.payee or tx.description or "Paiement groupé"))
        vp = await _save_payment(db, VendorPaymentIn(
            payment_date=tx.posted_date, vendor_id=pay_vendor, payee_label=label, amount=float(amount), method="Banque",
            reference=tx.reference, bank_account_id=tx.account_id,
            notes=f"Retrait bancaire du {tx.posted_date} : {tx.description}" + (f" — {tx.payee}" if tx.payee else ""),
            allocations=[BillAlloc(bill_id=a.bill_id, amount=a.amount) for a in payload.bill_allocations]), None)
        vp = await db.get(VendorPayment, vp.id)
        vp.source = "bank_import"
        tx = await _get_tx(tx_id, db)
        tx.vendor_payment_id, vendor_id, created = vp.id, pay_vendor or vendor_id, True
    else:
        ne = payload.new_expense
        e = Expense(source="bank_import")
        _apply_expense(e, ExpenseIn(expense_date=tx.posted_date, vendor_id=ne.vendor_id or tx.vendor_id, category_id=ne.category_id,
                                    description=ne.description or tx.payee or tx.description, tax_mode=ne.tax_mode, tax_code=ne.tax_code,
                                    amount=float(amount), paid_through=acc.name if acc else None, bank_account_id=tx.account_id,
                                    reference=tx.reference))
        if e.total != amount:
            raise HTTPException(status_code=400, detail="Le montant « taxes incluses » doit égaler le retrait")
        if ne.line_class:
            from app.models.purchases import ExpenseLine, LINE_CLASSES
            if ne.line_class not in LINE_CLASSES:
                raise HTTPException(status_code=400, detail="Classe inconnue")
            e.lines = [ExpenseLine(line_class=ne.line_class, description=ne.description or tx.payee or tx.description,
                                   amount=amount, tax_code=ne.tax_code, category_id=ne.category_id, sort_order=0)]
        db.add(e)
        await db.flush()
        tx.expense_id, vendor_id, category_id, created = e.id, e.vendor_id, e.category_id, True

    tx.status, tx.matched_at, tx.payment_created = "matched", datetime.now(timezone.utc), created
    if vendor_id:
        # « match » = fournisseur venu de l'association : retire si on annule (un fournisseur choisi a la main reste)
        if tx.vendor_id != vendor_id or tx.vendor_source not in ("manual", "rule"):
            tx.vendor_id, tx.vendor_source = vendor_id, "match"
        if payload.remember_payee and (tx.payee or tx.description):
            await _remember_vendor(db, tx.payee or tx.description, vendor_id, category_id)
    await db.commit()
    return await _tx_out(tx, db, with_suggestion=False)


async def _unmatch_withdrawal(tx: BankTransaction, db: AsyncSession) -> TransactionOut:
    """Supprime la depense / le paiement cree par l'association, sinon le delie seulement."""
    from app.models.purchases import Expense, VendorPayment
    from app.api.v1.endpoints.purchases import recalc_bill_status
    if tx.expense_id:
        e = await db.get(Expense, tx.expense_id)
        tx.expense_id = None
        if e and tx.payment_created:
            await db.delete(e)
    if tx.vendor_payment_id:
        p = await db.get(VendorPayment, tx.vendor_payment_id)
        tx.vendor_payment_id = None
        if p and tx.payment_created:
            bills = [a.bill_id for a in p.allocations]
            await db.delete(p)
            await db.flush()
            for bid in bills:
                await recalc_bill_status(db, bid)
    tx.status, tx.matched_at, tx.payment_created, tx.auto_matched = "unclassified", None, False, False
    if tx.vendor_source == "match":
        tx.vendor_id, tx.vendor_source = None, None
        await db.flush()
        await bm.propose_vendors(db, [tx.id])   # regle ou nom, comme avant l'association
    await db.commit()
    return await _tx_out(tx, db)


@router.get("/transactions/{tx_id}/detail")
async def transaction_detail(tx_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    """Fiche complete d'une transaction (clic sur la ligne) : infos du releve, client/fournisseur,
    proposition de l'IA, ce qui est lie, suggestions avec leur pertinence (%)."""
    from app.models.purchases import Expense, VendorPayment, Bill
    tx = await _get_tx(tx_id, db)
    out = (await _tx_out(tx, db)).model_dump()
    imp = await db.get(BankStatementImport, tx.import_id) if tx.import_id else None
    acc = await db.get(BankAccount, tx.account_id)
    out.update({"account_name": acc.name if acc else None, "statement_file": imp.filename if imp else None,
                "statement_imported_at": imp.created_at if imp else None, "fitid": tx.fitid, "linked": None, "suggestions": None})
    if tx.client_payment_id:
        cp = await db.get(ClientPayment, tx.client_payment_id)
        if cp:
            allocs = (await db.execute(select(PaymentAllocation, Invoice).join(Invoice, Invoice.id == PaymentAllocation.invoice_id)
                                       .where(PaymentAllocation.payment_id == cp.id).order_by(Invoice.issue_date))).all()
            out["linked"] = {"kind": "client_payment", "created_by_link": tx.payment_created, "method": cp.method_name, "source": cp.source,
                             "received_at": cp.received_at, "amount": float(cp.amount),
                             "items": [{"id": str(i.id), "number": i.number, "date": i.issue_date, "total": float(i.total), "amount": float(a.amount_allocated)} for a, i in allocs]}
    elif tx.expense_id:
        e = (await db.execute(select(Expense).where(Expense.id == tx.expense_id).execution_options(populate_existing=True))).scalar_one_or_none()
        if e:
            out["linked"] = {"kind": "expense", "created_by_link": tx.payment_created, "date": e.expense_date, "amount": float(e.total),
                             "vendor": e.vendor.name if e.vendor else None, "category": e.category.name if e.category else None,
                             "description": e.description, "tps": float(e.tps_amount), "tvq": float(e.tvq_amount), "id": str(e.id)}
    elif tx.vendor_payment_id:
        p = (await db.execute(select(VendorPayment).where(VendorPayment.id == tx.vendor_payment_id).execution_options(populate_existing=True))).scalar_one_or_none()
        if p:
            bills = {b.id: b for b in (await db.execute(select(Bill).where(Bill.id.in_([a.bill_id for a in p.allocations])))).scalars().all()} if p.allocations else {}
            out["linked"] = {"kind": "vendor_payment", "created_by_link": tx.payment_created, "date": p.payment_date, "amount": float(p.amount),
                             "payee": p.vendor.name if p.vendor else p.payee_label,
                             "items": [{"id": str(a.bill_id), "number": bills[a.bill_id].bill_number, "date": bills[a.bill_id].bill_date,
                                        "vendor": bills[a.bill_id].vendor.name, "amount": float(a.amount)} for a in p.allocations if a.bill_id in bills]}
    if tx.status == "unclassified":
        if tx.amount > 0:
            sg = await bm.suggestions(db, tx)
            sg["method_code"] = bm.guess_method(tx.description)
        else:
            sg = await bm.withdrawal_suggestions(db, tx)
        out["suggestions"] = sg
    return out


@router.get("/transactions/{tx_id}/withdrawal-suggestions")
async def tx_withdrawal_suggestions(tx_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    return await bm.withdrawal_suggestions(db, await _get_tx(tx_id, db))


@router.get("/vendors/{vendor_id}/open-bills")
async def vendor_open_bills(vendor_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    return await bm.open_bills_oldest_first(db, vendor_id)


@router.put("/transactions/{tx_id}/vendor", response_model=TransactionOut)
async def set_transaction_vendor(tx_id: uuid.UUID, payload: VendorAssignIn, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    """Attribue le fournisseur d'un retrait ; avec remember, les autres retraits du meme beneficiaire suivent."""
    tx = await _get_tx(tx_id, db)
    if tx.status == "matched":
        raise HTTPException(status_code=400, detail="Annulez d'abord l'association")
    tx.vendor_id = payload.vendor_id
    tx.vendor_source = "manual" if payload.vendor_id else None
    if payload.vendor_id and payload.remember:
        await _remember_vendor(db, tx.payee or tx.description, payload.vendor_id, payload.category_id)
    await db.commit()
    if payload.vendor_id and payload.auto_match and tx.amount < 0 and tx.status == "unclassified":
        sug = await bm.best_exact_withdrawal(db, tx)
        if sug:
            try:
                await match_withdrawal(tx.id, _withdrawal_body(sug), db)
                tx = await _get_tx(tx_id, db)
                tx.auto_matched = True
                await db.commit()
            except HTTPException:
                await db.rollback()
                tx = await _get_tx(tx_id, db)
    return await _tx_out(tx, db)


# ── Regles beneficiaire -> compagnie ─────────────────────────────────────────

@router.get("/rules")
async def list_rules(db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    rules = (await db.execute(select(BankPayeeRule).order_by(BankPayeeRule.payee_label))).scalars().all()
    names = dict((await db.execute(select(Company.id, Company.name))).all())
    out = []
    for r in rules:
        n = 0
        col, val = (BankTransaction.company_id, r.company_id) if r.company_id else (BankTransaction.vendor_id, r.vendor_id)
        for t in (await db.execute(select(BankTransaction.payee).where(col == val))).scalars().all():
            n += bm.payee_key(t) == r.payee_key
        vendor = await db.get(Vendor, r.vendor_id) if r.vendor_id else None
        out.append({"id": str(r.id), "payee": r.payee_label, "company_id": str(r.company_id) if r.company_id else None,
                    "company_name": names.get(r.company_id, ""), "vendor_id": str(r.vendor_id) if r.vendor_id else None,
                    "vendor_name": vendor.name if vendor else None, "transactions": n, "created_at": r.created_at})
    return out


@router.put("/rules/{rule_id}")
async def update_rule(rule_id: uuid.UUID, payload: RuleUpdate, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    rule = await db.get(BankPayeeRule, rule_id)
    if not rule:
        raise HTTPException(status_code=404, detail="Règle introuvable")
    await _remember(db, rule.payee_label, payload.company_id)
    await db.commit()
    return {"ok": True}


@router.delete("/rules/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_rule(rule_id: uuid.UUID, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    """Supprime la regle ; les lignes non classees reconnues par elle redeviennent sans compagnie."""
    rule = await db.get(BankPayeeRule, rule_id)
    if not rule:
        raise HTTPException(status_code=404, detail="Règle introuvable")
    for t in (await db.execute(select(BankTransaction).where(
        BankTransaction.status == "unclassified", BankTransaction.company_source == "rule"))).scalars().all():
        if bm.payee_key(t.payee) == rule.payee_key:
            t.company_id, t.company_source = None, None
    await db.delete(rule)
    await db.commit()


# ── Graphique (entrees / sorties / solde) ────────────────────────────────────

@router.get("/chart")
async def bank_chart(
    granularity: str = "month",
    offset: int = 0,
    account_id: uuid.UUID | None = None,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Entrees, sorties et solde regroupes par periode. Sans account_id : tous les comptes
    bancaires actifs (pas les cartes de credit ni la petite caisse, comme le Solde bancaire)."""
    if granularity not in GRANULARITIES:
        raise HTTPException(status_code=400, detail=f"Regroupement invalide (attendu : {', '.join(GRANULARITIES)})")
    if offset < 0:
        raise HTTPException(status_code=400, detail="offset doit etre positif")
    if account_id:
        accounts = [await _get_account(account_id, db)]
    else:
        accounts = (await db.execute(
            select(BankAccount).where(BankAccount.is_active == True, BankAccount.account_type == "bank")
        )).scalars().all()

    series = []
    for acc in accounts:
        tx = (await db.execute(
            select(BankTransaction.posted_date, BankTransaction.amount)
            .where(BankTransaction.account_id == acc.id, BankTransaction.status != "excluded")
        )).all()
        out = await _account_out(acc, db)
        series.append(AccountSeries(
            transactions=[(d, a) for d, a in tx],
            balance=Decimal(str(out.bank_balance)) if out.bank_balance is not None else None,
            balance_date=out.bank_balance_date,
        ))

    fiscal_start = int(await get_setting(db, "fiscal_year_start_month") or 1)
    return build_chart(series, granularity, date.today(), offset, fiscal_start)
