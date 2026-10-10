"""succursales compagnies liees a une maison mere

TASK-002.4 (2026-10-10) : une succursale est une vraie compagnie liee a sa maison mere (plusieurs niveaux) ;
facturee a elle-meme sauf si on choisit une de ses maisons meres (bill_to_company_id) ; chaque adresse 911 du tenant
(company_sites) peut etre liee a la compagnie succursale dont elle prend l'adresse (branch_company_id).
Donnees : chaque ancienne « succursale » non principale devient une compagnie succursale de sa compagnie
(Maison Le Passeur -> Oxygene : ses factures, sa facturation periodique, ses paiements et les depots bancaires
qui les ont payes la suivent ; Simple IP inc. -> Simple IP Rose). Rien n'est efface.

Revision ID: 77df140c3ac4
Revises: 2ed9dd39f015
Create Date: 2026-10-10 11:40:29.883491

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '77df140c3ac4'
down_revision: Union[str, Sequence[str], None] = '2ed9dd39f015'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


from sqlalchemy.dialects.postgresql import UUID

MARK = "Créée depuis la succursale « {} » (TASK-002.4)"


def upgrade() -> None:
    for table, col in (("companies", "parent_company_id"), ("companies", "bill_to_company_id"), ("company_sites", "branch_company_id")):
        op.add_column(table, sa.Column(col, UUID(as_uuid=True), nullable=True))
        op.create_foreign_key(f"fk_{table}_{col}", table, "companies", [col], ["id"], ondelete="SET NULL")
        op.create_index(f"ix_{table}_{col}", table, [col])

    conn = op.get_bind()
    sites = conn.execute(sa.text(
        "SELECT s.id, s.company_id, s.label, s.civic_number, s.street_name, s.unit, s.city, s.province, s.postal_code, "
        "s.country, s.billing_contact_id, s.billing_email, s.is_active FROM company_sites s WHERE NOT s.is_primary ORDER BY s.label"
    )).mappings().all()
    for st in sites:
        new_id = conn.execute(sa.text(
            "INSERT INTO entities (id, entity_type, created_at, updated_at) VALUES (gen_random_uuid(), 'company', now(), now()) RETURNING id"
        )).scalar()
        conn.execute(sa.text(
            "INSERT INTO companies (id, name, is_active, currency, exchange_rate, is_taxable, tax_country, tax_province, tps_rate, "
            "tvq_rate, tvq_applicable, sipv_enabled, internal_manager_id, notes_internal, parent_company_id) "
            "SELECT :nid, :label, :active, currency, exchange_rate, is_taxable, tax_country, tax_province, tps_rate, tvq_rate, "
            "tvq_applicable, false, internal_manager_id, :note, id FROM companies WHERE id = :pid"
        ), {"nid": new_id, "label": st["label"], "active": st["is_active"], "note": MARK.format(st["label"]), "pid": st["company_id"]})
        street = f"{st['civic_number']} {st['street_name']}".strip()
        conn.execute(sa.text(
            "INSERT INTO addresses (id, entity_id, address_type, street_1, street_2, city, province, postal_code, country, is_primary, is_active) "
            "VALUES (gen_random_uuid(), :e, 'service', :s1, :s2, :city, :prov, :pc, :ctry, true, true)"
        ), {"e": new_id, "s1": street, "s2": st["unit"], "city": st["city"], "prov": st["province"], "pc": st["postal_code"], "ctry": st["country"] or "CA"})
        if st["billing_contact_id"]:
            conn.execute(sa.text(
                "INSERT INTO contact_companies (id, contact_id, company_id, is_primary, is_active, email) "
                "VALUES (gen_random_uuid(), :c, :co, false, true, :em)"
            ), {"c": st["billing_contact_id"], "co": new_id, "em": st["billing_email"]})
        elif st["billing_email"]:
            conn.execute(sa.text(
                "INSERT INTO communication_channels (id, entity_id, channel_type, value, label, is_primary, is_active) "
                "VALUES (gen_random_uuid(), :e, 'email', :v, 'Facturation', true, true)"
            ), {"e": new_id, "v": st["billing_email"]})
        conn.execute(sa.text("UPDATE company_sites SET branch_company_id = :n WHERE id = :s"), {"n": new_id, "s": st["id"]})
        # Ce qui etait facture a la succursale la suit : factures, facturation periodique, paiements qui ne paient
        # que ses factures, et les depots bancaires relies a ces paiements.
        conn.execute(sa.text("UPDATE invoices SET company_id = :n WHERE site_id = :s"), {"n": new_id, "s": st["id"]})
        conn.execute(sa.text("UPDATE company_recurring_billings SET company_id = :n WHERE site_id = :s"), {"n": new_id, "s": st["id"]})
        pay_ids = [r[0] for r in conn.execute(sa.text(
            "SELECT cp.id FROM client_payments cp WHERE EXISTS (SELECT 1 FROM payment_allocations pa WHERE pa.payment_id = cp.id) "
            "AND NOT EXISTS (SELECT 1 FROM payment_allocations pa JOIN invoices i ON i.id = pa.invoice_id "
            "WHERE pa.payment_id = cp.id AND i.company_id <> :n)"
        ), {"n": new_id})]
        if pay_ids:
            conn.execute(sa.text("UPDATE client_payments SET company_id = :n WHERE id = ANY(:ids)"), {"n": new_id, "ids": pay_ids})
            conn.execute(sa.text("UPDATE bank_transactions SET company_id = :n WHERE client_payment_id = ANY(:ids)"), {"n": new_id, "ids": pay_ids})
        conn.execute(sa.text(
            "INSERT INTO entity_logs (id, entity_id, action, description, created_at, object_type, object_id, source) "
            "VALUES (gen_random_uuid(), :n, 'created', :d, now(), 'companies', :nid, 'automatique')"
        ), {"n": new_id, "nid": str(new_id), "d": MARK.format(st["label"]) + f" — {len(pay_ids)} paiement(s) suivi(s)"})


def downgrade() -> None:
    conn = op.get_bind()
    made = conn.execute(sa.text(
        "SELECT s.id site_id, s.company_id holder, c.id cid, c.parent_company_id parent FROM company_sites s "
        "JOIN companies c ON c.id = s.branch_company_id WHERE c.notes_internal LIKE 'Créée depuis la succursale%(TASK-002.4)'"
    )).mappings().all()
    for m in made:
        back = m["parent"] or m["holder"]
        conn.execute(sa.text("UPDATE invoices SET company_id = :b WHERE company_id = :c"), {"b": back, "c": m["cid"]})
        conn.execute(sa.text("UPDATE company_recurring_billings SET company_id = :b WHERE company_id = :c"), {"b": back, "c": m["cid"]})
        conn.execute(sa.text("UPDATE bank_transactions SET company_id = :b WHERE company_id = :c"), {"b": back, "c": m["cid"]})
        conn.execute(sa.text("UPDATE client_payments SET company_id = :b WHERE company_id = :c"), {"b": back, "c": m["cid"]})
        conn.execute(sa.text("UPDATE company_sites SET branch_company_id = NULL WHERE id = :s"), {"s": m["site_id"]})
        conn.execute(sa.text("DELETE FROM entity_logs WHERE entity_id = :c"), {"c": m["cid"]})
        conn.execute(sa.text("DELETE FROM entities WHERE id = :c"), {"c": m["cid"]})   # compagnie, adresse, liens : en cascade
    for table, col in (("company_sites", "branch_company_id"), ("companies", "bill_to_company_id"), ("companies", "parent_company_id")):
        op.drop_index(f"ix_{table}_{col}", table)
        op.drop_constraint(f"fk_{table}_{col}", table, type_="foreignkey")
        op.drop_column(table, col)

