"""Schéma initial aligné sur les modèles SQLAlchemy actuels (Base.metadata).

Revision ID: 0001_initial
Revises:
Create Date: 2026-03-18
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

from app.models import Base  # noqa: F401 — enregistre toutes les tables de app.models.models

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    Base.metadata.create_all(bind, checkfirst=True)

    insp = sa.inspect(bind)
    if not insp.has_table("app_settings"):
        op.create_table(
            "app_settings",
            sa.Column("key", sa.String(length=100), primary_key=True),
            sa.Column("value", sa.Text(), nullable=False),
        )


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if insp.has_table("app_settings"):
        op.drop_table("app_settings")
    Base.metadata.drop_all(bind)
