"""zeko journal ia externe

Revision ID: 878b235ae53d
Revises: ba4679ab41df
Create Date: 2026-10-18 09:53:32.980968

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '878b235ae53d'
down_revision: Union[str, Sequence[str], None] = 'ba4679ab41df'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# TASK-006.5 etape 4 (2026-10-18) : IA externe (Gemini, DeepSeek...) -- trace locale de la question expurgee et de la reponse.


def upgrade() -> None:
    op.add_column("zeko_invocations", sa.Column("request_redacted", sa.Text(), nullable=True))
    op.add_column("zeko_invocations", sa.Column("response", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("zeko_invocations", "response")
    op.drop_column("zeko_invocations", "request_redacted")
