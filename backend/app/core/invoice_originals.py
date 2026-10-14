"""PDF d'origine des factures importees (TASK-005.23, 2026-10-14).

Les factures de l'ancien logiciel (et de QuickBooks, reprises dedans) gardent le document exact que le client a recu :
fichier dans storage/invoice_originals/ (hors du dossier public /uploads, inclus dans la sauvegarde), nom dans
invoices.original_pdf. Quand il existe, c'est lui que le portail et le bouton PDF donnent ; le PDF genere par ERPCRM
reste disponible (?generated=1). Philippe : « oui ce serait cool et on les a ».
"""
from pathlib import Path

ORIGINALS_DIR = Path(__file__).resolve().parents[2] / "storage" / "invoice_originals"


def original_bytes(inv) -> bytes | None:
    if not inv or not inv.original_pdf or inv.status != "payee":
        return None          # rattache seulement aux factures reglees ; si ce n'est plus le cas, son solde serait faux
    p = ORIGINALS_DIR / Path(inv.original_pdf).name      # jamais de chemin fourni de l'exterieur
    return p.read_bytes() if p.is_file() else None
