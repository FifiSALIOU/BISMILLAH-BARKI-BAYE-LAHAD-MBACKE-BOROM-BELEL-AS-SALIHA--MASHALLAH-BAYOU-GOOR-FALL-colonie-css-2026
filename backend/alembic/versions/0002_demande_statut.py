"""No-op : statut / motif_rejet déjà définis dans le schéma initial (0001).

Revision ID: 0002_demande_statut
Revises: 0001_initial
Create Date: 2026-03-18
"""

from __future__ import annotations

revision = "0002_demande_statut"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
