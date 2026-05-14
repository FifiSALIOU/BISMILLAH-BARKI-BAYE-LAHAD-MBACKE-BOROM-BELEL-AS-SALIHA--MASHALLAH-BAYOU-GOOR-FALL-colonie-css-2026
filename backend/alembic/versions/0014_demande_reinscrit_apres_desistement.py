"""No-op : reinscrit_apres_desistement déjà dans le schéma initial (0001).

Revision ID: 0014_reinscrit_flag
Revises: 0013_demande_nullable_liste_rang
"""

from __future__ import annotations

revision = "0014_reinscrit_flag"
down_revision = "0013_demande_nullable_liste_rang"
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
