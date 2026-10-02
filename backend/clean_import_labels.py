"""
Script ponctuel (2026-10-02, TASK-005.11) : retire les mentions de Zoho visibles dans ERPCRM
(demande de Philippe : « je n'aime pas que tu parles de zoho, j'essaie de m'en debarrasser »).

- Encaissements importes (source zoho_import, code interne inchange) : mode « Historique Zoho Books »
  -> « Paiement antérieur » ; note « Paiement historique de la facture X (Importée de Zoho Books). »
  -> « Paiement antérieur de la facture X. »
- Notes de factures « Importée de Zoho Books (statut Zoho : ...). » -> vide (elles s'imprimaient sur
  le PDF client et n'apprennent rien).
- Notes d'avoirs « Importé de Zoho Books (avoir CN-x sur INV-y, ...). » -> « Avoir sur la facture INV-y. »
- Le Journal (historique des modifications) n'est pas reecrit : c'est une trace d'audit.
Toute autre note contenant « Zoho » est signalee, jamais modifiee. Tout ou rien.

Usage: venv/bin/python3 clean_import_labels.py [--apply]
"""
import asyncio
import re
import sys

from sqlalchemy import select
from app.core.database import AsyncSessionLocal
import app.models  # noqa: F401
from app.models.invoice import Invoice
from app.models.client_payment import ClientPayment

INV_NOTE = re.compile(r"^Importée de Zoho Books \(statut Zoho : [A-Za-z]+\)\.$")
CN_NOTE = re.compile(r"^Importé de Zoho Books \(avoir CN-\d+ sur ((?:INV-\d+(?:, )?)+)\)\.$")
PAY_NOTE = re.compile(r"^Paiement historique de la facture (\S+) \(Importée de Zoho Books\)\.$")


async def main(apply: bool):
    pay = inv_cleared = cn_rewritten = 0
    left = []
    async with AsyncSessionLocal() as db:
        for cp in (await db.execute(select(ClientPayment).where(ClientPayment.source == "zoho_import"))).scalars():
            if cp.method_name == "Historique Zoho Books":
                cp.method_name = "Paiement antérieur"
            m = PAY_NOTE.match(cp.notes or "")
            if m:
                cp.notes = f"Paiement antérieur de la facture {m.group(1)}."
            if "zoho" in (cp.method_name + (cp.notes or "")).lower():
                left.append(f"encaissement {cp.id} : {cp.method_name} / {cp.notes}")
            pay += 1
        for inv in (await db.execute(select(Invoice).where(Invoice.notes.ilike("%zoho%")))).scalars():
            if INV_NOTE.match(inv.notes):
                inv.notes = None
                inv_cleared += 1
            elif (m := CN_NOTE.match(inv.notes)):
                nums = m.group(1)
                inv.notes = f"Avoir sur {'les factures' if ',' in nums else 'la facture'} {nums}."
                cn_rewritten += 1
            else:
                left.append(f"{inv.number} : {inv.notes}")
        if left or not apply:
            await db.rollback()
        else:
            await db.commit()
    print(f"{pay} encaissements renommés « Paiement antérieur », {inv_cleared} notes de facture vidées, {cn_rewritten} notes d'avoir réécrites")
    for x in left:
        print("  NON TRAITÉ :", x)
    print("ÉCRIT" if apply and not left else ("RIEN ÉCRIT (cas non traités ci-dessus)" if left else "ESSAI À BLANC — rien n'a été écrit (--apply pour écrire)"))


if __name__ == "__main__":
    asyncio.run(main("--apply" in sys.argv))
