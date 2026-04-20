"""Remplacer téléphone vide par NULL (unicité : plusieurs '' interdits, plusieurs NULL autorisés).

Revision ID: 0015_parents_tel_empty_null
Revises: 0014_reinscrit_flag
"""

from __future__ import annotations

from alembic import op

revision = "0015_parents_tel_empty_null"
down_revision = "0014_reinscrit_flag"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("UPDATE parents SET telephone = NULL WHERE telephone = '';")


def downgrade() -> None:
    op.execute("UPDATE parents SET telephone = '' WHERE telephone IS NULL;")
