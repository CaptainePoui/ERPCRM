"""merge_philippe_accounts -- un seul compte pour Philippe (TASK-014.2, 2026-10-09)

Philippe se connectait avec admin@simpleip.ca (« Administrateur ») ; sa fiche Employe, sa boite philippe@ et sa signature
etaient reliees a philippe@simpleip.ca, jamais utilise pour se connecter. Tout ce qui est rattache au compte jamais utilise
passe au compte utilise (meme mot de passe, meme historique), le compte jamais utilise est retire, et le compte garde
devient « Philippe Normandeau », administrateur, connexion philippe@simpleip.tel (sa boite professionnelle).
Ne fait rien ailleurs (une autre installation n'a pas ces deux comptes). Pas de retour arriere automatique : l'historique
fusionne ne se separe pas -- la copie de la base faite avant est le retour arriere.

Revision ID: 52822cdce421
Revises: aa1fdaf3780b
Create Date: 2026-10-09 13:07:47.448488

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '52822cdce421'
down_revision: Union[str, Sequence[str], None] = 'aa1fdaf3780b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


KEEP = "d1ba78ea-f3b6-47f9-9e64-c85e1b5aea4e"      # admin@simpleip.ca -- le compte que Philippe utilise
DROP = "9d52ad6a-ad12-41b4-9fcf-70a7ae26dfac"      # philippe@simpleip.ca -- jamais utilise pour se connecter
LOGIN = "philippe@simpleip.tel"


def upgrade() -> None:
    bind = op.get_bind()
    ids = {str(r[0]) for r in bind.execute(sa.text("SELECT id FROM users WHERE id IN (:a, :b)"), {"a": KEEP, "b": DROP})}
    if ids != {KEEP, DROP}:
        return
    if bind.execute(sa.text("SELECT 1 FROM users WHERE lower(email) = :e AND id NOT IN (:a, :b)"),
                    {"e": LOGIN, "a": KEEP, "b": DROP}).first():
        raise RuntimeError(f"{LOGIN} est deja le courriel d'un autre compte")
    # tout ce qui pointe vers le compte jamais utilise (toutes les colonnes liees a users, trouvees dans la base)
    cols = bind.execute(sa.text("""
        SELECT c.conrelid::regclass::text, a.attname::text FROM pg_constraint c
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
        WHERE c.contype = 'f' AND c.confrelid = 'users'::regclass""")).all()
    for table, col in cols:
        bind.execute(sa.text(f'UPDATE {table} SET "{col}" = :k WHERE "{col}" = :d'), {"k": KEEP, "d": DROP})
    bind.execute(sa.text("UPDATE telephony_locks SET holder_id = :k WHERE holder_id = :d"), {"k": KEEP, "d": DROP})
    bind.execute(sa.text("DELETE FROM users WHERE id = :d"), {"d": DROP})
    bind.execute(sa.text("UPDATE users SET email = :e, full_name = 'Philippe Normandeau', role = 'admin' WHERE id = :k"),
                 {"e": LOGIN, "k": KEEP})


def downgrade() -> None:
    pass        # voir l'en-tete : retour arriere = la copie de la base faite avant
