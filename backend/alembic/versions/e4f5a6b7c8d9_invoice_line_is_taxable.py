"""invoice_lines.is_taxable -- taxe par ligne

Revision ID: e4f5a6b7c8d9
Revises: d3e4f5a6b7c8
Create Date: 2026-10-02

TASK-005.9 : TPS/TVQ calculees seulement sur les lignes taxables (comme Zoho).
Toutes les lignes existantes restent taxables (defaut true) ; les lignes importees
de Zoho sont ajustees ensuite selon l'export (script, pas cette migration).
"""
from typing import Union, Sequence
import sqlalchemy as sa
from alembic import op

revision: str = 'e4f5a6b7c8d9'
down_revision: Union[str, Sequence[str], None] = 'd3e4f5a6b7c8'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('invoice_lines', sa.Column('is_taxable', sa.Boolean(), nullable=False, server_default=sa.true()))


def downgrade() -> None:
    op.drop_column('invoice_lines', 'is_taxable')
