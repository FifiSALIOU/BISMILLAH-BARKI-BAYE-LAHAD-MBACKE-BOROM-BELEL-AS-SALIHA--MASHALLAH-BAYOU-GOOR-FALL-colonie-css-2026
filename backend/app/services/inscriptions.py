from __future__ import annotations

from datetime import date, datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import func, text
from sqlalchemy.orm import Session

from app.models.enums import DemandeStatut, LienParente, ListeCode, Sexe
from app.models.models import DemandeInscription, Enfant, Liste, Parent, Service, User
from app.services.liste_finale_lock import raise_if_liste_finale_definitive
from app.services.runtime_settings_store import get_max_enfants_par_parent, merged_runtime_settings
from app.services.users import (
    _get_or_create_site,
    normalize_parent_nin_for_storage,
    normalize_parent_telephone_for_storage,
    raise_if_parent_telephone_conflict,
)

_VALIDATION_INFOS_OK_MARKER = "__INFOS_VALIDEES_AVANT_DESISTEMENT__"


def demande_compte_pour_rang_actif(d: DemandeInscription) -> bool:
    """Rangs visibles 1..n : SOUMISE et RETENUE. NON_VALIDEE et DESISTEE : queue (renumérotation inchangée : `*_sorted` puis refoulement)."""
    return d.statut in (DemandeStatut.SOUMISE, DemandeStatut.RETENUE)


def _require_not_rejet_definitif(demande: DemandeInscription) -> None:
    if demande.statut == DemandeStatut.NON_VALIDEE and demande.rejet_definitif:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cette demande a été définitivement refusée.",
        )


def _plage_naissance_annees() -> tuple[int, int]:
    s = merged_runtime_settings()
    lo = int(s.get("ageMin", 2012))
    hi = int(s.get("ageMax", 2019))
    return lo, hi


def _validate_annee_naissance(d: date) -> None:
    annee = int(d.year)
    if not _date_naissance_dans_plage(d):
        lo, hi = _plage_naissance_annees()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Inscription rejetée : année de naissance invalide ({annee}). Doit être entre {lo} et {hi}.",
        )


def _date_naissance_dans_plage(d: date) -> bool:
    lo, hi = _plage_naissance_annees()
    return lo <= int(d.year) <= hi


def _get_or_create_service(db: Session, nom: str) -> Service:
    svc = db.query(Service).filter(Service.nom == nom).first()
    if svc:
        return svc
    svc = Service(nom=nom, description="-")
    db.add(svc)
    db.flush()
    return svc


def ensure_listes_exist(db: Session) -> None:
    wanted = {
        ListeCode.PRINCIPALE: ("Liste principale", "Enfants titulaires (premiers enfants).", 999),
        ListeCode.ATTENTE_N1: ("Liste d’attente N°1", "Deuxièmes enfants (lien ≠ Autre).", 999),
        ListeCode.ATTENTE_N2: ("Liste d’attente N°2", "Deuxièmes enfants (lien = Autre).", 999),
    }
    existing = {l.code for l in db.query(Liste).all()}
    for code, (nom, desc, nmax) in wanted.items():
        if code not in existing:
            db.add(Liste(code=code, nom=nom, description=desc, nombre_max=nmax))
    db.flush()


def _next_rang_for_liste(db: Session, liste_id: int) -> int:
    """
    Prochain rang pour une **nouvelle** demande active : immédiatement après les actifs (1..n),
    en repoussant les lignes DESISTEE (même ordre relatif) comme après un désistement.
    Évite que le nouvel inscrit prenne max(tous les rangs)+1 alors que des trous visibles
    existent parmi les actifs à cause des désistés conservés sur la liste.
    """
    db.execute(text("SELECT pg_advisory_xact_lock(:k)"), {"k": int(liste_id)})
    rows = (
        db.query(DemandeInscription)
        .filter(DemandeInscription.liste_id == liste_id)
        .order_by(DemandeInscription.id.asc())
        .all()
    )
    if not rows:
        return 1

    active = [d for d in rows if demande_compte_pour_rang_actif(d)]
    queue = [d for d in rows if not demande_compte_pour_rang_actif(d)]
    active_sorted = sorted(active, key=lambda d: (d.rang_dans_liste, d.id))
    queue_sorted = sorted(queue, key=lambda d: (d.rang_dans_liste, d.id))

    temp = -1
    for d in rows:
        d.rang_dans_liste = temp
        temp -= 1
    db.flush()

    r = 1
    for d in active_sorted:
        d.rang_dans_liste = r
        r += 1
    next_rang = r
    for d in queue_sorted:
        d.rang_dans_liste = r
        r += 1
    db.flush()
    return int(next_rang)


def resequence_rangs_pour_liste(db: Session, liste_id: int, *, demande_reinscrite_id: int) -> None:
    """
    Après réinscription : les actifs (hors la ligne réinscrite) gardent l’ordre des rangs actuels
    (1,2,4 → 1,2,3) ; la demande réinscrite est seule en dernière position. Les désistés restent après.
    """
    db.execute(text("SELECT pg_advisory_xact_lock(:k)"), {"k": int(liste_id)})
    rows = (
        db.query(DemandeInscription)
        .filter(DemandeInscription.liste_id == liste_id)
        .order_by(DemandeInscription.id.asc())
        .all()
    )
    if not rows:
        return

    active = [d for d in rows if demande_compte_pour_rang_actif(d)]
    queue = [d for d in rows if not demande_compte_pour_rang_actif(d)]
    rein = [d for d in active if int(d.id) == int(demande_reinscrite_id)]
    others = [d for d in active if int(d.id) != int(demande_reinscrite_id)]
    if not rein:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Réinscription : demande introuvable parmi les actifs de la liste.",
        )
    others_sorted = sorted(others, key=lambda d: (d.rang_dans_liste, d.id))
    active_sorted = others_sorted + rein
    queue_sorted = sorted(queue, key=lambda x: (x.rang_dans_liste, x.id))

    temp = -1
    for d in rows:
        d.rang_dans_liste = temp
        temp -= 1
    db.flush()

    r = 1
    for d in active_sorted:
        d.rang_dans_liste = r
        r += 1
    for d in queue_sorted:
        d.rang_dans_liste = r
        r += 1
    db.flush()


def resequence_rangs_apres_desistement_valide(db: Session, liste_id: int) -> None:
    """
    Après validation gestionnaire d’un désistement : mêmes règles que `resequence_rangs_pour_liste`
    sans ligne réinscrite — actifs (non DESISTEE) en 1..n dans l’ordre (rang, id), puis désistés.
    """
    db.execute(text("SELECT pg_advisory_xact_lock(:k)"), {"k": int(liste_id)})
    rows = (
        db.query(DemandeInscription)
        .filter(DemandeInscription.liste_id == liste_id)
        .order_by(DemandeInscription.id.asc())
        .all()
    )
    if not rows:
        return
    active = [d for d in rows if demande_compte_pour_rang_actif(d)]
    queue = [d for d in rows if not demande_compte_pour_rang_actif(d)]
    active_sorted = sorted(active, key=lambda d: (d.rang_dans_liste, d.id))
    queue_sorted = sorted(queue, key=lambda d: (d.rang_dans_liste, d.id))
    temp = -1
    for d in rows:
        d.rang_dans_liste = temp
        temp -= 1
    db.flush()
    r = 1
    for d in active_sorted:
        d.rang_dans_liste = r
        r += 1
    for d in queue_sorted:
        d.rang_dans_liste = r
        r += 1
    db.flush()


def _compute_target_liste_code(*, lien_parente: LienParente, inscription_index: int) -> ListeCode:
    """inscription_index : 1 = 1er enfant inscrit pour ce parent, 2 = 2e, 3 = 3e, etc."""
    if inscription_index < 1:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Erreur interne : index d'inscription invalide.",
        )
    if inscription_index == 1:
        if lien_parente == LienParente.AUTRE:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Inscription rejetée : pour le 1er enfant (titulaire), le lien de parenté ne peut pas être « Autre ».",
            )
        return ListeCode.PRINCIPALE
    if inscription_index == 2:
        return ListeCode.ATTENTE_N2 if lien_parente == LienParente.AUTRE else ListeCode.ATTENTE_N1
    # À partir du 3e enfant : toujours liste d'attente N°2, quel que soit le lien de parenté.
    return ListeCode.ATTENTE_N2


def create_inscription_for_parent_user(
    *,
    db: Session,
    user: User,
    parent_prenom: str,
    parent_nom: str,
    parent_matricule: str,
    parent_service_nom: str,
    parent_email: str | None,
    parent_telephone: str,
    parent_site_code: str,
    enfant_prenom: str,
    enfant_nom: str,
    enfant_date_naissance: date,
    enfant_sexe,
    enfant_lien_parente: LienParente,
) -> DemandeInscription:
    if user.matricule is None or user.matricule != parent_matricule:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Matricule non autorisé.")

    raise_if_liste_finale_definitive()

    _validate_annee_naissance(enfant_date_naissance)

    site_row = _get_or_create_site(db, parent_site_code)
    if site_row is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Agence invalide ou non renseignée.",
        )

    email_stash = (parent_email or "").strip() or None
    if email_stash:
        email_stash = email_stash[:191]
    tel_stash = normalize_parent_telephone_for_storage(
        parent_telephone.strip(), matricule=parent_matricule
    )

    parent = db.query(Parent).filter(Parent.user_id == user.id).first()
    if parent is None:
        service = _get_or_create_service(db, parent_service_nom)
        parent = Parent(
            prenom=parent_prenom,
            nom=parent_nom,
            matricule=parent_matricule,
            email=email_stash,
            telephone=tel_stash,
            genre="-",
            nin=normalize_parent_nin_for_storage(None, matricule=parent_matricule),
            adresse="-",
            service_text=service.nom,
            site_text=site_row.nom,
            service_id=service.id,
            site_id=site_row.id,
            user_id=user.id,
        )
        db.add(parent)
        db.flush()
    else:
        service = _get_or_create_service(db, parent_service_nom)
        parent.prenom = parent_prenom
        parent.nom = parent_nom
        parent.matricule = parent_matricule
        parent.email = email_stash
        parent.telephone = tel_stash
        parent.service_id = service.id
        parent.service_text = service.nom
        parent.site_id = site_row.id
        parent.site_text = site_row.nom

    raise_if_parent_telephone_conflict(db, tel_stash=tel_stash, parent=parent)

    # Compte les enfants qui ont au moins une demande (évite de bloquer si une demande a été
    # supprimée en SQL sans supprimer la ligne `enfants`, qui ne s'affiche plus côté parent).
    nb_enfants_avec_demande = (
        db.query(func.count(func.distinct(Enfant.id)))
        .select_from(Enfant)
        .join(DemandeInscription, DemandeInscription.enfant_id == Enfant.id)
        .filter(Enfant.parent_id == parent.id)
        .scalar()
        or 0
    )

    inscription_index = nb_enfants_avec_demande + 1
    is_first_child = inscription_index == 1
    target_code = _compute_target_liste_code(lien_parente=enfant_lien_parente, inscription_index=inscription_index)

    ensure_listes_exist(db)
    target_liste = db.query(Liste).filter(Liste.code == target_code).first()
    if not target_liste:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Liste non configurée.")

    enfant = Enfant(
        parent_id=parent.id,
        prenom=enfant_prenom,
        nom=enfant_nom,
        date_naissance=enfant_date_naissance,
        sexe=enfant_sexe,
        lien_parente=enfant_lien_parente,
        is_titulaire=is_first_child,
    )
    db.add(enfant)
    db.flush()

    rang = _next_rang_for_liste(db, target_liste.id)
    now_utc = datetime.now(timezone.utc)
    demande = DemandeInscription(
        enfant_id=enfant.id,
        liste_id=target_liste.id,
        rang_dans_liste=rang,
        date_inscription=date.today(),
        inscription_at=now_utc,
        statut=DemandeStatut.SOUMISE,
        non_validation_reason="",
        user_id=user.id,
        created_at=now_utc,
        updated_at=now_utc,
    )
    db.add(demande)
    db.flush()

    return demande


def auto_sync_enfants_eligibles_du_parent(*, db: Session, user: User) -> None:
    """Crée une demande « vierge » pour chaque enfant éligible (plage d'âge paramétrée) sans demande."""
    parent = db.query(Parent).filter(Parent.user_id == user.id).first()
    if parent is None:
        return

    raise_if_liste_finale_definitive()
    ensure_listes_exist(db)

    enfants = (
        db.query(Enfant)
        .filter(Enfant.parent_id == parent.id)
        .order_by(Enfant.created_at.asc().nulls_last(), Enfant.id.asc())
        .all()
    )
    if not enfants:
        return

    enfants_eligibles = [e for e in enfants if _date_naissance_dans_plage(e.date_naissance)]
    if not enfants_eligibles:
        return

    existantes = (
        db.query(DemandeInscription)
        .join(Enfant, Enfant.id == DemandeInscription.enfant_id)
        .filter(Enfant.parent_id == parent.id)
        .all()
    )
    demande_by_enfant_id = {int(d.enfant_id): d for d in existantes}

    for enfant in enfants_eligibles:
        if int(enfant.id) in demande_by_enfant_id:
            continue

        # Aucun rang/liste en base tant que le parent n'a pas fait ses choix.
        enfant.is_titulaire = False
        now_utc = datetime.now(timezone.utc)
        demande = DemandeInscription(
            enfant_id=enfant.id,
            liste_id=None,
            rang_dans_liste=None,
            date_inscription=date.today(),
            inscription_at=now_utc,
            statut=DemandeStatut.SOUMISE,
            non_validation_reason="",
            user_id=user.id,
            created_at=now_utc,
            updated_at=now_utc,
        )
        db.add(demande)
        db.flush()
        demande_by_enfant_id[int(enfant.id)] = demande


def set_titulaire(*, db: Session, user: User, enfant_id_titulaire: int) -> None:
    raise_if_liste_finale_definitive()
    parent = db.query(Parent).filter(Parent.user_id == user.id).first()
    if not parent:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Parent introuvable.")

    enfants = db.query(Enfant).filter(Enfant.parent_id == parent.id).all()
    if len(enfants) == 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Aucun enfant inscrit.")
    enfants_by_id = {int(e.id): e for e in enfants}

    # Le front parent envoie l'id de demande ; on le priorise pour eviter
    # les collisions numeriques possibles avec un id enfant.
    demande = (
        db.query(DemandeInscription)
        .join(Enfant, Enfant.id == DemandeInscription.enfant_id)
        .filter(DemandeInscription.id == enfant_id_titulaire, Enfant.parent_id == parent.id)
        .first()
    )
    enfant_titulaire = demande.enfant if demande is not None else None
    if enfant_titulaire is None:
        # Compat fallback: certains clients peuvent encore envoyer enfant_id.
        enfant_titulaire = enfants_by_id.get(int(enfant_id_titulaire))
    if enfant_titulaire is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Enfant introuvable pour ce parent.")
    dem_check = demande or (
        db.query(DemandeInscription)
        .join(Enfant, Enfant.id == DemandeInscription.enfant_id)
        .filter(Enfant.id == enfant_titulaire.id, Enfant.parent_id == parent.id)
        .first()
    )
    if dem_check is not None:
        _require_not_rejet_definitif(dem_check)

    ancien_titulaire = next((e for e in enfants if e.is_titulaire), None)

    for e in enfants:
        e.is_titulaire = e.id == enfant_titulaire.id

    if ancien_titulaire is None:
        # Premier choix du parent: promotion vers la liste principale.
        dem = (
            db.query(DemandeInscription)
            .join(Enfant, Enfant.id == DemandeInscription.enfant_id)
            .filter(Enfant.id == enfant_titulaire.id, Enfant.parent_id == parent.id)
            .first()
        )
        if dem is None:
            return
        dem.date_inscription = date.today()
        dem.inscription_at = datetime.now(timezone.utc)
        liste_principale = db.query(Liste).filter(Liste.code == ListeCode.PRINCIPALE).first()
        if liste_principale is None:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Liste principale introuvable.")
        old_liste_id = int(dem.liste_id) if dem.liste_id is not None else None
        dem.liste_id = int(liste_principale.id)
        dem.rang_dans_liste = _next_rang_for_liste(db, int(liste_principale.id))
        if old_liste_id is not None:
            _next_rang_for_liste(db, old_liste_id)
        return

    if len(enfants) == 1 or ancien_titulaire.id == enfant_titulaire.id:
        return

    demandes = (
        db.query(DemandeInscription)
        .join(Enfant, Enfant.id == DemandeInscription.enfant_id)
        .filter(Enfant.parent_id == parent.id)
        .all()
    )
    demande_by_enfant_id = {int(d.enfant_id): d for d in demandes}
    ancienne_demande = demande_by_enfant_id.get(int(ancien_titulaire.id))
    nouvelle_demande = demande_by_enfant_id.get(int(enfant_titulaire.id))
    if ancienne_demande is None or nouvelle_demande is None:
        return

    for d in (ancienne_demande, nouvelle_demande):
        _require_not_rejet_definitif(d)

    if (
        ancienne_demande.liste_id is None
        or ancienne_demande.rang_dans_liste is None
        or nouvelle_demande.liste_id is None
        or nouvelle_demande.rang_dans_liste is None
    ):
        return
    ancienne_liste_id = int(ancienne_demande.liste_id)
    ancien_rang = int(ancienne_demande.rang_dans_liste)
    nouvelle_liste_id = int(nouvelle_demande.liste_id)
    nouveau_rang = int(nouvelle_demande.rang_dans_liste)

    for list_id in sorted({ancienne_liste_id, nouvelle_liste_id}):
        db.execute(text("SELECT pg_advisory_xact_lock(:k)"), {"k": list_id})

    # Valeur tampon pour éviter conflit d'unicité (liste_id, rang) pendant le swap.
    ancienne_demande.rang_dans_liste = -999999
    db.flush()
    nouvelle_demande.liste_id = ancienne_liste_id
    nouvelle_demande.rang_dans_liste = ancien_rang
    ancienne_demande.liste_id = nouvelle_liste_id
    ancienne_demande.rang_dans_liste = nouveau_rang


def set_suppleant_n1(*, db: Session, user: User, enfant_id_suppleant: int) -> None:
    raise_if_liste_finale_definitive()
    parent = db.query(Parent).filter(Parent.user_id == user.id).first()
    if not parent:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Parent introuvable.")

    demande = (
        db.query(DemandeInscription)
        .join(Enfant, Enfant.id == DemandeInscription.enfant_id)
        .filter(DemandeInscription.id == enfant_id_suppleant, Enfant.parent_id == parent.id)
        .first()
    )
    if not demande:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Demande introuvable.")
    _require_not_rejet_definitif(demande)

    enfant = demande.enfant
    if enfant.lien_parente == LienParente.AUTRE:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Un enfant 'Autre' ne peut pas être en N1.")

    ensure_listes_exist(db)
    liste_p = db.query(Liste).filter(Liste.code == ListeCode.PRINCIPALE).first()
    liste_n1 = db.query(Liste).filter(Liste.code == ListeCode.ATTENTE_N1).first()
    if liste_p is None or liste_n1 is None:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Liste introuvable.")

    a_titulaire_sur_principale = (
        db.query(DemandeInscription)
        .join(Enfant, Enfant.id == DemandeInscription.enfant_id)
        .filter(
            Enfant.parent_id == parent.id,
            DemandeInscription.liste_id == liste_p.id,
            DemandeInscription.statut.in_((DemandeStatut.SOUMISE, DemandeStatut.RETENUE)),
        )
        .first()
    )
    if a_titulaire_sur_principale is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Définissez d'abord l'enfant titulaire avant le suppléant N°1.",
        )

    old_liste_id = int(demande.liste_id) if demande.liste_id is not None else None
    demande.date_inscription = date.today()
    demande.inscription_at = datetime.now(timezone.utc)
    demande.liste_id = int(liste_n1.id)
    demande.rang_dans_liste = _next_rang_for_liste(db, int(liste_n1.id))
    enfant.is_titulaire = False
    if old_liste_id is not None and old_liste_id != int(liste_n1.id):
        _next_rang_for_liste(db, old_liste_id)


def set_suppleant_n2(*, db: Session, user: User, enfant_id_suppleant: int) -> None:
    """Affecte une demande sans liste à ATTENTE_N2 (troisième enfant biologique) — mêmes patterns que `set_suppleant_n1` (rang via `_next_rang_for_liste`)."""
    raise_if_liste_finale_definitive()
    parent = db.query(Parent).filter(Parent.user_id == user.id).first()
    if not parent:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Parent introuvable.")

    max_ep = get_max_enfants_par_parent(default=2)
    if max_ep < 3:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Paramètre « max enfants par parent » doit être au moins 3 pour positionner un suppléant N°2.",
        )

    demande = (
        db.query(DemandeInscription)
        .join(Enfant, Enfant.id == DemandeInscription.enfant_id)
        .filter(DemandeInscription.id == enfant_id_suppleant, Enfant.parent_id == parent.id)
        .first()
    )
    if not demande:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Demande introuvable.")
    _require_not_rejet_definitif(demande)

    enfant = demande.enfant
    if enfant.lien_parente == LienParente.AUTRE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Un enfant « Autre » doit être inscrit via le parcours liste N°2 dédié.",
        )

    if demande.liste_id is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cette demande a déjà une liste attribuée.",
        )

    ensure_listes_exist(db)
    liste_p = db.query(Liste).filter(Liste.code == ListeCode.PRINCIPALE).first()
    liste_n1 = db.query(Liste).filter(Liste.code == ListeCode.ATTENTE_N1).first()
    liste_n2 = db.query(Liste).filter(Liste.code == ListeCode.ATTENTE_N2).first()
    if liste_p is None or liste_n1 is None or liste_n2 is None:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Liste introuvable.")

    has_p = (
        db.query(DemandeInscription)
        .join(Enfant, Enfant.id == DemandeInscription.enfant_id)
        .filter(
            Enfant.parent_id == parent.id,
            DemandeInscription.liste_id == liste_p.id,
            DemandeInscription.statut.in_((DemandeStatut.SOUMISE, DemandeStatut.RETENUE)),
        )
        .first()
    )
    has_n1 = (
        db.query(DemandeInscription)
        .join(Enfant, Enfant.id == DemandeInscription.enfant_id)
        .filter(
            Enfant.parent_id == parent.id,
            DemandeInscription.liste_id == liste_n1.id,
            DemandeInscription.statut.in_((DemandeStatut.SOUMISE, DemandeStatut.RETENUE)),
        )
        .first()
    )
    if not has_p or not has_n1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Définissez d'abord le titulaire puis le suppléant N°1 avant le suppléant N°2.",
        )

    autre_n2_bio = (
        db.query(DemandeInscription)
        .join(Enfant, Enfant.id == DemandeInscription.enfant_id)
        .filter(
            Enfant.parent_id == parent.id,
            DemandeInscription.liste_id == liste_n2.id,
            Enfant.lien_parente != LienParente.AUTRE,
            DemandeInscription.id != demande.id,
            DemandeInscription.statut.in_((DemandeStatut.SOUMISE, DemandeStatut.RETENUE)),
        )
        .first()
    )
    if autre_n2_bio:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Un suppléant N°2 biologique est déjà positionné pour ce parent.",
        )

    demande.date_inscription = date.today()
    demande.inscription_at = datetime.now(timezone.utc)
    demande.liste_id = int(liste_n2.id)
    demande.rang_dans_liste = _next_rang_for_liste(db, int(liste_n2.id))
    enfant.is_titulaire = False


def request_desistement(*, db: Session, user: User, demande_id: int, reason: str | None) -> None:
    raise_if_liste_finale_definitive()
    # Ancien flux (conservé en mémoire lecture seule) : création d’une ligne `Desistement` en attente,
    # puis validation ultérieure par le gestionnaire. Désormais le désistement parent est appliqué tout de suite
    # (statut DESISTEE + renumérotation) ; `reason` est transmis à l’e-mail admin depuis le routeur parent.
    # from app.models.models import Desistement
    # d = Desistement(demande_inscription_id=demande.id, user_id=user.id, raison=(reason or "")[:191])
    # db.add(d); db.flush()
    parent = db.query(Parent).filter(Parent.user_id == user.id).first()
    if not parent:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Parent introuvable.")

    demande = (
        db.query(DemandeInscription)
        .join(Enfant, Enfant.id == DemandeInscription.enfant_id)
        .filter(DemandeInscription.id == demande_id, Enfant.parent_id == parent.id)
        .first()
    )
    if not demande:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Demande introuvable.")
    _require_not_rejet_definitif(demande)
    if demande.statut == DemandeStatut.DESISTEE:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cette demande est déjà désistée.")
    if demande.desistement is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Désistement déjà demandé.")

    # Le désistement ne doit pas faire perdre l'état "informations validées".
    # On conserve ce signal de manière interne pour pouvoir le restaurer à la réinscription.
    if demande.statut == DemandeStatut.RETENUE:
        demande.non_validation_reason = _VALIDATION_INFOS_OK_MARKER

    demande.statut = DemandeStatut.DESISTEE
    demande.updated_at = datetime.now(timezone.utc)
    db.flush()
    resequence_rangs_apres_desistement_valide(db, int(demande.liste_id))


def cancel_desistement(*, db: Session, user: User, demande_id: int) -> None:
    raise_if_liste_finale_definitive()
    parent = db.query(Parent).filter(Parent.user_id == user.id).first()
    if not parent:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Parent introuvable.")

    demande = (
        db.query(DemandeInscription)
        .join(Enfant, Enfant.id == DemandeInscription.enfant_id)
        .filter(DemandeInscription.id == demande_id, Enfant.parent_id == parent.id)
        .first()
    )
    if not demande:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Demande introuvable.")

    if demande.desistement is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Aucun désistement à annuler.")

    db.delete(demande.desistement)
    db.flush()


def reinscrire_desiste(*, db: Session, user: User, demande_id: int) -> DemandeInscription:
    raise_if_liste_finale_definitive()
    parent = db.query(Parent).filter(Parent.user_id == user.id).first()
    if not parent:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Parent introuvable.")

    demande = (
        db.query(DemandeInscription)
        .join(Enfant, Enfant.id == DemandeInscription.enfant_id)
        .filter(DemandeInscription.id == demande_id, Enfant.parent_id == parent.id)
        .first()
    )
    if not demande:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Demande introuvable.")

    if demande.statut != DemandeStatut.DESISTEE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Réinscription impossible : seul un enfant désisté peut être réinscrit.",
        )

    if demande.desistement is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Réinscription impossible : un désistement est encore en cours de traitement.",
        )

    if demande.non_validation_reason == _VALIDATION_INFOS_OK_MARKER:
        demande.statut = DemandeStatut.RETENUE
    else:
        demande.statut = DemandeStatut.SOUMISE
    demande.non_validation_reason = ""
    demande.reinscrit_apres_desistement = True
    demande.date_inscription = date.today()
    demande.inscription_at = datetime.now(timezone.utc)
    demande.updated_at = datetime.now(timezone.utc)
    db.flush()
    resequence_rangs_pour_liste(db, int(demande.liste_id), demande_reinscrite_id=int(demande.id))
    return demande


def parent_corriger_demande_sans_changer_rang(
    *,
    db: Session,
    user: User,
    demande_id: int,
    prenom: str,
    nom: str,
    date_naissance: date,
    sexe: Sexe,
    lien_parente: LienParente,
) -> DemandeInscription:
    """Autorise le parent a corriger les infos enfant sans toucher au rang ni a la liste."""
    raise_if_liste_finale_definitive()
    parent = db.query(Parent).filter(Parent.user_id == user.id).first()
    if not parent:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Parent introuvable.")

    demande = (
        db.query(DemandeInscription)
        .join(Enfant, Enfant.id == DemandeInscription.enfant_id)
        .filter(DemandeInscription.id == demande_id, Enfant.parent_id == parent.id)
        .first()
    )
    if not demande:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Demande introuvable.")
    _require_not_rejet_definitif(demande)
    if demande.statut == DemandeStatut.DESISTEE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Correction impossible : demande deja desistee.",
        )
    if demande.desistement is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Correction impossible : annulez d'abord le desistement en cours.",
        )

    _validate_annee_naissance(date_naissance)
    enfant = demande.enfant
    enfant.prenom = (prenom or "").strip()[:191] or enfant.prenom
    enfant.nom = (nom or "").strip()[:191] or enfant.nom
    enfant.date_naissance = date_naissance
    enfant.sexe = sexe
    enfant.lien_parente = lien_parente
    enfant.updated_at = datetime.now(timezone.utc)
    demande.updated_at = datetime.now(timezone.utc)
    db.flush()
    db.refresh(demande)
    return demande


def admin_corriger_demande_rejetee(
    *,
    db: Session,
    demande_id: int,
    prenom: str,
    nom: str,
    date_naissance: date,
    sexe: Sexe,
    lien_parente: LienParente,
) -> DemandeInscription:
    """Remet une demande NON_VALIDEE (non définitive) en SOUMISE, après correction des infos enfant — rang via `_next_rang_for_liste`.

    Si le lien passe de Père / Mère / Tuteur légal à Autre : la demande est affectée à la liste ATTENTE_N2
    (même mécanisme de renumérotation que pour une correction sur la liste d'origine).
    """
    raise_if_liste_finale_definitive()
    demande = db.query(DemandeInscription).filter(DemandeInscription.id == demande_id).first()
    if not demande:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Demande introuvable.")
    if demande.statut != DemandeStatut.NON_VALIDEE or demande.rejet_definitif:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Correction impossible : demande non concernée ou refus définitif.",
        )
    _validate_annee_naissance(date_naissance)
    ensure_listes_exist(db)
    enfant = demande.enfant
    ancien_lien = enfant.lien_parente
    old_liste_id = int(demande.liste_id)
    transfert_n2 = lien_parente == LienParente.AUTRE and ancien_lien in (
        LienParente.PERE,
        LienParente.MERE,
        LienParente.TUTEUR_LEGAL,
    )
    liste_n2 = None
    if transfert_n2:
        liste_n2 = db.query(Liste).filter(Liste.code == ListeCode.ATTENTE_N2).first()
        if not liste_n2:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Liste N2 introuvable.")
    enfant.prenom = (prenom or "").strip()[:191] or enfant.prenom
    enfant.nom = (nom or "").strip()[:191] or enfant.nom
    enfant.date_naissance = date_naissance
    enfant.sexe = sexe
    enfant.lien_parente = lien_parente
    enfant.updated_at = datetime.now(timezone.utc)
    new_liste_id = old_liste_id
    if transfert_n2:
        new_liste_id = int(liste_n2.id)
        demande.liste_id = liste_n2.id
        # Comme `POST .../transfer` vers une liste autre que PRINCIPALE : l’enfant n’est plus titulaire.
        enfant.is_titulaire = False
    demande.statut = DemandeStatut.SOUMISE
    demande.non_validation_reason = ""
    demande.updated_at = datetime.now(timezone.utc)
    db.flush()
    moved_liste = transfert_n2 and old_liste_id != new_liste_id
    if moved_liste:
        _next_rang_for_liste(db, old_liste_id)
    _next_rang_for_liste(db, int(demande.liste_id))
    db.refresh(demande)
    return demande
