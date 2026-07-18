"""settings employees vendor

Revision ID: a1b2c3d4e5f6
Revises: f7a8b9c0d1e2
Create Date: 2026-07-02
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'aa11bb22cc33'
down_revision = 'f7a8b9c0d1e2'
branch_labels = None
depends_on = None


def upgrade():
    # app_settings
    op.create_table('app_settings',
        sa.Column('key', sa.String(100), primary_key=True),
        sa.Column('value', sa.Text(), nullable=False),
        sa.Column('description', sa.Text()),
    )
    # Seed default settings
    op.execute("""
        INSERT INTO app_settings (key, value, description) VALUES
        ('hourly_rate', '145.00', 'Taux horaire Simple IP ($/h)'),
        ('labour_round_minutes', '15', 'Arrondi temps de travail (minutes)'),
        ('commission_rate', '10.0', 'Commission vendeur (%)'),
        ('default_vendor_contact_id', '', 'Contact vendeur par défaut (UUID)')
        ON CONFLICT (key) DO NOTHING
    """)

    # vendor_id on companies
    op.add_column('companies', sa.Column('vendor_id', postgresql.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key('fk_companies_vendor', 'companies', 'contacts', ['vendor_id'], ['id'], ondelete='SET NULL')

    # linked_to_hourly_rate on catalogue_items
    op.add_column('catalogue_items', sa.Column('linked_to_hourly_rate', sa.Boolean(), nullable=False, server_default='false'))

    # employees table
    op.create_table('employees',
        sa.Column('contact_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('contacts.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('hourly_rate', sa.Float(), nullable=True),
        sa.Column('monthly_salary', sa.Float(), nullable=True),
        sa.Column('hire_date', sa.Date(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
    )

    # salary_payments table
    op.create_table('salary_payments',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('employee_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('employees.contact_id', ondelete='CASCADE'), nullable=False),
        sa.Column('period_year', sa.Integer(), nullable=False),
        sa.Column('period_month', sa.Integer(), nullable=False),
        sa.Column('amount', sa.Float(), nullable=False),
        sa.Column('status', sa.String(20), nullable=False, server_default='a_payer'),
        sa.Column('interac_confirmation', sa.String(100), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('paid_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )


def downgrade():
    op.drop_table('salary_payments')
    op.drop_table('employees')
    op.drop_column('catalogue_items', 'linked_to_hourly_rate')
    op.drop_constraint('fk_companies_vendor', 'companies', type_='foreignkey')
    op.drop_column('companies', 'vendor_id')
    op.drop_table('app_settings')
