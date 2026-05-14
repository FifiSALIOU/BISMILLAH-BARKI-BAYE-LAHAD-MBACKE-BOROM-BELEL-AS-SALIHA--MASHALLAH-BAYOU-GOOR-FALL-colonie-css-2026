"""No-op : inscription_at déjà dans le schéma initial (0001).

Revision ID: 0016_demande_inscription_at
Revises: 0015_parents_tel_empty_null
"""

from __future__ import annotations

revision = "0016_demande_inscription_at"
down_revision = "0015_parents_tel_empty_null"
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
