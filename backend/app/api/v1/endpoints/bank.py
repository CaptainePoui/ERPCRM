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
    await db.commit()
    result["import_id"] = imp.id
    new_ids = list((await db.execute(select(BankTransaction.id).where(BankTransaction.import_id == imp.id))).scalars().all())
    result["rows_auto_matched"] = await _auto_associate(db, new_ids)
    result["rows_sent_to_ai"] = await _queue_for_ai(db, new_ids)
    return result


async def _auto_associate(db: AsyncSession, tx_ids: list) -> int:
    """Associe les depots dont la suggestion est unique et exacte (compagnie reconnue par une regle
    ou attribuee, ET un seul paiement en attente ou une seule facture ouverte au solde exact).
    Rien d'approximatif, rien venant de l'IA ; chaque association reste annulable."""
    n = 0
    for tid in tx_ids:
        tx = await db.get(BankTransaction, tid)
        if not tx or tx.status != "unclassified" or tx.amount <= 0 or not tx.company_id:
            continue
        sug = await bm.best_exact(db, tx)
        if not sug:
            continue
        body = MatchIn(client_payment_id=sug["id"]) if sug["kind"] == "payment" else MatchIn(
            allocations=[AllocIn(invoice_id=sug["id"], amount=sug["balance"])])
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
    return [await _tx_out(t, db) for t in txs]


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
    if rule:
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
            sug = await bm.best_exact(db, tx)
            if not sug:
                skipped += 1
                continue
            await db.commit()
            body = MatchIn(client_payment_id=sug["id"]) if sug["kind"] == "payment" else MatchIn(
                allocations=[AllocIn(invoice_id=sug["id"], amount=sug["balance"])])
            await match_transaction(tx.id, body, db)
            done += 1
        else:
            skipped += 1
    await db.commit()
    return {"done": done, "skipped": skipped}


# ── Regles beneficiaire -> compagnie ─────────────────────────────────────────

@router.get("/rules")
async def list_rules(db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    rules = (await db.execute(select(BankPayeeRule).order_by(BankPayeeRule.payee_label))).scalars().all()
    names = dict((await db.execute(select(Company.id, Company.name))).all())
    out = []
    for r in rules:
        n = 0
        for t in (await db.execute(select(BankTransaction.payee).where(BankTransaction.company_id == r.company_id))).scalars().all():
            n += bm.payee_key(t) == r.payee_key
        out.append({"id": str(r.id), "payee": r.payee_label, "company_id": str(r.company_id),
                    "company_name": names.get(r.company_id, ""), "transactions": n, "created_at": r.created_at})
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
