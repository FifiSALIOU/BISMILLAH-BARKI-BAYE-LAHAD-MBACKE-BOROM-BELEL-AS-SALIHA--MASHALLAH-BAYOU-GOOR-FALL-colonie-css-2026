"""No-op : pas de modification de données en migration (comportement métier inchangé).

Revision ID: 0015_parents_tel_empty_null
Revises: 0014_reinscrit_flag
"""

from __future__ import annotations

revision = "0015_parents_tel_empty_null"
down_revision = "0014_reinscrit_flag"
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
