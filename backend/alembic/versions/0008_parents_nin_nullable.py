"""No-op : NIN nullable déjà dans le schéma initial (0001).

Revision ID: 0008_parents_nin_nullable
Revises: 0007_parents_telephone_nullable
Create Date: 2026-04-02
"""

from __future__ import annotations

revision = "0008_parents_nin_nullable"
down_revision = "0007_parents_telephone_nullable"
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
