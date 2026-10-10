"""compagnie du proprietaire et compagnie test

TASK-002.5 (2026-10-10) : une seule compagnie « propriétaire » (celle qui possede le serveur ; jamais facturee) porte les
coordonnees imprimees sur les PDF -- plus de copie dans app_settings (pdf_seller_*) ; numeros de TPS / TVQ sur la fiche.
Simple IP inc. devient la proprietaire (adresse confirmee par Philippe : 11208, rue Ontario Est, Montreal-Est
(Quebec) H1B 1J8). « Compagnie test » (11206, rue Ontario Est) recoit les 4 factures d'essai et la facturation
periodique d'essai de Simple IP inc., avec leurs paiements. Rien n'est efface (les cles pdf_seller_* sont remises au
retour arriere).

Revision ID: af57ce229263
Revises: 164c1a7e4620
Create Date: 2026-10-10 11:55:48.161045

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'af57ce229263'
down_revision: Union[str, Sequence[str], None] = '164c1a7e4620'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


TEST_NOTE = "Compagnie d'essai (TASK-002.5) : factures et téléphonie d'essai, tenant T1000."
SELLER_KEYS = ("pdf_seller_name", "pdf_seller_address", "pdf_seller_tps", "pdf_seller_tvq", "pdf_seller_phone", "pdf_seller_email")


def upgrade() -> None:
    op.add_column("companies", sa.Column("is_owner", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("companies", sa.Column("tps_number", sa.String(40), nullable=True))
    op.add_column("companies", sa.Column("tvq_number", sa.String(40), nullable=True))
    op.create_index("uq_companies_one_owner", "companies", ["is_owner"], unique=True, postgresql_where=sa.text("is_owner"))

    conn = op.get_bind()
    owner = conn.execute(sa.text("SELECT id FROM companies WHERE name = 'Simple IP inc.'")).scalar()
    if not owner:
        return
    get = lambda k: conn.execute(sa.text("SELECT value FROM app_settings WHERE key = :k"), {"k": k}).scalar()
    conn.execute(sa.text("UPDATE companies SET is_owner = true, tps_number = :tps, tvq_number = :tvq, "
                         "office_phone = COALESCE(office_phone, :ph) WHERE id = :o"),
                 {"tps": get("pdf_seller_tps"), "tvq": get("pdf_seller_tvq"), "ph": get("pdf_seller_phone"), "o": owner})
    conn.execute(sa.text("UPDATE addresses SET street_1 = '11208 rue Ontario Est', city = 'Montréal-Est', province = 'QC', "
                         "postal_code = 'H1B 1J8' WHERE entity_id = :o AND address_type = 'billing'"), {"o": owner})
    email = get("pdf_seller_email")
    if email and not conn.execute(sa.text("SELECT 1 FROM communication_channels WHERE entity_id = :o AND channel_type = 'email' "
                                          "AND lower(value) = lower(:v)"), {"o": owner, "v": email}).first():
        conn.execute(sa.text("INSERT INTO communication_channels (id, entity_id, channel_type, value, label, is_primary, is_active) "
                             "VALUES (gen_random_uuid(), :o, 'email', :v, 'Facturation', true, true)"), {"o": owner, "v": email})
    conn.execute(sa.text("DELETE FROM app_settings WHERE key = ANY(:k)"), {"k": list(SELLER_KEYS)})

    # Compagnie test : recoit les essais de facturation de Simple IP inc.
    test = conn.execute(sa.text("INSERT INTO entities (id, entity_type, created_at, updated_at) "
                                "VALUES (gen_random_uuid(), 'company', now(), now()) RETURNING id")).scalar()
    conn.execute(sa.text("INSERT INTO companies (id, name, is_active, currency, exchange_rate, is_taxable, tax_country, tax_province, "
                         "tps_rate, tvq_rate, tvq_applicable, sipv_enabled, is_owner, internal_manager_id, notes_internal) "
                         "SELECT :t, 'Compagnie test', true, currency, exchange_rate, is_taxable, tax_country, tax_province, "
                         "tps_rate, tvq_rate, tvq_applicable, false, false, internal_manager_id, :n FROM companies WHERE id = :o"),
                 {"t": test, "n": TEST_NOTE, "o": owner})
    for t in ("billing", "service"):
        conn.execute(sa.text("INSERT INTO addresses (id, entity_id, address_type, street_1, city, province, postal_code, country, "
                             "is_primary, is_active) VALUES (gen_random_uuid(), :e, :t, '11206 rue Ontario Est', 'Montréal-Est', "
                             "'QC', 'H1B 1J8', 'CA', true, true)"), {"e": test, "t": t})
    conn.execute(sa.text("UPDATE invoices SET company_id = :t WHERE company_id = :o"), {"t": test, "o": owner})
    conn.execute(sa.text("UPDATE company_recurring_billings SET company_id = :t WHERE company_id = :o"), {"t": test, "o": owner})
    conn.execute(sa.text("UPDATE client_payments SET company_id = :t WHERE company_id = :o"), {"t": test, "o": owner})
    conn.execute(sa.text("UPDATE bank_transactions SET company_id = :t WHERE company_id = :o"), {"t": test, "o": owner})
    conn.execute(sa.text("INSERT INTO entity_logs (id, entity_id, action, description, created_at, object_type, object_id, source) "
                         "VALUES (gen_random_uuid(), :t, 'created', :d, now(), 'companies', :ts, 'automatique')"),
                 {"t": test, "ts": str(test), "d": "Compagnie test créée ; factures et facturation périodique d'essai de Simple IP inc. déplacées ici (TASK-002.5)"})


def downgrade() -> None:
    conn = op.get_bind()
    owner = conn.execute(sa.text("SELECT id, name, tps_number, tvq_number, office_phone FROM companies WHERE is_owner")).mappings().first()
    test = conn.execute(sa.text("SELECT id FROM companies WHERE notes_internal = :n"), {"n": TEST_NOTE}).scalar()
    if owner and test:
        for table in ("invoices", "company_recurring_billings", "client_payments", "bank_transactions"):
            conn.execute(sa.text(f"UPDATE {table} SET company_id = :o WHERE company_id = :t"), {"o": owner["id"], "t": test})
        conn.execute(sa.text("DELETE FROM entity_logs WHERE entity_id = :t"), {"t": test})
        conn.execute(sa.text("DELETE FROM entities WHERE id = :t"), {"t": test})
    if owner:
        email = conn.execute(sa.text("SELECT value FROM communication_channels WHERE entity_id = :o AND channel_type = 'email' "
                                     "ORDER BY is_primary DESC LIMIT 1"), {"o": owner["id"]}).scalar()
        addr = conn.execute(sa.text("SELECT street_1, city, province, postal_code FROM addresses WHERE entity_id = :o "
                                    "AND address_type = 'billing' LIMIT 1"), {"o": owner["id"]}).mappings().first()
        vals = {"pdf_seller_name": owner["name"], "pdf_seller_tps": owner["tps_number"] or "", "pdf_seller_tvq": owner["tvq_number"] or "",
                "pdf_seller_phone": owner["office_phone"] or "", "pdf_seller_email": email or "",
                "pdf_seller_address": f"{addr['street_1']}\n{addr['city']} ({addr['province']}) {addr['postal_code']}" if addr else ""}
        for k, v in vals.items():
            conn.execute(sa.text("INSERT INTO app_settings (key, value) VALUES (:k, :v) ON CONFLICT (key) DO UPDATE SET value = :v"), {"k": k, "v": v})
    op.drop_index("uq_companies_one_owner", "companies")
    op.drop_column("companies", "tvq_number")
    op.drop_column("companies", "tps_number")
    op.drop_column("companies", "is_owner")

