"""Factures : offerte au client + PDF d'origine (TASK-005.22 / TASK-005.23, 2026-10-14).

- offered_at : une facture en brouillon que Philippe decide d'offrir au client (« je leur donne ») passe au statut
  annulee avec cette date -> affichee « Offerte », hors taxes, hors solde, hors rappel des brouillons ; revient en
  brouillon si on l'annule.
- original_pdf : nom du fichier PDF d'origine (ancien logiciel / QuickBooks) dans storage/invoice_originals/ ; c'est
  ce document que le client voit au portail (« oui ce serait cool »).

Revision ID: 2e7ad887ea0f
Revises: 45a500ef884b
Create Date: 2026-10-14
"""
from typing import Sequence, Union
import sqlalchemy as sa
from alembic import op

revision: str = '2e7ad887ea0f'
down_revision: Union[str, Sequence[str], None] = '45a500ef884b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("invoices", sa.Column("offered_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("invoices", sa.Column("original_pdf", sa.String(255), nullable=True))


def downgrade() -> None:
    op.drop_column("invoices", "original_pdf")
    op.drop_column("invoices", "offered_at")
