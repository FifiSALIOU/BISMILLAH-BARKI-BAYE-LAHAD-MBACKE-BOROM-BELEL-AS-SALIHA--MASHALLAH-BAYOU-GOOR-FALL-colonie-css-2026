from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import func, text
from sqlalchemy.orm import Session, joinedload

from app.api.deps import get_current_user, require_roles
from app.db.session import get_db
from app.models.enums import DemandeStatut, ListeCode, LienParente, Sexe, UserRole
from app.models.models import DemandeInscription, Desistement, Enfant, Liste, Parent, Service, Site, User
from app.services.email import send_email, uniq_emails
from app.services.email_templates import (
    body_desistement_validated_admin,
    body_selection,
    body_transfer,
    subject_desistement_valide_admin,
    subject_selection,
    subject_transfer,
)
from app.services.historique_metier import append_historique_best_effort
from app.services.inscriptions import (
    admin_corriger_demande_rejetee,
    ensure_listes_exist,
    resequence_rangs_apres_desistement_valide,
    _next_rang_for_liste,
)
from app.services.liste_finale_compute import demandes_liste_finale_retenus_si_cloturees, inscriptions_cloturees
from app.services.liste_finale_lock import raise_if_liste_finale_definitive
from app.services.notify_helpers import collect_admin_emails
from app.services.runtime_settings_store import merge_with_defaults, read_settings, write_settings

router = APIRouter(prefix="/admin", tags=["admin"])


class RuntimeSettingsIn(BaseModel):
    colonieNom: str = Field(default="Colonie de Vacances 2026")
    dateDebutInscriptions: str = Field(default="2026-01-01")
    dateFinInscriptions: str = Field(default="2026-04-30")
    dateDebutColonie: str = Field(default="2026-07-01")
    dateFinColonie: str = Field(default="2026-08-31")
    capaciteMax: int | None = Field(default=100)
    maxEnfantsParParent: int | None = Field(default=2)
    ageMin: int = Field(default=2012)
    ageMax: int = Field(default=2019)
    inscriptionsOuvertes: bool = Field(default=True)
    accesParentsActif: bool = Field(default=True)


class FinalSelectionIn(BaseModel):
    is_selection_finale: bool
    non_validation_reason: Optional[str] = Field(default=None, max_length=2000)


class CorrigerRejetIn(BaseModel):
    enfant_prenom: str = Field(min_length=1, max_length=191)
    enfant_nom: str = Field(min_length=1, max_length=191)
    enfant_date_naissance: date
    enfant_sexe: Sexe
    enfant_lien_parente: LienParente


class TransferIn(BaseModel):
    to_liste_code: ListeCode
    reason: Optional[str] = Field(default=None, max_length=2000)


class DesistementValidateIn(BaseModel):
    validated: bool = True


class SwapRangIn(BaseModel):
    other_demande_id: int


class ListeConfigIn(BaseModel):
    code: ListeCode
    nom: str = Field(min_length=1, max_length=255)
    description: str | None = None


class SiteConfigIn(BaseModel):
    nom: str = Field(min_length=1, max_length=255)
    code: str = Field(min_length=1, max_length=50)
    description: str | None = None


class ServiceConfigIn(BaseModel):
    nom: str = Field(min_length=1, max_length=255)
    description: str | None = None


def _default_runtime_settings() -> dict:
    d = RuntimeSettingsIn().model_dump()
    d["listeFinalePretePourValidation"] = False
    d["listeFinaleValideeDefinitive"] = False
    return d


def _read_runtime_settings() -> dict:
    return merge_with_defaults(_default_runtime_settings())


def _liste_finale_reset_si_parametres_cles_changes(prev: dict, incoming: dict) -> bool:
    """True si capacité max, max enfants / parent ou dates d’inscription ont changé — réinitialise le cycle liste finale."""
    keys = ("capaciteMax", "maxEnfantsParParent", "dateDebutInscriptions", "dateFinInscriptions")

    def _norm_date(v: object) -> str:
        s = str(v or "").strip()
        return s.split("T")[0] if s else ""

    def _norm_cap(v: object) -> object:
        if v is None:
            return None
        try:
            return int(v)
        except (TypeError, ValueError):
            return v

    for k in keys:
        a, b = prev.get(k), incoming.get(k)
        if k in ("dateDebutInscriptions", "dateFinInscriptions"):
            if _norm_date(a) != _norm_date(b):
                return True
        elif k == "capaciteMax":
            if _norm_cap(a) != _norm_cap(b):
                return True
        elif k == "maxEnfantsParParent":
            if _norm_cap(a) != _norm_cap(b):
                return True
    return False


@router.get("/settings")
def get_runtime_settings(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _ = db, user
    return _read_runtime_settings()


@router.put("/settings")
def update_runtime_settings(
    payload: RuntimeSettingsIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.SUPER_ADMIN)),
):
    _ = db, user
    data = payload.model_dump()
    defaults = _default_runtime_settings()
    prev = read_settings()
    # Fusionner avec le fichier existant pour ne pas perdre de clés futures / hors modèle.
    merged = {**defaults, **prev, **data}
    if _liste_finale_reset_si_parametres_cles_changes(prev, data):
        merged["listeFinaleValideeDefinitive"] = False
        merged["listeFinalePretePourValidation"] = False
    write_settings(merged)
    return merge_with_defaults(defaults)


@router.post("/liste-finale/confirmer-generation", summary="Marque l’étape « liste générée » (après clôture)")
def confirmer_generation_liste_finale(
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.GESTIONNAIRE, UserRole.SUPER_ADMIN)),
):
    """Optionnel : marque explicitement l’étape « liste générée » (la validation définitive ne dépend plus de cet appel)."""
    _ = db, user
    if not inscriptions_cloturees():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Les inscriptions ne sont pas encore clôturées.",
        )
    raise_if_liste_finale_definitive()
    merged = {**_default_runtime_settings(), **read_settings()}
    merged["listeFinalePretePourValidation"] = True
    write_settings(merged)
    return {"ok": True, "listeFinalePretePourValidation": True}


@router.post("/liste-finale/valider-definitive", summary="Valide définitivement la liste finale (verrouillage)")
def valider_liste_finale_definitive(
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.GESTIONNAIRE, UserRole.SUPER_ADMIN)),
):
    _ = db, user
    if not inscriptions_cloturees():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Les inscriptions ne sont pas encore clôturées.",
        )
    rs = read_settings()
    if rs.get("listeFinaleValideeDefinitive"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La liste finale est déjà validée définitivement.",
        )
    merged = {**_default_runtime_settings(), **rs}
    merged["listeFinaleValideeDefinitive"] = True
    write_settings(merged)
    return {"ok": True, "listeFinaleValideeDefinitive": True}


def _service_nom_normalized(nom: str) -> str:
    return " ".join(str(nom).strip().split())


@router.get("/services")
def list_services(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Liste des services (table `services`) pour formulaires admin (ex. création parent)."""
    _ = user
    rows = db.query(Service).order_by(Service.nom.asc()).all()
    return [{"id": r.id, "nom": r.nom, "description": r.description} for r in rows]


@router.post("/services")
def create_service(
    payload: ServiceConfigIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.SUPER_ADMIN)),
):
    _ = user
    nom = _service_nom_normalized(payload.nom)
    if not nom:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Nom du service requis.")
    duplicate = db.query(Service).filter(func.lower(Service.nom) == nom.lower()).first()
    if duplicate:
        raise HTTPException(status_code=400, detail="Un service avec ce nom existe déjà.")
    desc = ((payload.description or "").strip() or "-")[:191]
    row = Service(nom=nom, description=desc)
    db.add(row)
    db.commit()
    db.refresh(row)
    return {"id": row.id, "nom": row.nom, "description": row.description}


@router.patch("/services/{service_id}")
def update_service(
    service_id: int,
    payload: ServiceConfigIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.SUPER_ADMIN)),
):
    _ = user
    row = db.query(Service).filter(Service.id == service_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Service introuvable.")
    nom = _service_nom_normalized(payload.nom)
    if not nom:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Nom du service requis.")
    other = db.query(Service).filter(func.lower(Service.nom) == nom.lower(), Service.id != service_id).first()
    if other:
        raise HTTPException(status_code=400, detail="Un service avec ce nom existe déjà.")
    row.nom = nom
    row.description = ((payload.description or "").strip() or "-")[:191]
    db.commit()
    db.refresh(row)
    return {"id": row.id, "nom": row.nom, "description": row.description}


@router.delete("/services/{service_id}")
def delete_service(
    service_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.SUPER_ADMIN)),
):
    _ = user
    row = db.query(Service).filter(Service.id == service_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Service introuvable.")
    linked = db.query(Parent).filter(Parent.service_id == row.id).first()
    if linked:
        raise HTTPException(status_code=400, detail="Suppression impossible : ce service est relié à des parents.")
    db.delete(row)
    db.commit()
    return {"ok": True}


@router.get("/sites")
def list_sites(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _ = user
    all_sites = db.query(Site).order_by(Site.nom.asc()).all()
    return [
        {
            "id": s.id,
            "nom": s.nom,
            "code": s.code,
            "description": s.description,
        }
        for s in all_sites
    ]


def _parse_site_code(code_raw: str) -> int:
    try:
        return int(str(code_raw).strip())
    except ValueError:
        raise HTTPException(status_code=400, detail="Code site doit être un entier.")


@router.post("/sites")
def create_site(
    payload: SiteConfigIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.SUPER_ADMIN)),
):
    _ = user
    code_int = _parse_site_code(payload.code)
    exists = db.query(Site).filter(Site.code == code_int).first()
    if exists:
        raise HTTPException(status_code=400, detail="Ce code de site existe déjà.")
    desc = (payload.description or "").strip() or "-"
    row = Site(nom=payload.nom.strip(), code=code_int, description=desc)
    db.add(row)
    db.commit()
    db.refresh(row)
    return {"id": row.id, "nom": row.nom, "code": row.code, "description": row.description}


@router.patch("/sites/{site_id}")
def update_site(
    site_id: int,
    payload: SiteConfigIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.SUPER_ADMIN)),
):
    _ = user
    row = db.query(Site).filter(Site.id == site_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Site introuvable.")
    code_int = _parse_site_code(payload.code)
    duplicate = db.query(Site).filter(Site.code == code_int, Site.id != site_id).first()
    if duplicate:
        raise HTTPException(status_code=400, detail="Ce code de site existe déjà.")
    row.nom = payload.nom.strip()
    row.code = code_int
    row.description = (payload.description or "").strip() or "-"
    db.commit()
    db.refresh(row)
    return {"id": row.id, "nom": row.nom, "code": row.code, "description": row.description}


@router.delete("/sites/{site_id}")
def delete_site(
    site_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.SUPER_ADMIN)),
):
    _ = user
    row = db.query(Site).filter(Site.id == site_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Site introuvable.")
    linked_parent = db.query(Parent).filter(Parent.site_id == row.id).first()
    if linked_parent:
        raise HTTPException(status_code=400, detail="Suppression impossible : ce site est utilisé par des parents.")
    db.delete(row)
    db.commit()
    return {"ok": True}


@router.get("/listes-config")
def list_listes_config(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _ = user
    rows = db.query(Liste).order_by(Liste.code.asc()).all()
    return [
        {
            "id": l.id,
            "code": l.code.value,
            "nom": l.nom,
            "description": l.description,
            "nombre_max": l.nombre_max,
        }
        for l in rows
    ]


@router.post("/listes-config")
def create_liste_config(
    payload: ListeConfigIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.SUPER_ADMIN)),
):
    _ = user
    exists = db.query(Liste).filter(Liste.code == payload.code).first()
    if exists:
        raise HTTPException(status_code=400, detail="Ce code de liste existe déjà.")
    desc = (payload.description or "").strip() or "-"
    row = Liste(code=payload.code, nom=payload.nom, description=desc, nombre_max=999)
    db.add(row)
    db.commit()
    db.refresh(row)
    return {"id": row.id, "code": row.code.value, "nom": row.nom, "description": row.description}


@router.patch("/listes-config/{liste_id}")
def update_liste_config(
    liste_id: int,
    payload: ListeConfigIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.SUPER_ADMIN)),
):
    _ = user
    row = db.query(Liste).filter(Liste.id == liste_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Liste introuvable.")
    duplicate = db.query(Liste).filter(Liste.code == payload.code, Liste.id != liste_id).first()
    if duplicate:
        raise HTTPException(status_code=400, detail="Ce code de liste existe déjà.")
    row.code = payload.code
    row.nom = payload.nom
    row.description = (payload.description or "").strip() or "-"
    db.commit()
    db.refresh(row)
    return {"id": row.id, "code": row.code.value, "nom": row.nom, "description": row.description}


@router.delete("/listes-config/{liste_id}")
def delete_liste_config(
    liste_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.SUPER_ADMIN)),
):
    _ = user
    row = db.query(Liste).filter(Liste.id == liste_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Liste introuvable.")
    has_demandes = db.query(DemandeInscription).filter(DemandeInscription.liste_id == row.id).first()
    if has_demandes:
        raise HTTPException(status_code=400, detail="Suppression impossible : cette liste est déjà utilisée.")
    db.delete(row)
    db.commit()
    return {"ok": True}


@router.get("/listes/{liste_code}/demandes")
def list_demandes_par_liste(
    liste_code: ListeCode,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.GESTIONNAIRE, UserRole.SUPER_ADMIN)),
):
    _ = user
    ensure_listes_exist(db)
    liste = db.query(Liste).filter(Liste.code == liste_code).first()
    if not liste:
        raise HTTPException(status_code=404, detail="Liste introuvable.")

    demandes = (
        db.query(DemandeInscription)
        .filter(
            DemandeInscription.liste_id == liste.id,
            DemandeInscription.statut.in_((DemandeStatut.SOUMISE, DemandeStatut.RETENUE)),
        )
        .order_by(DemandeInscription.rang_dans_liste.asc())
        .all()
    )

    def _row(d: DemandeInscription):
        e = d.enfant
        p = e.parent
        sel = d.statut == DemandeStatut.RETENUE
        return {
            "demande_id": d.id,
            "liste": liste.code.value,
            "rang": d.rang_dans_liste,
            "date_inscription": d.date_inscription,
            "updated_at": d.updated_at.isoformat() if d.updated_at else None,
            "statut": d.statut.value,
            "is_reinscrit": (d.statut == DemandeStatut.SOUMISE and d.updated_at is not None),
            "non_validation_reason": d.non_validation_reason or None,
            "selection_finale": sel,
            "parent_matricule": p.matricule,
            "parent_prenom": p.prenom,
            "parent_nom": p.nom,
            "parent_service": p.service_text,
            "parent_telephone": p.telephone,
            "parent_site": p.site_text or None,
            "enfant": {
                "id": e.id,
                "prenom": e.prenom,
                "nom": e.nom,
                "date_naissance": e.date_naissance,
                "sexe": e.sexe.value,
                "lien_parente": e.lien_parente.value,
                "is_titulaire": e.is_titulaire,
            },
        }

    return [_row(d) for d in demandes]


def _row_rejet_admin(d: DemandeInscription) -> dict:
    e = d.enfant
    p = e.parent
    liste = d.liste
    d_ins = d.date_inscription
    if isinstance(d_ins, datetime):
        date_ins_str = d_ins.date().isoformat() if d_ins else ""
    else:
        date_ins_str = d_ins.isoformat() if d_ins else ""
    return {
        "demande_id": d.id,
        "liste": liste.code.value,
        "rang": d.rang_dans_liste,
        "date_inscription": date_ins_str,
        "updated_at": d.updated_at.isoformat() if d.updated_at else None,
        "statut": d.statut.value,
        "rejet_definitif": d.rejet_definitif,
        "non_validation_reason": d.non_validation_reason or None,
        "is_reinscrit": False,
        "parent_matricule": p.matricule,
        "parent_prenom": p.prenom,
        "parent_nom": p.nom,
        "parent_service": p.service_text,
        "parent_telephone": p.telephone,
        "parent_site": p.site_text or None,
        "enfant": {
            "id": e.id,
            "prenom": e.prenom,
            "nom": e.nom,
            "date_naissance": e.date_naissance.isoformat() if e.date_naissance else None,
            "sexe": e.sexe.value,
            "lien_parente": e.lien_parente.value,
            "is_titulaire": e.is_titulaire,
        },
    }


@router.get("/demandes/rejets")
def list_demandes_rejets(
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.GESTIONNAIRE, UserRole.SUPER_ADMIN)),
):
    """NON_VALIDÉES : en attente de correction vs refus définitif (plus de liste P/N1/N2)."""
    _ = user
    ensure_listes_exist(db)
    demandes = (
        db.query(DemandeInscription)
        .options(
            joinedload(DemandeInscription.enfant).joinedload(Enfant.parent),
            joinedload(DemandeInscription.liste),
        )
        .filter(DemandeInscription.statut == DemandeStatut.NON_VALIDEE)
        .order_by(DemandeInscription.updated_at.desc(), DemandeInscription.id.desc())
        .all()
    )
    en_attente = [_row_rejet_admin(d) for d in demandes if not d.rejet_definitif]
    definitifs = [_row_rejet_admin(d) for d in demandes if d.rejet_definitif]
    return {"en_attente_correction": en_attente, "refus_definitifs": definitifs}


def _row_demande_lecture_admin(d: DemandeInscription) -> dict:
    """Même forme que `GET /admin/listes/{code}/demandes` pour compatibilité front (ex. désistés)."""
    e = d.enfant
    p = e.parent
    liste = d.liste
    sel = d.statut == DemandeStatut.RETENUE
    return {
        "demande_id": d.id,
        "liste": liste.code.value,
        "rang": d.rang_dans_liste,
        "date_inscription": d.date_inscription,
        "updated_at": d.updated_at.isoformat() if d.updated_at else None,
        "statut": d.statut.value,
        "is_reinscrit": (d.statut == DemandeStatut.SOUMISE and d.updated_at is not None),
        "non_validation_reason": d.non_validation_reason or None,
        "selection_finale": sel,
        "parent_matricule": p.matricule,
        "parent_prenom": p.prenom,
        "parent_nom": p.nom,
        "parent_service": p.service_text,
        "parent_telephone": p.telephone,
        "parent_site": p.site_text or None,
        "enfant": {
            "id": e.id,
            "prenom": e.prenom,
            "nom": e.nom,
            "date_naissance": e.date_naissance,
            "sexe": e.sexe.value,
            "lien_parente": e.lien_parente.value,
            "is_titulaire": e.is_titulaire,
        },
    }


@router.get("/demandes/desistees")
def list_demandes_desistees(
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.GESTIONNAIRE, UserRole.SUPER_ADMIN)),
):
    """Toutes les demandes DESISTEE (consultation) — ne figurent plus dans GET listes/{code}/demandes."""
    _ = user
    ensure_listes_exist(db)
    demandes = (
        db.query(DemandeInscription)
        .options(
            joinedload(DemandeInscription.enfant).joinedload(Enfant.parent),
            joinedload(DemandeInscription.liste),
        )
        .filter(DemandeInscription.statut == DemandeStatut.DESISTEE)
        .order_by(DemandeInscription.updated_at.desc(), DemandeInscription.id.desc())
        .all()
    )
    return [_row_demande_lecture_admin(d) for d in demandes]


@router.post("/demandes/{demande_id}/corriger-rejet")
def corriger_demande_rejet(
    demande_id: int,
    payload: CorrigerRejetIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.GESTIONNAIRE, UserRole.SUPER_ADMIN)),
):
    _ = user
    demande = admin_corriger_demande_rejetee(
        db=db,
        demande_id=demande_id,
        prenom=payload.enfant_prenom,
        nom=payload.enfant_nom,
        date_naissance=payload.enfant_date_naissance,
        sexe=payload.enfant_sexe,
        lien_parente=payload.enfant_lien_parente,
    )
    db.commit()
    db.refresh(demande)
    return {"ok": True, "demande_id": demande.id}


@router.post("/demandes/{demande_id}/refus-definitif")
def refus_definitif_demande(
    demande_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.GESTIONNAIRE, UserRole.SUPER_ADMIN)),
):
    _ = user
    raise_if_liste_finale_definitive()
    demande = db.query(DemandeInscription).filter(DemandeInscription.id == demande_id).first()
    if not demande:
        raise HTTPException(status_code=404, detail="Demande introuvable.")
    if demande.statut != DemandeStatut.NON_VALIDEE:
        raise HTTPException(status_code=400, detail="Seules les demandes non validées peuvent être refusées définitivement.")
    if demande.rejet_definitif:
        raise HTTPException(status_code=400, detail="Cette demande est déjà en refus définitif.")
    demande.rejet_definitif = True
    demande.updated_at = datetime.now(timezone.utc)
    db.commit()
    return {"ok": True}


@router.post("/demandes/{demande_id}/selection-finale")
def set_selection_finale(
    demande_id: int,
    payload: FinalSelectionIn,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.GESTIONNAIRE, UserRole.SUPER_ADMIN)),
):
    """Validation ou refus des informations de la demande (RETENUE / NON_VALIDEE). Ne remplace pas la liste finale automatique après clôture."""
    raise_if_liste_finale_definitive()
    demande = db.query(DemandeInscription).filter(DemandeInscription.id == demande_id).first()
    if not demande:
        raise HTTPException(status_code=404, detail="Demande introuvable.")

    if not payload.is_selection_finale and not (payload.non_validation_reason and payload.non_validation_reason.strip()):
        raise HTTPException(
            status_code=400,
            detail="Le motif est obligatoire quand l'action est NON (non validée).",
        )

    when = datetime.now(timezone.utc)
    if payload.is_selection_finale:
        demande.statut = DemandeStatut.RETENUE
        demande.non_validation_reason = ""
        demande.rejet_definitif = False
    else:
        demande.statut = DemandeStatut.NON_VALIDEE
        demande.non_validation_reason = (payload.non_validation_reason or "").strip()[:191] or ""
        demande.rejet_definitif = False
    demande.updated_at = when

    is_refus = not payload.is_selection_finale
    enfant_id_h = int(demande.enfant_id)
    demande_id_h = int(demande.id)
    motif_h = (payload.non_validation_reason or "").strip() if is_refus else ""

    if is_refus:
        db.flush()
        resequence_rangs_apres_desistement_valide(db, int(demande.liste_id))
    db.commit()

    if is_refus:
        append_historique_best_effort(
            db,
            event_type="REJET",
            enfant_id=enfant_id_h,
            demande_id=demande_id_h,
            motif=motif_h,
            ajoute_par_id=int(user.id),
            desistement_id=None,
            date_action=when,
        )

    enfant = demande.enfant
    parent = enfant.parent
    admin_emails = collect_admin_emails(db)
    to = uniq_emails(admin_emails)
    if to:
        background.add_task(
            send_email,
            to=to,
            subject=subject_selection(parent.matricule, f"{enfant.prenom} {enfant.nom}"),
            body=body_selection(
                parent_matricule=parent.matricule,
                enfant=f"{enfant.prenom} {enfant.nom}",
                selected=payload.is_selection_finale,
                when=when,
            ),
        )
    return {"ok": True}


def _display_rank_by_order(db: Session, *, liste_id: int, demande_id: int) -> int | None:
    ordered_ids = [
        int(row[0])
        for row in (
            db.query(DemandeInscription.id)
            .filter(DemandeInscription.liste_id == liste_id)
            .order_by(DemandeInscription.date_inscription.asc(), DemandeInscription.id.asc())
            .all()
        )
    ]
    try:
        return ordered_ids.index(int(demande_id)) + 1
    except ValueError:
        return None


@router.post("/demandes/{demande_id}/transferer")
def transferer_demande(
    demande_id: int,
    payload: TransferIn,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.GESTIONNAIRE, UserRole.SUPER_ADMIN)),
):
    raise_if_liste_finale_definitive()
    ensure_listes_exist(db)
    demande = db.query(DemandeInscription).filter(DemandeInscription.id == demande_id).first()
    if not demande:
        raise HTTPException(status_code=404, detail="Demande introuvable.")

    to_liste = db.query(Liste).filter(Liste.code == payload.to_liste_code).first()
    if not to_liste:
        raise HTTPException(status_code=404, detail="Liste cible introuvable.")

    from_liste = demande.liste
    from_rang = demande.rang_dans_liste
    from_display_rank = (
        _display_rank_by_order(db, liste_id=int(from_liste.id), demande_id=int(demande.id)) if from_liste else None
    )
    new_rang = _next_rang_for_liste(db, to_liste.id)
    demande.liste_id = to_liste.id
    demande.rang_dans_liste = new_rang
    # Le transfert est traité comme une nouvelle arrivée dans la liste cible.
    demande.date_inscription = datetime.now(timezone.utc).date()
    enfant = demande.enfant
    if to_liste.code == ListeCode.PRINCIPALE:
        (
            db.query(Enfant)
            .filter(Enfant.parent_id == enfant.parent_id, Enfant.id != enfant.id, Enfant.is_titulaire.is_(True))
            .update({Enfant.is_titulaire: False}, synchronize_session=False)
        )
        enfant.is_titulaire = True
    else:
        enfant.is_titulaire = False
    db.commit()
    to_display_rank = _display_rank_by_order(db, liste_id=int(to_liste.id), demande_id=int(demande.id))

    parent = enfant.parent
    admin_emails = collect_admin_emails(db)
    to = uniq_emails(admin_emails)
    when = datetime.now(timezone.utc)
    if to:
        background.add_task(
            send_email,
            to=to,
            subject=subject_transfer(parent.matricule, f"{enfant.prenom} {enfant.nom}"),
            body=body_transfer(
                parent_matricule=parent.matricule,
                enfant=f"{enfant.prenom} {enfant.nom}",
                from_liste=from_liste.code.value if from_liste else "",
                from_rang=from_display_rank if from_display_rank is not None else from_rang,
                to_liste=to_liste.code.value,
                to_rang=to_display_rank if to_display_rank is not None else new_rang,
                reason=payload.reason,
                when=when,
            ),
        )
    return {"ok": True, "to_liste": to_liste.code.value, "new_rang": new_rang}


@router.get("/stats", summary="Statistiques (gestionnaire / super admin)")
def stats_summary(
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.GESTIONNAIRE, UserRole.SUPER_ADMIN)),
):
    _ = user
    ensure_listes_exist(db)

    total_users = db.query(func.count(User.id)).scalar() or 0
    total_parents = db.query(func.count(Parent.id)).scalar() or 0
    total_enfants = db.query(func.count(Enfant.id)).scalar() or 0
    total_demandes = db.query(func.count(DemandeInscription.id)).scalar() or 0

    liste_finale_ordered = demandes_liste_finale_retenus_si_cloturees(db)
    if liste_finale_ordered is None:
        selected_total = 0
        by_liste_map: dict[str, int] = {}
    else:
        selected_total = len(liste_finale_ordered)
        by_liste_map = {}
        for d in liste_finale_ordered:
            k = d.liste.code.value
            by_liste_map[k] = by_liste_map.get(k, 0) + 1

    desistements_waiting = db.query(func.count(Desistement.id)).scalar() or 0

    # Inscriptions par liste (toutes les demandes liées à la liste) — clés alignées sur le frontend (listeUi).
    inscriptions_rows = (
        db.query(Liste.code, func.count(DemandeInscription.id))
        .join(DemandeInscription, DemandeInscription.liste_id == Liste.id)
        .group_by(Liste.code)
        .all()
    )
    inscriptions_by_liste = {"principale": 0, "attente_n1": 0, "attente_n2": 0}
    for code, cnt in inscriptions_rows:
        if code == ListeCode.PRINCIPALE:
            inscriptions_by_liste["principale"] = int(cnt)
        elif code == ListeCode.ATTENTE_N1:
            inscriptions_by_liste["attente_n1"] = int(cnt)
        elif code == ListeCode.ATTENTE_N2:
            inscriptions_by_liste["attente_n2"] = int(cnt)

    recent_demandes = (
        db.query(DemandeInscription)
        .options(joinedload(DemandeInscription.enfant).joinedload(Enfant.parent), joinedload(DemandeInscription.liste))
        .order_by(
            DemandeInscription.updated_at.desc().nulls_last(),
            DemandeInscription.date_inscription.desc(),
            DemandeInscription.id.desc(),
        )
        .limit(5)
        .all()
    )
    recent_activity: list[dict] = []
    for d in recent_demandes:
        e = d.enfant
        p = e.parent
        lc = d.liste.code
        if lc == ListeCode.PRINCIPALE:
            liste_ui = "principale"
        elif lc == ListeCode.ATTENTE_N1:
            liste_ui = "attente_n1"
        else:
            liste_ui = "attente_n2"
        di = d.date_inscription
        date_iso = di.isoformat() if hasattr(di, "isoformat") else str(di)
        recent_activity.append(
            {
                "id": str(e.id),
                "prenom": e.prenom,
                "nom": e.nom,
                "parent_prenom": p.prenom,
                "parent_nom": p.nom,
                "parent_matricule": p.matricule,
                "liste": liste_ui,
                "date_inscription": date_iso,
            }
        )

    return {
        "total_users": int(total_users),
        "total_parents": int(total_parents),
        "total_enfants": int(total_enfants),
        "total_demandes": int(total_demandes),
        "selected_total": int(selected_total),
        "selected_by_liste": by_liste_map,
        "inscriptions_by_liste": inscriptions_by_liste,
        "recent_activity": recent_activity,
        "desistements_waiting": int(desistements_waiting),
    }


@router.post("/demandes/{demande_id}/swap-rang")
def swap_rang(
    demande_id: int,
    payload: SwapRangIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.GESTIONNAIRE, UserRole.SUPER_ADMIN)),
):
    _ = user
    raise_if_liste_finale_definitive()
    d1 = db.query(DemandeInscription).filter(DemandeInscription.id == demande_id).first()
    d2 = db.query(DemandeInscription).filter(DemandeInscription.id == payload.other_demande_id).first()
    if not d1 or not d2:
        raise HTTPException(status_code=404, detail="Demandes introuvables.")
    if d1.liste_id != d2.liste_id:
        raise HTTPException(status_code=400, detail="Swap impossible : demandes dans des listes différentes.")

    db.execute(text("SELECT pg_advisory_xact_lock(:k)"), {"k": int(d1.liste_id)})
    rang1 = d1.rang_dans_liste
    rang2 = d2.rang_dans_liste

    d1.rang_dans_liste = -999999
    db.flush()
    d2.rang_dans_liste = rang1
    d1.rang_dans_liste = rang2
    db.commit()

    return {"ok": True, "liste_id": d1.liste_id, "rang1": d2.rang_dans_liste, "rang2": d1.rang_dans_liste}


def _selection_event_time(d: DemandeInscription) -> datetime | None:
    if d.updated_at:
        return d.updated_at if d.updated_at.tzinfo else d.updated_at.replace(tzinfo=timezone.utc)
    return datetime.combine(d.date_inscription, datetime.min.time(), tzinfo=timezone.utc)


@router.get("/historique", summary="Historique consolidé (gestionnaire / super admin)")
def historique_actions(
    limit: int = 200,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.GESTIONNAIRE, UserRole.SUPER_ADMIN)),
):
    _ = user
    safe_limit = max(1, min(limit, 500))

    events: list[dict] = []

    def _push_event(*, key: str, when: datetime | None, utilisateur: str, role_label: str, action: str, details: str, cible: str | None):
        if when is None:
            return
        local_when = when.astimezone() if when.tzinfo else when
        events.append(
            {
                "id": key,
                "timestamp": local_when,
                "date": local_when.date().isoformat(),
                "heure": local_when.strftime("%H:%M"),
                "utilisateur": utilisateur,
                "role": role_label,
                "action": action,
                "details": details,
                "cible": cible,
            }
        )

    demandes = (
        db.query(DemandeInscription)
        .join(Enfant, Enfant.id == DemandeInscription.enfant_id)
        .join(Parent, Parent.id == Enfant.parent_id)
        .join(Liste, Liste.id == DemandeInscription.liste_id)
        .order_by(DemandeInscription.date_inscription.desc())
        .limit(safe_limit)
        .all()
    )

    for d in demandes:
        enfant = d.enfant
        parent = enfant.parent
        cible = f"{enfant.prenom} {enfant.nom}"

        _push_event(
            key=f"inscription_{d.id}",
            when=datetime.combine(d.date_inscription, datetime.min.time(), tzinfo=timezone.utc),
            utilisateur=parent.matricule,
            role_label="Parent",
            action="Inscription",
            details=f"Inscription de {cible} dans {d.liste.code.value}",
            cible=cible,
        )

        if d.statut in (DemandeStatut.RETENUE, DemandeStatut.NON_VALIDEE):
            st = _selection_event_time(d)
            if d.statut == DemandeStatut.NON_VALIDEE:
                reason = f" Motif : {d.non_validation_reason}" if d.non_validation_reason else ""
                detail = f"Demande refusée pour {cible}.{reason}"
                action = "Refus"
            else:
                detail = f"Demande validée pour {cible}."
                action = "Validation"
            _push_event(
                key=f"selection_{d.id}",
                when=st,
                utilisateur="Administrateur",
                role_label="Admin",
                action=action,
                details=detail,
                cible=cible,
            )

    desistements = (
        db.query(Desistement)
        .join(DemandeInscription, DemandeInscription.id == Desistement.demande_inscription_id)
        .join(Enfant, Enfant.id == DemandeInscription.enfant_id)
        .join(Parent, Parent.id == Enfant.parent_id)
        .order_by(Desistement.created_at.desc())
        .limit(safe_limit)
        .all()
    )

    for d in desistements:
        demande = d.demande_inscription
        enfant = demande.enfant
        parent = enfant.parent
        cible = f"{enfant.prenom} {enfant.nom}"
        when_ds = d.created_at
        if when_ds and when_ds.tzinfo is None:
            when_ds = when_ds.replace(tzinfo=timezone.utc)

        _push_event(
            key=f"desist_req_{d.id}",
            when=when_ds,
            utilisateur=parent.matricule,
            role_label="Parent",
            action="Désistement demandé",
            details=f"Désistement demandé pour {cible}.",
            cible=cible,
        )

    events.sort(key=lambda e: e["timestamp"], reverse=True)
    trimmed = events[:safe_limit]
    for e in trimmed:
        e.pop("timestamp", None)
    return trimmed


@router.get("/desistements/en-attente")
def desistements_en_attente(
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.GESTIONNAIRE, UserRole.SUPER_ADMIN)),
):
    _ = user
    desistements = (
        db.query(Desistement)
        .join(DemandeInscription, DemandeInscription.id == Desistement.demande_inscription_id)
        .order_by(Desistement.created_at.asc())
        .all()
    )

    out = []
    for d in desistements:
        demande = d.demande_inscription
        enfant = demande.enfant
        parent = enfant.parent
        out.append(
            {
                "desistement_id": d.id,
                "requested_at": d.created_at,
                "reason": d.raison,
                "demande_id": demande.id,
                "parent_matricule": parent.matricule,
                "enfant": {"id": enfant.id, "prenom": enfant.prenom, "nom": enfant.nom},
            }
        )
    return out


@router.post("/desistements/{desistement_id}/valider")
def valider_desistement(
    desistement_id: int,
    payload: DesistementValidateIn,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.GESTIONNAIRE, UserRole.SUPER_ADMIN)),
):
    raise_if_liste_finale_definitive()
    d = db.query(Desistement).filter(Desistement.id == desistement_id).first()
    if not d:
        raise HTTPException(status_code=404, detail="Désistement introuvable.")

    if not payload.validated:
        return {"ok": True}

    demande = d.demande_inscription
    enfant = demande.enfant
    parent = enfant.parent

    desistement_pk = int(d.id)
    enfant_id_h = int(enfant.id)
    demande_id_h = int(demande.id)
    motif_h = (d.raison or "").strip()

    demande.statut = DemandeStatut.DESISTEE
    demande.updated_at = datetime.now(timezone.utc)
    validated_at = datetime.now(timezone.utc)
    db.delete(d)
    db.flush()
    resequence_rangs_apres_desistement_valide(db, int(demande.liste_id))
    db.commit()

    append_historique_best_effort(
        db,
        event_type="DESISTEMENT",
        enfant_id=enfant_id_h,
        demande_id=demande_id_h,
        motif=motif_h,
        ajoute_par_id=int(user.id),
        desistement_id=desistement_pk,
        date_action=validated_at,
    )

    admin_emails = collect_admin_emails(db)
    enfant_label = f"{enfant.prenom} {enfant.nom}"
    to_admins = uniq_emails(admin_emails)
    if to_admins:
        background.add_task(
            send_email,
            to=to_admins,
            subject=subject_desistement_valide_admin(parent.matricule, enfant_label),
            body=body_desistement_validated_admin(
                parent_matricule=parent.matricule,
                enfant=enfant_label,
                when=validated_at,
            ),
        )
    return {"ok": True}
