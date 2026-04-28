from __future__ import annotations

from datetime import date, datetime
from typing import List, Optional

from sqlalchemy import BigInteger, Boolean, Date, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base
from app.models.enums import DemandeStatut, LienParente, ListeCode, Sexe, UserRole
from app.models.int_columns import (
    DEMANDE_STATUT_TO_INT,
    IntEnumType,
    LIEN_TO_INT,
    LISTE_CODE_TO_INT,
    SEXE_TO_INT,
    USER_ROLE_TO_INT,
)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    matricule: Mapped[str] = mapped_column(String(191), nullable=False)
    name: Mapped[str] = mapped_column(String(191), nullable=False)
    password: Mapped[str] = mapped_column(String(191), nullable=False)
    role: Mapped[UserRole] = mapped_column(IntEnumType(UserRole, USER_ROLE_TO_INT), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False)
    must_change_password: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    remember_token: Mapped[str | None] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    parent_profile: Mapped[Optional["Parent"]] = relationship(back_populates="user", uselist=False)


class Service(Base):
    __tablename__ = "services"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    nom: Mapped[str] = mapped_column(String(191), nullable=False)
    description: Mapped[str] = mapped_column(String(191), nullable=False)
    user_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    parents: Mapped[List["Parent"]] = relationship(back_populates="service_obj")


class Site(Base):
    __tablename__ = "sites"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    nom: Mapped[str] = mapped_column(String(191), nullable=False)
    code: Mapped[int] = mapped_column(Integer, nullable=False)
    description: Mapped[str] = mapped_column(String(191), nullable=False)
    user_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    parents: Mapped[List["Parent"]] = relationship(back_populates="site_obj")


class Parent(Base):
    __tablename__ = "parents"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    matricule: Mapped[str] = mapped_column(String(191), nullable=False)
    prenom: Mapped[str] = mapped_column(String(191), nullable=False)
    nom: Mapped[str] = mapped_column(String(191), nullable=False)
    email: Mapped[str | None] = mapped_column(String(191), nullable=True)
    telephone: Mapped[str | None] = mapped_column(String(191), nullable=True)
    genre: Mapped[str] = mapped_column(String(191), nullable=False)
    nin: Mapped[str | None] = mapped_column(String(191), nullable=True)
    adresse: Mapped[str] = mapped_column(String(191), nullable=False)
    service_text: Mapped[str] = mapped_column("service", String(191), nullable=False)
    site_text: Mapped[str] = mapped_column("site", String(191), nullable=False)

    service_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("services.id"), nullable=True)
    site_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("sites.id"), nullable=True)
    user_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("users.id"), nullable=True)

    created_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    user: Mapped[Optional["User"]] = relationship(back_populates="parent_profile")
    service_obj: Mapped[Optional["Service"]] = relationship(back_populates="parents", foreign_keys=[service_id])
    site_obj: Mapped[Optional["Site"]] = relationship(back_populates="parents", foreign_keys=[site_id])

    enfants: Mapped[List["Enfant"]] = relationship(back_populates="parent", cascade="all, delete-orphan")


class Enfant(Base):
    __tablename__ = "enfants"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    parent_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("parents.id"), index=True, nullable=False)
    prenom: Mapped[str] = mapped_column(String(191), nullable=False)
    nom: Mapped[str] = mapped_column(String(191), nullable=False)
    date_naissance: Mapped[date] = mapped_column(Date, nullable=False)
    sexe: Mapped[Sexe] = mapped_column(IntEnumType(Sexe, SEXE_TO_INT), nullable=False)
    lien_parente: Mapped[LienParente] = mapped_column(IntEnumType(LienParente, LIEN_TO_INT), nullable=False)
    is_titulaire: Mapped[bool] = mapped_column(Boolean, nullable=False)

    created_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    parent: Mapped["Parent"] = relationship(back_populates="enfants")
    demande_inscription: Mapped[Optional["DemandeInscription"]] = relationship(
        back_populates="enfant",
        uselist=False,
    )


class Liste(Base):
    __tablename__ = "listes"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    nom: Mapped[str] = mapped_column(String(191), nullable=False)
    code: Mapped[ListeCode] = mapped_column(IntEnumType(ListeCode, LISTE_CODE_TO_INT), nullable=False)
    nombre_max: Mapped[int] = mapped_column(Integer, nullable=False)
    description: Mapped[str] = mapped_column(String(191), nullable=False)
    user_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    demandes: Mapped[List["DemandeInscription"]] = relationship(back_populates="liste")


class DemandeInscription(Base):
    """Table PostgreSQL `demandes` — nom de classe inchangé pour le code métier."""

    __tablename__ = "demandes"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    date_inscription: Mapped[date] = mapped_column(Date, nullable=False)
    inscription_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    rang_dans_liste: Mapped[int | None] = mapped_column(Integer, nullable=True)
    statut: Mapped[DemandeStatut] = mapped_column(
        IntEnumType(DemandeStatut, DEMANDE_STATUT_TO_INT),
        nullable=False,
    )
    non_validation_reason: Mapped[str] = mapped_column("motif_rejet", String(191), nullable=False)
    rejet_definitif: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    reinscrit_apres_desistement: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        comment="True uniquement après POST réinscription (désistement validé puis réinscription parent).",
    )
    justificatif_path: Mapped[str | None] = mapped_column(String(255), nullable=True)
    justificatif_nom_fichier: Mapped[str | None] = mapped_column(String(255), nullable=True)
    justificatif_mime_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    justificatif_taille: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    justificatif_uploaded_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    justificatif_valide: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    justificatif_valide_par_user_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("users.id"), nullable=True
    )
    justificatif_valide_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    liste_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("listes.id"), nullable=True)
    enfant_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("enfants.id"), nullable=False)
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"), nullable=False)

    created_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    enfant: Mapped["Enfant"] = relationship(back_populates="demande_inscription")
    liste: Mapped[Optional["Liste"]] = relationship(back_populates="demandes")
    desistement: Mapped[Optional["Desistement"]] = relationship(
        back_populates="demande_inscription",
        uselist=False,
    )


class Desistement(Base):
    __tablename__ = "desistements"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    raison: Mapped[str] = mapped_column(String(191), nullable=False)
    demande_inscription_id: Mapped[int] = mapped_column("demande_id", BigInteger, ForeignKey("demandes.id"), nullable=False)
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    demande_inscription: Mapped["DemandeInscription"] = relationship(
        back_populates="desistement",
        foreign_keys=[demande_inscription_id],
    )


class HistoriqueEntry(Base):
    """Journal des rejets et désistements (écriture additive, sans modifier le métier)."""

    __tablename__ = "historique"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    event_type: Mapped[str] = mapped_column("type", String(32), nullable=False)
    enfant_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("enfants.id"), nullable=False, index=True)
    demande_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("demandes.id", ondelete="SET NULL"), nullable=True, index=True)
    motif: Mapped[str] = mapped_column(Text, nullable=False)
    date_action: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    ajoute_par_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    # Pas de FK vers desistemements : la ligne source peut être supprimée après validation.
    desistement_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
