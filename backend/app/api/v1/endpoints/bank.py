import re
import uuid
from decimal import Decimal
from datetime import datetime, date
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
from app.models.bank_account import BankAccount, BankStatementImport, BankTransaction
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
    model_config = {"from_attributes": True}


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
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Lit un releve OFX/QFX/QBO ou CSV. dry_run=true : apercu sans rien enregistrer
    (nouvelles lignes vs deja importees) ; dry_run=false : importe les nouvelles lignes."""
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

    # Le numero du fichier doit finir par les 4 chiffres du compte choisi -- avertissement seulement
    file_digits = re.sub(r"\D", "", st.account_number or "")
    mismatch = bool(acc.account_last4 and file_digits and not file_digits.endswith(acc.account_last4))

    result = {
        "file_format": st.file_format,
        "period_start": st.period_start,
        "period_end": st.period_end,
        "rows_total": len(st.lines),
        "rows_new": len(new_lines),
        "rows_duplicate": len(st.lines) - len(new_lines),
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

    await db.commit()
    result["import_id"] = imp.id
    return result


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
    result = await db.execute(q.order_by(BankTransaction.posted_date.desc(), BankTransaction.created_at.desc()))
    return result.scalars().all()


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
