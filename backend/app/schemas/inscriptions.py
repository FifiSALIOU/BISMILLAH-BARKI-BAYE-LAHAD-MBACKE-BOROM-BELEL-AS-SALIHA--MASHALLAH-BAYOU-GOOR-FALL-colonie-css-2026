from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, Field

from app.models.enums import LienParente, Sexe


class ParentInfoIn(BaseModel):
    matricule: str = Field(min_length=1, max_length=50)
    prenom: str = Field(min_length=1, max_length=255)
    nom: str = Field(min_length=1, max_length=255)
    service: str = Field(min_length=1, max_length=255)
    email: Optional[str] = Field(default=None, max_length=191)
    telephone: str = Field(min_length=1, max_length=191)
    site_code: str = Field(min_length=1, max_length=50)


class EnfantCreateIn(BaseModel):
    prenom: str = Field(min_length=1, max_length=255)
    nom: str = Field(min_length=1, max_length=255)
    date_naissance: date
    sexe: Sexe
    lien_parente: LienParente


class InscriptionCreateIn(BaseModel):
    parent: ParentInfoIn
    enfant: EnfantCreateIn


class TransparenceInscriptionOut(BaseModel):
    """Vue lecture seule pour les parents : toutes les demandes (transparence des listes)."""

    demande_id: int
    enfant_id: int
    liste_code: str
    rang_dans_liste: int
    date_inscription: datetime
    updated_at: Optional[datetime] = None
    is_reinscrit: bool = False
    statut_demande: str
    parent_matricule: str
    parent_prenom: str
    parent_nom: str
    parent_service: str
    enfant_prenom: str
    enfant_nom: str
    enfant_date_naissance: date
    enfant_sexe: str
    enfant_lien_parente: str
    enfant_is_titulaire: bool

    class Config:
        from_attributes = True


class DemandeOut(BaseModel):
    id: int
    liste_code: str
    rang_dans_liste: int
    date_inscription: datetime
    updated_at: Optional[datetime] = None
    statut: str
    non_validation_reason: Optional[str] = None
    is_selection_finale: bool = Field(
        ...,
        description=(
            "True si le gestionnaire a validé la conformité des informations (statut RETENUE). "
            "Ne indique pas que l'enfant est dans la liste finale des retenus (calculée après clôture)."
        ),
    )
    has_desistement_pending: bool = False
    is_reinscrit: bool = False
    rejet_definitif: bool = Field(
        default=False,
        description="True si refus administratif définitif (plus aucune action parent).",
    )
    date_desistement: Optional[datetime] = Field(
        default=None,
        description="Désistement validé: updated_at de la demande. En attente: created_at du désistement.",
    )

    enfant_id: int
    enfant_prenom: str
    enfant_nom: str
    enfant_date_naissance: date
    enfant_sexe: str
    enfant_lien_parente: str
    enfant_is_titulaire: bool

    class Config:
        from_attributes = True


class TitulaireUpdateIn(BaseModel):
    enfant_id_titulaire: int


class DesistementRequestIn(BaseModel):
    reason: Optional[str] = Field(default=None, max_length=2000)

