"""Ajoute un horodatage métier d'inscription sur demandes.

Revision ID: 0016_demande_inscription_at
Revises: 0015_parents_tel_empty_null
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0016_demande_inscription_at"
down_revision = "0015_parents_tel_empty_null"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("demandes", sa.Column("inscription_at", sa.DateTime(), nullable=True))
    op.execute(
        """
        UPDATE demandes
        SET inscription_at = COALESCE(updated_at, created_at)
        WHERE inscription_at IS NULL
        """
    )


def downgrade() -> None:
    op.drop_column("demandes", "inscription_at")
