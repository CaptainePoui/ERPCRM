"""vrais paiements elavon retour a simple ip

TASK-002.5 (2026-10-10), correction de af57ce229263 (Philippe : « les 4 factures c'est des vraies, on faisait des tests de
connexion Elavon pour les paiements de carte de credit… je les ai vraiment payees ; les seules qui ne sont pas vraies
c'est celles que tu as creees ») : INV-111765, INV-111784, INV-111971 (0,01 $, payees, importees de l'ancien logiciel),
leurs paiements et depots, et la facturation periodique telephonie (creee a l'activation du tenant le 2026-08-08)
retournent a Simple IP inc. Seul le brouillon d'essai 2026-0001 (« test de facturation ») reste sur Compagnie test.

Revision ID: 770786fe22ba
Revises: af57ce229263
Create Date: 2026-10-10 14:51:56.513934

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '770786fe22ba'
down_revision: Union[str, Sequence[str], None] = 'af57ce229263'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


REAL = ("INV-111765", "INV-111784", "INV-111971")


def _move(to_owner: bool) -> None:
    conn = op.get_bind()
    owner = conn.execute(sa.text("SELECT id FROM companies WHERE is_owner")).scalar()
    test = conn.execute(sa.text("SELECT id FROM companies WHERE name = 'Compagnie test'")).scalar()
    if not owner or not test:
        return
    src, dst = (test, owner) if to_owner else (owner, test)
    inv_ids = [r[0] for r in conn.execute(sa.text("SELECT id FROM invoices WHERE number = ANY(:n) AND company_id = :s"),
                                          {"n": list(REAL), "s": src})]
    if inv_ids:
        conn.execute(sa.text("UPDATE invoices SET company_id = :d WHERE id = ANY(:i)"), {"d": dst, "i": inv_ids})
        pays = [r[0] for r in conn.execute(sa.text("SELECT DISTINCT payment_id FROM payment_allocations WHERE invoice_id = ANY(:i)"),
                                           {"i": inv_ids})]
        if pays:
            conn.execute(sa.text("UPDATE client_payments SET company_id = :d WHERE id = ANY(:p) AND company_id = :s"), {"d": dst, "p": pays, "s": src})
            conn.execute(sa.text("UPDATE bank_transactions SET company_id = :d WHERE client_payment_id = ANY(:p) AND company_id = :s"),
                         {"d": dst, "p": pays, "s": src})
    conn.execute(sa.text("UPDATE company_recurring_billings SET company_id = :d WHERE company_id = :s AND is_telephony"), {"d": dst, "s": src})


def upgrade() -> None:
    _move(to_owner=True)


def downgrade() -> None:
    _move(to_owner=False)
