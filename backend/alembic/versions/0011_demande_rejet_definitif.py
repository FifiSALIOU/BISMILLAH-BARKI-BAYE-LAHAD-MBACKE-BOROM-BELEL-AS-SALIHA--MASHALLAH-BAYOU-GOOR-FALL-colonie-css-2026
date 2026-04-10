"""Ajout rejet_definitif sur demandes (refus corrigeable vs définitif).

Revision ID: 0011_rejet_def
Revises: 0010_historique_table
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0011_rejet_def"
down_revision = "0010_historique_table"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "demandes",
        sa.Column("rejet_definitif", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.alter_column("demandes", "rejet_definitif", server_default=None)

    bind = op.get_bind()
    from sqlalchemy.orm import Session as SqlSession, sessionmaker

    session = sessionmaker(bind=bind, class_=SqlSession)()
    try:
        from app.services.inscriptions import ensure_listes_exist, resequence_rangs_apres_desistement_valide
        from app.models.models import Liste

        ensure_listes_exist(session)
        for liste in session.query(Liste).all():
            resequence_rangs_apres_desistement_valide(session, int(liste.id))
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def downgrade() -> None:
    op.drop_column("demandes", "rejet_definitif")
