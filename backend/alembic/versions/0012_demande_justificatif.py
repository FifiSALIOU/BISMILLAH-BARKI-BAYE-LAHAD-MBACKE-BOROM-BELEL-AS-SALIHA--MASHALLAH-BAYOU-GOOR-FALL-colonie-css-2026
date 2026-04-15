"""Ajout colonnes justificatif sur demandes.

Revision ID: 0012_demande_justificatif
Revises: 0011_rejet_def
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0012_demande_justificatif"
down_revision = "0011_rejet_def"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("demandes", sa.Column("justificatif_path", sa.String(length=255), nullable=True))
    op.add_column("demandes", sa.Column("justificatif_nom_fichier", sa.String(length=255), nullable=True))
    op.add_column("demandes", sa.Column("justificatif_mime_type", sa.String(length=100), nullable=True))
    op.add_column("demandes", sa.Column("justificatif_taille", sa.BigInteger(), nullable=True))
    op.add_column("demandes", sa.Column("justificatif_uploaded_at", sa.DateTime(), nullable=True))
    op.add_column("demandes", sa.Column("justificatif_valide", sa.Boolean(), nullable=True))
    op.add_column("demandes", sa.Column("justificatif_valide_par_user_id", sa.BigInteger(), nullable=True))
    op.add_column("demandes", sa.Column("justificatif_valide_at", sa.DateTime(), nullable=True))
    op.create_foreign_key(
        "fk_demandes_justificatif_valide_par_user_id_users",
        "demandes",
        "users",
        ["justificatif_valide_par_user_id"],
        ["id"],
    )


def downgrade() -> None:
    op.drop_constraint("fk_demandes_justificatif_valide_par_user_id_users", "demandes", type_="foreignkey")
    op.drop_column("demandes", "justificatif_valide_at")
    op.drop_column("demandes", "justificatif_valide_par_user_id")
    op.drop_column("demandes", "justificatif_valide")
    op.drop_column("demandes", "justificatif_uploaded_at")
    op.drop_column("demandes", "justificatif_taille")
    op.drop_column("demandes", "justificatif_mime_type")
    op.drop_column("demandes", "justificatif_nom_fichier")
    op.drop_column("demandes", "justificatif_path")
