"""No-op : téléphone nullable déjà dans le schéma initial (0001).

Revision ID: 0007_parents_telephone_nullable
Revises: 0006_resequence_rang_dans_liste
Create Date: 2026-04-02
"""

from __future__ import annotations

revision = "0007_parents_telephone_nullable"
down_revision = "0006_resequence_rang_dans_liste"
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
