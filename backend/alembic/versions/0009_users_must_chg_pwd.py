"""No-op : must_change_password déjà dans le schéma initial (0001).

Revision ID: 0009_users_must_chg_pwd
Revises: 0008_parents_nin_nullable
Create Date: 2026-04-05
"""

from __future__ import annotations

revision = "0009_users_must_chg_pwd"
down_revision = "0008_parents_nin_nullable"
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
