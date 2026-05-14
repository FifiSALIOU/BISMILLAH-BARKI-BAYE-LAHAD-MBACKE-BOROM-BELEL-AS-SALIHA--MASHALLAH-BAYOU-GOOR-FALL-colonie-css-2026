"""No-op : rejet_definitif et rangs — pas de logique métier dans la migration.

Revision ID: 0011_rejet_def
Revises: 0010_historique_table
"""

from __future__ import annotations

revision = "0011_rejet_def"
down_revision = "0010_historique_table"
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
