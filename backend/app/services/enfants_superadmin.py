"""CRUD super-admin ciblé sur les enfants « codifiés », sans modifier la logique de calcul des listes."""

from __future__ import annotations

from collections.abc import Collection
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.models import DemandeInscription, Enfant, HistoriqueEntry, Parent
from app.schemas.inscriptions import EnfantCorrectionIn
from app.services.inscriptions import _validate_annee_naissance, resequence_rangs_apres_desistement_valide
from app.services.liste_finale_lock import raise_if_liste_finale_definitive

DETAIL_SUPPRESSION_ENFANT_PARENT_INSCRIT = (
    "Suppression impossible : le parent a déjà une inscription positionnée sur une liste "
    "(définition titulaire / suppléants ou parcours d’inscription standard). "
    "Aucune suppression n’est autorisée tant que ce parent est engagé dans ce flux."
)


def parent_ids_avec_demande_sur_liste(db: Session, parent_ids: Collection[int]) -> set[int]:
    """Parents pour lesquels au moins une demande a un `liste_id` (hors attente « vierge » sync)."""
    ids = {int(x) for x in parent_ids}
    if not ids:
        return set()
    rows = (
        db.query(Enfant.parent_id)
        .join(DemandeInscription, DemandeInscription.enfant_id == Enfant.id)
        .filter(Enfant.parent_id.in_(ids), DemandeInscription.liste_id.isnot(None))
        .distinct()
        .all()
    )
    return {int(r[0]) for r in rows}


def superadmin_suppression_enfant_autorisee(db: Session, *, parent_id: int) -> bool:
    return int(parent_id) not in parent_ids_avec_demande_sur_liste(db, [int(parent_id)])


def superadmin_patch_enfant(
    db: Session,
    *,
    enfant_id: int,
    payload: EnfantCorrectionIn,
) -> tuple[Enfant, Parent]:
    raise_if_liste_finale_definitive()
    enfant = db.query(Enfant).filter(Enfant.id == enfant_id).first()
    if not enfant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Enfant introuvable.")
    _validate_annee_naissance(payload.date_naissance)
    demande = db.query(DemandeInscription).filter(DemandeInscription.enfant_id == enfant_id).first()
    if demande is not None and payload.lien_parente != enfant.lien_parente:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Impossible de modifier le lien de parenté : cet enfant a une demande d’inscription. "
                "Utilisez le flux de correction des demandes rejetées ou supprimez d’abord la demande."
            ),
        )
    enfant.prenom = (payload.prenom or "").strip()[:191]
    enfant.nom = (payload.nom or "").strip()[:191]
    enfant.date_naissance = payload.date_naissance
    enfant.sexe = payload.sexe
    enfant.lien_parente = payload.lien_parente
    enfant.updated_at = datetime.now(timezone.utc)
    db.add(enfant)
    db.flush()
    parent = db.query(Parent).filter(Parent.id == enfant.parent_id).first()
    if not parent:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Parent introuvable.")
    return enfant, parent


def _promote_titulaire_parent(db: Session, parent_id: int) -> None:
    restants = (
        db.query(Enfant)
        .filter(Enfant.parent_id == parent_id)
        .order_by(Enfant.id.asc())
        .all()
    )
    if not restants:
        return
    for i, e in enumerate(restants):
        e.is_titulaire = i == 0
        db.add(e)
    db.flush()


def superadmin_delete_enfant(db: Session, *, enfant_id: int) -> None:
    raise_if_liste_finale_definitive()
    enfant = db.query(Enfant).filter(Enfant.id == enfant_id).first()
    if not enfant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Enfant introuvable.")

    parent_id = int(enfant.parent_id)
    if not superadmin_suppression_enfant_autorisee(db, parent_id=parent_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=DETAIL_SUPPRESSION_ENFANT_PARENT_INSCRIT)
    was_titulaire = bool(enfant.is_titulaire)

    demande = db.query(DemandeInscription).filter(DemandeInscription.enfant_id == enfant_id).first()
    liste_id_for_reseq: int | None = None
    had_rang = False
    if demande is not None:
        if demande.liste_id is not None:
            liste_id_for_reseq = int(demande.liste_id)
        had_rang = demande.rang_dans_liste is not None
        if demande.desistement is not None:
            db.delete(demande.desistement)
            db.flush()
        db.delete(demande)
        db.flush()

    db.query(HistoriqueEntry).filter(HistoriqueEntry.enfant_id == enfant_id).delete(synchronize_session=False)
    db.flush()

    db.delete(enfant)
    db.flush()

    if liste_id_for_reseq is not None and had_rang:
        resequence_rangs_apres_desistement_valide(db, liste_id_for_reseq)

    if was_titulaire:
        _promote_titulaire_parent(db, parent_id)
