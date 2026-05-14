"""No-op : colonne must_change_password déjà dans le schéma initial (0001).

Revision ID: 0004_user_must_change_password
Revises: 0003_app_settings
Create Date: 2026-03-25
"""

from __future__ import annotations

revision = "0004_user_must_change_password"
down_revision = "0003_app_settings"
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
