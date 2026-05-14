"""No-op : renumérotation métier — ne pas modifier les données via migration.

Revision ID: 0006_resequence_rang_dans_liste
Revises: 0004_user_must_change_password
Create Date: 2026-03-30 00:00:00.000000
"""

from __future__ import annotations

revision = "0006_resequence_rang_dans_liste"
down_revision = "0004_user_must_change_password"
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
