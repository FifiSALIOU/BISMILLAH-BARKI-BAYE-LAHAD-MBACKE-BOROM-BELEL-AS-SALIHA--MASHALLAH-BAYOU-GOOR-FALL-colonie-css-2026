from __future__ import annotations

from datetime import date, datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.api.deps import require_roles
from app.db.session import get_db
from app.models.enums import DemandeStatut, ListeCode, UserRole
from app.models.models import DemandeInscription, Enfant, Parent, User
from app.schemas.inscriptions import (
    DemandeOut,
    DesistementRequestIn,
    InscriptionCreateIn,
    TitulaireUpdateIn,
    TransparenceInscriptionOut,
)
from app.services.historique_metier import append_historique_best_effort
from app.services.inscriptions import (
    cancel_desistement,
    create_inscription_for_parent_user,
    ensure_listes_exist,
    reinscrire_desiste,
    request_desistement,
    set_titulaire,
)
from app.services.users import TELEPHONE_DEJA_UTILISE_DETAIL
from app.services.email import send_email, uniq_emails
from app.services.notify_helpers import collect_admin_emails
from app.services.liste_finale_compute import demandes_liste_finale_retenus_si_cloturees
from app.services.liste_finale_lock import liste_finale_definitive_validee
from app.services.email_templates import (
    body_desistement_cancelled_admin,
    body_desistement_validated_admin,
    body_inscription_admin_notify,
    body_titulaire,
    subject_desistement_annule_admin,
    subject_desistement_valide_admin,
    subject_inscription_admin_notify,
    subject_titulaire,
    # Anciennement pour un désistement « en attente » : subject_desistement_admin, body_desistement_requested_admin.
)

router = APIRouter(prefix="/parent", tags=["parent"])


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
            date=out.date_inscription,
        )
        background.add_task(send_email, to=to_admins, subject=subject_admin, body=body_admin)

    return out


@router.get("/demandes", response_model=list[DemandeOut])
def mes_demandes(
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.PARENT)),
) -> list[DemandeOut]:
    parent = db.query(Parent).filter(Parent.user_id == user.id).first()
    if not parent:
        return []
    demandes = (
        db.query(DemandeInscription)
        .options(joinedload(DemandeInscription.desistement))
        .join(Enfant, Enfant.id == DemandeInscription.enfant_id)
        .filter(Enfant.parent_id == parent.id)
        .order_by(DemandeInscription.date_inscription.asc())
        .all()
    )
    return [_to_demande_out(db, d) for d in demandes]


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
    """Liste finale globale (lecture seule), publiée seulement après clôture des inscriptions."""
    _ = user
    ensure_listes_exist(db)
    definitive = liste_finale_definitive_validee()
    ordered = demandes_liste_finale_retenus_si_cloturees(db)
    if ordered is None:
        return {"disponible": False, "retenus": [], "liste_finale_definitive": definitive}

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
                is_reinscrit=(d.statut == DemandeStatut.SOUMISE and d.updated_at is not None),
                statut_demande=d.statut.value,
                parent_matricule=p.matricule,
                parent_prenom=p.prenom,
                parent_nom=p.nom,
                parent_service=p.service_text,
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

    if parent and enfant_label:
        admin_emails = collect_admin_emails(db)
        now = datetime.now(timezone.utc)
        to_admins = uniq_emails(admin_emails)
        if to_admins:
            background.add_task(
                send_email,
                to=to_admins,
                subject=subject_desistement_annule_admin(parent.matricule, enfant_label),
                body=body_desistement_cancelled_admin(
                    parent_matricule=parent.matricule,
                    enfant=enfant_label,
                    when=now,
                ),
            )
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
        liste_code=liste.code.value,
        rang_dans_liste=demande.rang_dans_liste,
        date_inscription=when,
        updated_at=_dt_aware_utc(demande.updated_at),
        statut=demande.statut.value,
        non_validation_reason=demande.non_validation_reason or None,
        is_selection_finale=(demande.statut == DemandeStatut.RETENUE),
        has_desistement_pending=(demande.desistement is not None and demande.statut != DemandeStatut.DESISTEE),
        is_reinscrit=(demande.statut == DemandeStatut.SOUMISE and demande.updated_at is not None),
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

