"""No-op : table app_settings créée dans 0001_initial si absente.

Revision ID: 0003_app_settings
Revises: 0002_demande_statut
Create Date: 2026-03-25
"""

from __future__ import annotations

revision = "0003_app_settings"
down_revision = "0002_demande_statut"
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
