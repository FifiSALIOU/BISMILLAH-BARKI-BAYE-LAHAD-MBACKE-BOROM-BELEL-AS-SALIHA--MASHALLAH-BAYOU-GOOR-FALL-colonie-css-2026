"""No-op : table historique créée dans le schéma initial (0001).

Revision ID: 0010_historique_table
Revises: 0009_users_must_chg_pwd
Create Date: 2026-04-08
"""

from __future__ import annotations

revision = "0010_historique_table"
down_revision = "0009_users_must_chg_pwd"
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
