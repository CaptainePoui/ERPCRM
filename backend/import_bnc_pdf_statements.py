"""
Script ponctuel (2026-10-15, TASK-042.7) : importe dans la Banque les releves BNC en PDF (Releve BNC.rar de Philippe)
pour la periode qui n'y est pas encore : du 2019-09-13 au 2025-09-30 (ERPCRM a deja le releve CSV depuis le 2025-10-01).

- Lecture : bnc_statement_pdf.py (local, OCR seulement pour les 3 releves a police illisible de mai, aout et sept. 2025).
  Chaque ligne verifiee contre le solde imprime, chaque mois contre le resume de la banque, et chaque mois enchaine sur
  le precedent (solde de fermeture = solde precedent du suivant) -- sauf novembre 2021, releve absent (signale).
- Verification croisee faite avant : sur oct. 2025 -> sept. 2026, les PDF et le CSV deja importe ont les memes
  transactions (seule difference : frais d'oct. 2025 en une ligne de 10,50 $ dans le PDF, deux lignes 7,00 + 3,50 dans le CSV).
- Fichiers en double ignores (« RC 2021 11 31 » = octobre 2021 ; mars 2023 en deux exemplaires).
- Description BNC separee comme dans le CSV : type de transaction (« COMPTE DIVERS ») + beneficiaire (« HAMAK MARKETING ») ;
  une reference (CPI..., *787878) va dans reference, pas dans beneficiaire.
- Un import (BankStatementImport) par releve, PDF d'origine garde dans storage/bank_statements ; cle de doublon
  comme l'import de fichier (date|montant|description|rang). Lignes a 0,00 $ ignorees.
- AUCUNE association ni regle appliquee ici, rien confie a l'IA : la liaison aux paiements se fait ensuite, a part,
  apres revue avec Philippe. Tout ou rien.

Usage: venv/bin/python3 import_bnc_pdf_statements.py <dossier des PDF> [--apply]
"""
import asyncio
import hashlib
import re
import shutil
import sys
from datetime import date
from decimal import Decimal
from pathlib import Path

from sqlalchemy import select
from app.core.database import AsyncSessionLocal
import app.models  # noqa: F401
from app.core.bank_statement_parser import _norm
from app.models.bank_account import BankAccount, BankTransaction, BankStatementImport
from app.models.user import User
from bnc_statement_pdf import parse

UNTIL = date(2025, 9, 30)               # a partir du 2025-10-01 : deja dans ERPCRM (releve CSV)
LOG_USER_EMAIL = "philippe@simpleip.tel"
STATEMENTS_DIR = Path(__file__).resolve().parent / "storage" / "bank_statements"
TYPES = sorted([
    "ASSURANCE", "CHEQUE NO", "COMPTE A PAYER", "COMPTE DIVERS", "COMPTES DEBITEURS", "DEPOT MOBILE", "DPA ENTREPRISE",
    "FRAIS FORFAIT", "FRAIS TRANSACTION", "PERCEPTION DE CPTE", "PMTS ENTREPRISES", "VIREMENT INTERAC",
    "FACTURATION MENSUELLE", "CREDIT VISA", "DEPOT M/C", "VIRCR INTERAC", "VIRDT INTERAC", "MOBILE VIRCR IT",
    "MOBILE VIRDT IT", "FACTURE TELEPHONE", "PMT FACTURE ENT.", "INTERETS DECOUVERT", "TRANSFERT",
    "CHEQUE CLIENT COMM.", "MOBILE PAIEM/FAC"], key=len, reverse=True)
REF = re.compile(r"^(CPI\d+|\*\d+|\d+)$")


def split(desc: str):
    for t in TYPES:
        if desc == t or desc.startswith(t + " "):
            rest = desc[len(t):].strip()
            if not rest:
                return t, None, None
            if REF.match(rest):
                return t, None, rest
            return t, rest, None
    return desc, None, None


async def main(folder: Path, apply: bool):
    stmts = [parse(f) for f in sorted(folder.glob("RC *.pdf"))]
    bad = [s for s in stmts if s["errors"]]
    if bad:
        raise SystemExit("ARRET -- releves illisibles : " + "; ".join(f"{s['file']} {s['errors'][:2]}" for s in bad))
    by_period, skipped = {}, []
    for s in stmts:
        k = (s["start"], s["end"])
        if k in by_period:
            skipped.append(f"{s['file']} (meme periode que {by_period[k]['file']})")
            continue
        by_period[k] = s
    ordered = [by_period[k] for k in sorted(by_period)]
    gaps = [f"{a['end']} -> {b['start']} ({a['closing']} / {b['opening']})" for a, b in zip(ordered, ordered[1:])
            if Decimal(a["closing"]) != Decimal(b["opening"])]
    todo = [s for s in ordered if date.fromisoformat(s["end"]) <= UNTIL]

    async with AsyncSessionLocal() as db:
        acc = (await db.execute(select(BankAccount).where(BankAccount.account_last4 == "1228"))).scalar_one()
        user = (await db.execute(select(User).where(User.email == LOG_USER_EMAIL))).scalar_one()
        existing = set((await db.execute(select(BankTransaction.dedup_key).where(BankTransaction.account_id == acc.id))).scalars())
        n_tx = n_dup = n_zero = 0
        dep = wd = Decimal(0)
        for s in todo:
            lines, seen = [], {}
            for l in s["lines"]:
                amount = Decimal(l["amount"])
                if amount == 0:
                    n_zero += 1
                    continue
                kind, payee, ref = split(l["description"])
                base = f"{l['date']}|{amount}|{_norm(kind)}"
                seen[base] = seen.get(base, 0) + 1
                key = "h:" + hashlib.sha256(f"{base}|{seen[base]}".encode()).hexdigest()
                if key in existing:
                    n_dup += 1
                    continue
                lines.append((l, amount, kind, payee, ref, key))
            imp = BankStatementImport(account_id=acc.id, filename=s["file"][:255], file_format="pdf",
                                      period_start=date.fromisoformat(s["start"]), period_end=date.fromisoformat(s["end"]),
                                      rows_total=len(s["lines"]), rows_new=len(lines), rows_duplicate=len(s["lines"]) - len(lines),
                                      ledger_balance=Decimal(s["closing"]), ledger_balance_date=date.fromisoformat(s["end"]),
                                      imported_by=user.id)
            db.add(imp)
            await db.flush()
            for l, amount, kind, payee, ref, key in lines:
                db.add(BankTransaction(account_id=acc.id, import_id=imp.id, posted_date=date.fromisoformat(l["date"]),
                                       amount=amount, description=kind, payee=payee, reference=ref, dedup_key=key))
                n_tx += 1
                if amount > 0:
                    dep += amount
                else:
                    wd += amount
            if apply:
                STATEMENTS_DIR.mkdir(parents=True, exist_ok=True)
                dest = STATEMENTS_DIR / f"{imp.id}_{re.sub(r'[^A-Za-z0-9._-]+', '_', s['file'])[-100:]}"
                shutil.copyfile(folder / s["file"], dest)
                imp.stored_path = str(dest)
        print(f"Releves : {len(todo)} importes ({todo[0]['start']} -> {todo[-1]['end']}), ignores en double : {skipped}")
        print(f"Trous dans l'enchainement des soldes : {gaps}")
        print(f"Transactions : {n_tx} nouvelles (depots {dep} $, retraits {wd} $), {n_dup} deja presentes, {n_zero} a 0,00 $")
        print(f"OCR : {[s['file'] for s in todo if s.get('ocr')]}")
        if apply:
            await db.commit()
            print("APPLIQUE")
        else:
            await db.rollback()
            print("ESSAI SEULEMENT (rien d'ecrit) -- relancer avec --apply")


if __name__ == "__main__":
    asyncio.run(main(Path(sys.argv[1]), "--apply" in sys.argv))
