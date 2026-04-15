"""Autorise demandes sans liste/rang avant choix parent.

Revision ID: 0013_demande_nullable_liste_rang
Revises: 0012_demande_justificatif
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0013_demande_nullable_liste_rang"
down_revision = "0012_demande_justificatif"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("demandes", "liste_id", existing_type=sa.BigInteger(), nullable=True)
    op.alter_column("demandes", "rang_dans_liste", existing_type=sa.Integer(), nullable=True)


def downgrade() -> None:
    op.alter_column("demandes", "rang_dans_liste", existing_type=sa.Integer(), nullable=False)
    op.alter_column("demandes", "liste_id", existing_type=sa.BigInteger(), nullable=False)
