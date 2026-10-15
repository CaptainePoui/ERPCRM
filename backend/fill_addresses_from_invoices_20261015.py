"""
Script ponctuel (2026-10-15) : Philippe -- « tu as les adresses sur les factures, tu t'assures que les adresses sont
ajoutées à toutes les entreprises ». Pour chaque compagnie SANS adresse active : adresse de facturation lue sur le PDF
de sa facture la plus recente de l'ancien logiciel (zoho_invoice_pdf.py, deja lu dans invoices.json) ; ajout seulement,
rien n'est ecrase. Usage: venv/bin/python3 fill_addresses_from_invoices_20261015.py [--apply]
"""
import asyncio, json, re, sys
from sqlalchemy import select, exists
from app.core.database import AsyncSessionLocal
import app.models  # noqa: F401
from app.models.address import Address, AddressType
from app.models.company import Company
from app.models.entity_log import EntityLog
from app.models.invoice import Invoice
from app.models.user import User
from import_zoho_history_pdf import pdf_address

EXTRA = {"ScopServ": ({"street_1": "580, boul. du Curé-Boivin", "street_2": "Suite 101", "city": "Boisbriand", "province": "QC",
                         "postal_code": "J7G 2A7", "country": "CA"}, "l'en-tête de ses propres factures (F_36687)")}
PDFS = "/tmp/claude-1000/-home-simpleip-erpcrm/d52253e8-537d-4b0f-bc5d-4dcfc982b16f/scratchpad/invoices.json"


async def main(apply):
    pdf = {re.sub(r"^nº\s*", "", x["number"]): x for x in json.load(open(PDFS))}
    async with AsyncSessionLocal() as db:
        user = (await db.execute(select(User).where(User.email == "philippe@simpleip.tel"))).scalar_one()
        comps = (await db.execute(select(Company).where(~exists().where(Address.entity_id == Company.id, Address.is_active.is_(True))).order_by(Company.name))).scalars().all()
        for c in comps:
            invs = (await db.execute(select(Invoice).where(Invoice.company_id == c.id).order_by(Invoice.issue_date.desc()))).scalars().all()
            addr, src = None, None
            for i in invs:
                if i.number in pdf and (a := pdf_address(pdf[i.number])):
                    addr, src = a, i.number; break
            if not addr and c.name in EXTRA:
                addr, src = EXTRA[c.name]
            if not addr:
                print(f"--  {c.name} : {len(invs)} facture(s), aucune adresse lisible"); continue
            print(f"OK  {c.name} <- {src} : {addr['street_1']}{', ' + addr['street_2'] if addr['street_2'] else ''}, {addr['city']} {addr['postal_code']}")
            db.add(Address(entity_id=c.id, address_type=AddressType.billing, is_primary=True, **addr))
            db.add(EntityLog(entity_id=c.id, user_id=user.id, action="field_change", field_name="adresse",
                             description=f"Adresse de facturation ajoutée d'après {src if src.startswith('l') else 'la facture ' + src + ' de l' + chr(39) + 'ancien logiciel'}"))
        if apply:
            await db.commit(); print("APPLIQUE")
        else:
            await db.rollback(); print("ESSAI SEULEMENT")

asyncio.run(main("--apply" in sys.argv))
