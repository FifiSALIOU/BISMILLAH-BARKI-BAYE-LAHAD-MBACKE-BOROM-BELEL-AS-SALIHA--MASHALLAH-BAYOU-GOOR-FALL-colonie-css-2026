"""Colonne reinscrit_apres_desistement sur demandes (badge Réinscrit fiable).

Revision ID: 0014_reinscrit_flag
Revises: 0013_demande_nullable_liste_rang
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0014_reinscrit_flag"
down_revision = "0013_demande_nullable_liste_rang"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "demandes",
        sa.Column(
            "reinscrit_apres_desistement",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.alter_column("demandes", "reinscrit_apres_desistement", server_default=None)


def downgrade() -> None:
    op.drop_column("demandes", "reinscrit_apres_desistement")
