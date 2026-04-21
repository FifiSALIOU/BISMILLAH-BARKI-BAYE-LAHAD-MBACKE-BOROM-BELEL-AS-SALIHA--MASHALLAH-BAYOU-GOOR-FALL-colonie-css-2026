from __future__ import annotations

from datetime import date, datetime, timezone
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.api.deps import require_roles
from app.db.session import get_db
from app.models.enums import DemandeStatut, LienParente, ListeCode, Sexe, UserRole
from app.models.models import DemandeInscription, Enfant, Liste, Parent, User
from app.schemas.inscriptions import (
    DemandeOut,
    DesistementRequestIn,
    EnfantCorrectionIn,
    InscriptionCreateIn,
    TitulaireUpdateIn,
    TransparenceInscriptionOut,
)
from app.services.historique_metier import append_historique_best_effort
from app.services.inscriptions import (
    _date_naissance_dans_plage,
    _next_rang_for_liste,
    auto_sync_enfants_eligibles_du_parent,
    cancel_desistement,
    create_inscription_for_parent_user,
    ensure_listes_exist,
    parent_corriger_demande_sans_changer_rang,
    reinscrire_desiste,
    request_desistement,
    set_suppleant_n1,
    set_suppleant_n2,
    set_titulaire,
)
from app.services.users import (
    TELEPHONE_DEJA_UTILISE_DETAIL,
    normalize_parent_telephone_for_storage,
    raise_if_parent_telephone_conflict,
)
from app.services.email import send_email, uniq_emails
from app.services.notify_helpers import collect_admin_emails
from app.services.liste_finale_compute import demandes_liste_finale_retenus_si_cloturees
from app.services.liste_finale_lock import liste_finale_definitive_validee
from app.services.runtime_settings_store import get_max_enfants_par_parent
from app.services.email_templates import (
    body_desistement_validated_admin,
    body_inscription_admin_notify,
    body_titulaire,
    subject_desistement_valide_admin,
    subject_inscription_admin_notify,
    subject_titulaire,
    # Anciennement pour un désistement « en attente » : subject_desistement_admin, body_desistement_requested_admin.
)

router = APIRouter(prefix="/parent", tags=["parent"])


_JUSTIFICATIFS_DIR = Path(__file__).resolve().parents[3] / "data" / "justificatifs"


class ParentTelephoneIn(BaseModel):
    telephone: str = Field(..., min_length=3, max_length=191)


def _save_justificatif_file(upload: UploadFile) -> tuple[str, str, str | None, int]:
    _JUSTIFICATIFS_DIR.mkdir(parents=True, exist_ok=True)
    original = (upload.filename or "document").strip() or "document"
    safe_name = original.replace("\\", "_").replace("/", "_")
    unique_name = f"{uuid4().hex}_{safe_name}"
    target = _JUSTIFICATIFS_DIR / unique_name
    content = upload.file.read()
    target.write_bytes(content)
    return (str(target), safe_name[:255], upload.content_type, len(content))


@router.post("/telephone")
def update_parent_telephone(
    payload: ParentTelephoneIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.PARENT)),
):
    parent = db.query(Parent).filter(Parent.user_id == user.id).first()
    if parent is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Parent introuvable.")

    tel = (payload.telephone or "").strip()
    if not tel:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Numéro de téléphone requis.")

    tel_stash = normalize_parent_telephone_for_storage(tel, matricule=parent.matricule)
    raise_if_parent_telephone_conflict(db, tel_stash=tel_stash, parent=parent)
    parent.telephone = tel_stash
    try:
        db.commit()
    except IntegrityError as e:
        db.rollback()
        raw = str(getattr(e, "orig", e) or e).lower()
        if "telephone" in raw or "parents_telephone" in raw:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=TELEPHONE_DEJA_UTILISE_DETAIL,
            ) from None
        raise
    db.refresh(parent)
    return {"ok": True, "telephone": parent.telephone}


def _save_justificatifs_files(uploads: list[UploadFile]) -> tuple[str, str, str | None, int]:
    valid_uploads = [u for u in uploads if u is not None and (u.filename or "").strip() != ""]
    if not valid_uploads:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Veuillez joindre au moins un document justificatif.",
        )
    if len(valid_uploads) > 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Veuillez joindre un seul document justificatif.",
        )

    return _save_justificatif_file(valid_uploads[0])


@router.post("/inscriptions", response_model=DemandeOut)
def creer_inscription(
    payload: InscriptionCreateIn,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.PARENT)),
) -> DemandeOut:
    try:
        demande = create_inscription_for_parent_user(
            db=db,
            user=user,
            parent_prenom=payload.parent.prenom,
            parent_nom=payload.parent.nom,
            parent_matricule=payload.parent.matricule,
            parent_service_nom=payload.parent.service,
            parent_email=payload.parent.email,
            parent_telephone=payload.parent.telephone,
            parent_site_code=payload.parent.site_code,
            enfant_prenom=payload.enfant.prenom,
            enfant_nom=payload.enfant.nom,
            enfant_date_naissance=payload.enfant.date_naissance,
            enfant_sexe=payload.enfant.sexe,
            enfant_lien_parente=payload.enfant.lien_parente,
        )
        db.commit()
    except IntegrityError as e:
        db.rollback()
        raw = str(getattr(e, "orig", e) or e).lower()
        if "telephone" in raw or "parents_telephone" in raw:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=TELEPHONE_DEJA_UTILISE_DETAIL,
            ) from None
        raise
    db.refresh(demande)
    out = _to_demande_out(db, demande)

    admin_emails = collect_admin_emails(db)

    enfant_label = f"{payload.enfant.prenom} {payload.enfant.nom}"
    # Heure réelle d’enregistrement (created_at côté base) — pas seulement la date « métier » date_inscription (minuit).
    enregistrement_when = demande.created_at if demande.created_at is not None else datetime.now(timezone.utc)

    to_admins = uniq_emails(admin_emails)
    if to_admins:
        subject_admin = subject_inscription_admin_notify(payload.parent.matricule, enfant_label)
        body_admin = body_inscription_admin_notify(
            parent_matricule=payload.parent.matricule,
            parent_prenom=payload.parent.prenom,
            parent_nom=payload.parent.nom,
            enfant_prenom=payload.enfant.prenom,
            enfant_nom=payload.enfant.nom,
            liste=out.liste_code,
            rang=out.rang_dans_liste,
            date=enregistrement_when,
        )
        background.add_task(send_email, to=to_admins, subject=subject_admin, body=body_admin)

    return out


@router.post("/inscriptions-n2", response_model=DemandeOut)
def creer_inscription_non_biologique_n2(
    enfant_prenom: str = Form(...),
    enfant_nom: str = Form(...),
    enfant_date_naissance: date = Form(...),
    enfant_sexe: str = Form(...),
    justificatif: list[UploadFile] = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.PARENT)),
) -> DemandeOut:
    parent = db.query(Parent).filter(Parent.user_id == user.id).first()
    if parent is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Parent introuvable.")

    ensure_listes_exist(db)
    liste_p = db.query(Liste).filter(Liste.code == ListeCode.PRINCIPALE).first()
    liste_n1 = db.query(Liste).filter(Liste.code == ListeCode.ATTENTE_N1).first()
    liste_n2 = db.query(Liste).filter(Liste.code == ListeCode.ATTENTE_N2).first()
    if liste_p is None or liste_n1 is None or liste_n2 is None:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Liste introuvable.")

    max_ep = get_max_enfants_par_parent(default=2)
    occupe_titulaire = (
        db.query(DemandeInscription)
        .join(Enfant, Enfant.id == DemandeInscription.enfant_id)
        .filter(
            Enfant.parent_id == parent.id,
            DemandeInscription.liste_id == liste_p.id,
            DemandeInscription.statut.in_((DemandeStatut.SOUMISE, DemandeStatut.RETENUE)),
        )
        .first()
        is not None
    )
    occupe_n1 = (
        db.query(DemandeInscription)
        .join(Enfant, Enfant.id == DemandeInscription.enfant_id)
        .filter(
            Enfant.parent_id == parent.id,
            DemandeInscription.liste_id == liste_n1.id,
            DemandeInscription.statut.in_((DemandeStatut.SOUMISE, DemandeStatut.RETENUE)),
        )
        .first()
        is not None
    )
    occupe_n2_bio = (
        db.query(DemandeInscription)
        .join(Enfant, Enfant.id == DemandeInscription.enfant_id)
        .filter(
            Enfant.parent_id == parent.id,
            DemandeInscription.liste_id == liste_n2.id,
            Enfant.lien_parente != LienParente.AUTRE,
            DemandeInscription.statut.in_((DemandeStatut.SOUMISE, DemandeStatut.RETENUE)),
        )
        .first()
        is not None
    )
    places_listes_parent_saison = (1 if occupe_titulaire else 0) + (1 if occupe_n1 else 0) + (1 if occupe_n2_bio else 0)
    if places_listes_parent_saison >= max_ep:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Limite maximale atteinte pour cette saison. Impossible d'inscrire un enfant non biologique.",
        )

    # Règle métier N2 non biologique :
    # une seule inscription non biologique est autorisée par parent.
    nb_non_bio_deja_inscrits = (
        db.query(func.count(func.distinct(Enfant.id)))
        .select_from(Enfant)
        .join(DemandeInscription, DemandeInscription.enfant_id == Enfant.id)
        .filter(Enfant.parent_id == parent.id, Enfant.lien_parente == LienParente.AUTRE)
        .scalar()
        or 0
    )
    if nb_non_bio_deja_inscrits >= 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Vous avez déjà effectué votre unique inscription autorisée pour un enfant non biologique.",
        )

    if enfant_sexe not in ("M", "F"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Sexe invalide.")
    if enfant_date_naissance.year < 2012 or enfant_date_naissance.year > 2019:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Date de naissance invalide : elle doit être comprise entre 2012 et 2019.",
        )

    target_liste = liste_n2

    path, nom_fichier, mime, taille = _save_justificatifs_files(justificatif)
    enfant = Enfant(
        parent_id=parent.id,
        prenom=enfant_prenom.strip()[:191],
        nom=enfant_nom.strip()[:191],
        date_naissance=enfant_date_naissance,
        sexe=Sexe.M if enfant_sexe == "M" else Sexe.F,
        lien_parente=LienParente.AUTRE,
        is_titulaire=False,
    )
    db.add(enfant)
    db.flush()

    rang = _next_rang_for_liste(db, int(target_liste.id))
    now_utc = datetime.now(timezone.utc)
    demande = DemandeInscription(
        enfant_id=enfant.id,
        liste_id=target_liste.id,
        rang_dans_liste=rang,
        date_inscription=date.today(),
        statut=DemandeStatut.SOUMISE,
        non_validation_reason="",
        user_id=user.id,
        justificatif_path=path,
        justificatif_nom_fichier=nom_fichier,
        justificatif_mime_type=(mime or "")[:100] or None,
        justificatif_taille=taille,
        justificatif_uploaded_at=now_utc,
        created_at=now_utc,
        updated_at=now_utc,
    )
    db.add(demande)
    db.commit()
    db.refresh(demande)
    return _to_demande_out(db, demande)


@router.get("/demandes", response_model=list[DemandeOut])
def mes_demandes(
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.PARENT)),
) -> list[DemandeOut]:
    parent = db.query(Parent).filter(Parent.user_id == user.id).first()
    if not parent:
        return []
    auto_sync_enfants_eligibles_du_parent(db=db, user=user)
    db.commit()
    demandes = (
        db.query(DemandeInscription)
        .options(joinedload(DemandeInscription.desistement))
        .join(Enfant, Enfant.id == DemandeInscription.enfant_id)
        .filter(Enfant.parent_id == parent.id)
        .order_by(DemandeInscription.date_inscription.asc())
        .all()
    )
    return [_to_demande_out(db, d) for d in demandes if _date_naissance_dans_plage(d.enfant.date_naissance)]


@router.put("/demandes/{demande_id}", response_model=DemandeOut)
def corriger_demande(
    demande_id: int,
    payload: EnfantCorrectionIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.PARENT)),
) -> DemandeOut:
    demande = parent_corriger_demande_sans_changer_rang(
        db=db,
        user=user,
        demande_id=demande_id,
        prenom=payload.prenom,
        nom=payload.nom,
        date_naissance=payload.date_naissance,
        sexe=payload.sexe,
        lien_parente=payload.lien_parente,
    )
    db.commit()
    db.refresh(demande)
    return _to_demande_out(db, demande)


_LISTE_ORDRE: dict[ListeCode, int] = {
    ListeCode.PRINCIPALE: 0,
    ListeCode.ATTENTE_N1: 1,
    ListeCode.ATTENTE_N2: 2,
}


@router.get("/liste-finale")
def liste_finale_globale_parent(
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.PARENT)),
):
    """Liste finale globale (lecture seule) : visible aux parents seulement après validation définitive par l'admin (et clôture des inscriptions)."""
    _ = user
    ensure_listes_exist(db)
    definitive = liste_finale_definitive_validee()
    ordered = demandes_liste_finale_retenus_si_cloturees(db)
    if ordered is None:
        return {"disponible": False, "retenus": [], "liste_finale_definitive": definitive}

    if not definitive:
        return {"disponible": False, "retenus": [], "liste_finale_definitive": False}

    out = []
    for idx, d in enumerate(ordered, start=1):
        e = d.enfant
        p = e.parent
        out.append(
            {
                "position": idx,
                "demande_id": d.id,
                "liste_code": d.liste.code.value,
                "date_inscription": d.date_inscription,
                "parent_matricule": p.matricule,
                "parent_prenom": p.prenom,
                "parent_nom": p.nom,
                "parent_service": p.service_text,
                "enfant_prenom": e.prenom,
                "enfant_nom": e.nom,
                "enfant_date_naissance": e.date_naissance,
                "enfant_sexe": e.sexe.value,
            }
        )
    return {"disponible": True, "retenus": out, "liste_finale_definitive": definitive}


@router.get("/inscriptions-transparence", response_model=list[TransparenceInscriptionOut])
def list_inscriptions_transparence(
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.PARENT)),
) -> list[TransparenceInscriptionOut]:
    """Toutes les demandes d'inscription (listes), en consultation — parent authentifié."""
    _ = user
    ensure_listes_exist(db)
    demandes = (
        db.query(DemandeInscription)
        .options(
            joinedload(DemandeInscription.enfant).joinedload(Enfant.parent),
            joinedload(DemandeInscription.liste),
        )
        .filter(DemandeInscription.liste_id.isnot(None))
        .all()
    )

    def _cle_tri(d: DemandeInscription) -> tuple[int, int, int]:
        code = d.liste.code
        return (_LISTE_ORDRE.get(code, 99), d.rang_dans_liste, d.id)

    demandes_tri = sorted(demandes, key=_cle_tri)
    rows: list[TransparenceInscriptionOut] = []
    for d in demandes_tri:
        e = d.enfant
        p = e.parent
        liste = d.liste
        d_ins = d.date_inscription
        if isinstance(d_ins, datetime):
            when = d_ins if d_ins.tzinfo else d_ins.replace(tzinfo=timezone.utc)
        else:
            when = datetime.combine(d_ins, datetime.min.time(), tzinfo=timezone.utc)
        rows.append(
            TransparenceInscriptionOut(
                demande_id=d.id,
                enfant_id=e.id,
                liste_code=liste.code.value,
                rang_dans_liste=d.rang_dans_liste,
                date_inscription=when,
                updated_at=_dt_aware_utc(d.updated_at),
                is_reinscrit=bool(d.reinscrit_apres_desistement),
                statut_demande=d.statut.value,
                parent_matricule=p.matricule,
                parent_prenom=p.prenom,
                parent_nom=p.nom,
                parent_service=p.service_text,
                parent_site=(p.site_text or "").strip(),
                enfant_prenom=e.prenom,
                enfant_nom=e.nom,
                enfant_date_naissance=e.date_naissance,
                enfant_sexe=e.sexe.value,
                enfant_lien_parente=e.lien_parente.value,
                enfant_is_titulaire=e.is_titulaire,
            )
        )
    return rows


@router.post("/titulaire")
def definir_titulaire(
    payload: TitulaireUpdateIn,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.PARENT)),
):
    parent = db.query(Parent).filter(Parent.user_id == user.id).first()
    old = None
    new = None
    if parent:
        enfants = db.query(Enfant).filter(Enfant.parent_id == parent.id).all()
        demande = (
            db.query(DemandeInscription)
            .join(Enfant, Enfant.id == DemandeInscription.enfant_id)
            .filter(DemandeInscription.id == payload.enfant_id_titulaire, Enfant.parent_id == parent.id)
            .first()
        )
        enfant_cible = demande.enfant if demande is not None else None
        for e in enfants:
            if e.is_titulaire:
                old = f"{e.prenom} {e.nom}"
            if enfant_cible is not None and e.id == enfant_cible.id:
                new = f"{e.prenom} {e.nom}"
            elif enfant_cible is None and e.id == payload.enfant_id_titulaire:
                new = f"{e.prenom} {e.nom}"

    set_titulaire(db=db, user=user, enfant_id_titulaire=payload.enfant_id_titulaire)
    db.commit()

    if parent and new:
        admin_emails = collect_admin_emails(db)
        to = uniq_emails(admin_emails)
        if to:
            background.add_task(
                send_email,
                to=to,
                subject=subject_titulaire(parent.matricule),
                body=body_titulaire(parent_matricule=parent.matricule, new_titulaire=new, old_titulaire=old),
            )
    return {"ok": True}


@router.post("/suppleant-n1")
def definir_suppleant_n1(
    payload: TitulaireUpdateIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.PARENT)),
):
    set_suppleant_n1(db=db, user=user, enfant_id_suppleant=payload.enfant_id_titulaire)
    db.commit()
    return {"ok": True}


@router.post("/suppleant-n2")
def definir_suppleant_n2(
    payload: TitulaireUpdateIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.PARENT)),
):
    set_suppleant_n2(db=db, user=user, enfant_id_suppleant=payload.enfant_id_titulaire)
    db.commit()
    return {"ok": True}


@router.post("/desistement/{demande_id}")
def demander_desistement(
    demande_id: int,
    payload: DesistementRequestIn,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.PARENT)),
):
    parent = db.query(Parent).filter(Parent.user_id == user.id).first()
    enfant_label = ""
    if parent:
        d = (
            db.query(DemandeInscription)
            .join(Enfant, Enfant.id == DemandeInscription.enfant_id)
            .filter(DemandeInscription.id == demande_id, Enfant.parent_id == parent.id)
            .first()
        )
        if d:
            enfant_label = f"{d.enfant.prenom} {d.enfant.nom}"

    request_desistement(db=db, user=user, demande_id=demande_id, reason=payload.reason)
    db.commit()

    r_eid = db.query(DemandeInscription.enfant_id).filter(DemandeInscription.id == demande_id).first()
    if r_eid is not None:
        append_historique_best_effort(
            db,
            event_type="DESISTEMENT",
            enfant_id=int(r_eid[0]),
            demande_id=int(demande_id),
            motif=(payload.reason or "").strip(),
            ajoute_par_id=int(user.id),
            desistement_id=None,
            date_action=datetime.now(timezone.utc),
        )

    if parent and enfant_label:
        admin_emails = collect_admin_emails(db)
        now = datetime.now(timezone.utc)
        to_admins = uniq_emails(admin_emails)
        if to_admins:
            # Ancien envoi (désistement à traiter) : subject_desistement_admin(...),
            # body_desistement_requested_admin(..., reason=payload.reason).
            body_mail = body_desistement_validated_admin(
                parent_matricule=parent.matricule,
                enfant=enfant_label,
                when=now,
            )
            reason = (payload.reason or "").strip()
            if reason:
                body_mail = body_mail.rstrip() + f"\n\nMotif indiqué par le parent : {reason}\n"
            background.add_task(
                send_email,
                to=to_admins,
                subject=subject_desistement_valide_admin(parent.matricule, enfant_label),
                body=body_mail,
            )
    return {"ok": True}


@router.post("/desistement/{demande_id}/annuler")
def annuler_desistement(
    demande_id: int,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.PARENT)),
):
    parent = db.query(Parent).filter(Parent.user_id == user.id).first()
    enfant_label = ""
    if parent:
        d = (
            db.query(DemandeInscription)
            .join(Enfant, Enfant.id == DemandeInscription.enfant_id)
            .filter(DemandeInscription.id == demande_id, Enfant.parent_id == parent.id)
            .first()
        )
        if d:
            enfant_label = f"{d.enfant.prenom} {d.enfant.nom}"

    cancel_desistement(db=db, user=user, demande_id=demande_id)
    db.commit()

    # E-mail « Annulation de désistement » aux admins — désactivé (demande métier).
    # if parent and enfant_label:
    #     admin_emails = collect_admin_emails(db)
    #     now = datetime.now(timezone.utc)
    #     to_admins = uniq_emails(admin_emails)
    #     if to_admins:
    #         background.add_task(
    #             send_email,
    #             to=to_admins,
    #             subject=subject_desistement_annule_admin(parent.matricule, enfant_label),
    #             body=body_desistement_cancelled_admin(
    #                 parent_matricule=parent.matricule,
    #                 enfant=enfant_label,
    #                 when=now,
    #             ),
    #         )
    return {"ok": True}


@router.post("/desistement/{demande_id}/reinscrire", response_model=DemandeOut)
def reinscrire_enfant_desiste(
    demande_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.PARENT)),
):
    demande = reinscrire_desiste(db=db, user=user, demande_id=demande_id)
    db.commit()
    db.refresh(demande)
    return _to_demande_out(db, demande)


def _dt_aware_utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    if dt.tzinfo:
        return dt
    return dt.replace(tzinfo=timezone.utc)


def _date_desistement_affichage(demande: DemandeInscription) -> datetime | None:
    if demande.statut == DemandeStatut.DESISTEE:
        return _dt_aware_utc(demande.updated_at)
    if demande.desistement is not None:
        return _dt_aware_utc(demande.desistement.created_at)
    return None


def _to_demande_out(db: Session, demande: DemandeInscription) -> DemandeOut:
    db.refresh(demande)
    enfant = demande.enfant
    liste = demande.liste
    d_ins = demande.date_inscription
    if isinstance(d_ins, datetime):
        when = d_ins
    else:
        when = datetime.combine(d_ins, datetime.min.time(), tzinfo=timezone.utc)
    return DemandeOut(
        id=demande.id,
        liste_code=(liste.code.value if liste is not None else "NON_INSCRIT"),
        rang_dans_liste=demande.rang_dans_liste,
        date_inscription=when,
        updated_at=_dt_aware_utc(demande.updated_at),
        statut=demande.statut.value,
        non_validation_reason=demande.non_validation_reason or None,
        is_selection_finale=(demande.statut == DemandeStatut.RETENUE),
        has_desistement_pending=(demande.desistement is not None and demande.statut != DemandeStatut.DESISTEE),
        is_reinscrit=bool(demande.reinscrit_apres_desistement),
        rejet_definitif=bool(
            demande.statut == DemandeStatut.NON_VALIDEE and getattr(demande, "rejet_definitif", False)
        ),
        date_desistement=_date_desistement_affichage(demande),
        enfant_id=enfant.id,
        enfant_prenom=enfant.prenom,
        enfant_nom=enfant.nom,
        enfant_date_naissance=enfant.date_naissance,
        enfant_sexe=enfant.sexe.value,
        enfant_lien_parente=enfant.lien_parente.value,
        enfant_is_titulaire=enfant.is_titulaire,
    )

