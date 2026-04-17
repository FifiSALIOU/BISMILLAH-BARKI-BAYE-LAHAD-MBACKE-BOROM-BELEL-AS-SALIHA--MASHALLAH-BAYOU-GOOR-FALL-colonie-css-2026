from __future__ import annotations

import secrets
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.enums import UserRole
from app.models.models import Parent, Service, Site, User
from app.security import hash_password
from app.services import admin_must_change_store


def _get_or_create_service(db: Session, nom: str) -> Service:
    svc = db.query(Service).filter(Service.nom == nom).first()
    if svc:
        return svc
    svc = Service(nom=nom, description="-")
    db.add(svc)
    db.flush()
    return svc


def _get_or_create_site(db: Session, site_code: str) -> Optional[Site]:
    if not site_code:
        return None
    value = site_code.strip()
    if not value:
        return None

    try:
        code_int = int(value)
        by_code = db.query(Site).filter(Site.code == code_int).first()
        if by_code:
            return by_code
    except ValueError:
        pass

    by_name = db.query(Site).filter(func.lower(Site.nom) == value.lower()).all()
    if len(by_name) == 1:
        return by_name[0]
    if len(by_name) > 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Agence ambiguë '{value}' : plusieurs sites portent ce nom.",
        )

    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail=f"Agence introuvable '{value}'. Utilisez un code ou un nom existant.",
    )


def _stash_admin_email(email: str | None) -> str | None:
    if not email:
        return None
    e = str(email).strip()
    return e[:100] if e else None


def normalize_parent_nin_for_storage(nin: str | None, *, matricule: str) -> str | None:
    """Stocke NULL si le NIN n'est pas fourni (pas de valeur factice)."""
    s = (nin or "").strip()
    if not s or s == "-":
        return None
    return s[:191]


def normalize_parent_telephone_for_storage(telephone: str | None, *, matricule: str) -> str | None:
    """Stocke NULL si le numéro n'est pas fourni (pas de valeur factice)."""
    s = (telephone or "").strip()
    if not s or s == "-":
        return None
    return s[:191]


TELEPHONE_DEJA_UTILISE_DETAIL = (
    "Ce numéro de téléphone est déjà enregistré pour un autre compte parent. "
    "Un même numéro ne peut pas être partagé entre deux comptes : utilisez un autre numéro, "
    "ou connectez-vous avec le compte déjà associé à ce téléphone. "
    "Pour toute aide, contactez l'administrateur."
)


def _telephone_digits_key(value: str | None) -> str | None:
    """Même numéro saisi avec espaces, tirets ou + : une seule clé (chiffres uniquement). Les `tel:` sont ignorés."""
    if not value:
        return None
    s = str(value).strip()
    if not s or s.startswith("tel:"):
        return None
    digits = "".join(c for c in s if c.isdigit())
    return digits if digits else None


def raise_if_parent_telephone_conflict(db: Session, *, tel_stash: str | None, parent: Parent) -> None:
    """Un numéro réel ne peut servir qu'à un seul parent. Comparaison sur les chiffres (évite les doublons « format différent »)."""
    key = _telephone_digits_key(tel_stash)
    if not key:
        return
    q = db.query(Parent)
    if parent.id is not None:
        q = q.filter(Parent.id != parent.id)
    for other in q.all():
        other_key = _telephone_digits_key(other.telephone)
        if other_key and other_key == key:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=TELEPHONE_DEJA_UTILISE_DETAIL,
            )


def create_user_superadmin(
    *,
    db: Session,
    role: UserRole,
    name: str,
    password: str,
    email: Optional[str] = None,
    matricule: Optional[str] = None,
    parent_payload: dict | None = None,
    must_change_password: bool = False,
) -> User:
    if role == UserRole.PARENT:
        if not parent_payload:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Payload parent requis.")
        if not matricule:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Matricule parent requis.")
        mat_norm = matricule.strip()
        if not mat_norm:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Matricule parent requis.")
        existing_parent_login = (
            db.query(User)
            .filter(func.lower(User.matricule) == mat_norm.lower())
            .first()
        )
        if existing_parent_login:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Un compte existe déjà avec ce matricule. Les lignes en doublon ne sont pas créées.",
            )
        prenom = parent_payload["prenom"]
        nom_parent = parent_payload["nom"]
        service_nom = parent_payload["service"]
        site_code = parent_payload.get("site_code")
        telephone = normalize_parent_telephone_for_storage(parent_payload.get("telephone"), matricule=mat_norm)
        nin = normalize_parent_nin_for_storage(parent_payload.get("nin"), matricule=mat_norm)
        genre = parent_payload.get("genre") or "-"
        adresse = parent_payload.get("adresse") or "-"

        user = User(
            role=role,
            name=name,
            matricule=mat_norm,
            password=hash_password(password),
            is_active=True,
            remember_token=None,
        )
        db.add(user)
        db.flush()

        service = _get_or_create_service(db, service_nom)
        site = _get_or_create_site(db, site_code) if site_code else None
        parent = Parent(
            prenom=prenom,
            nom=nom_parent,
            matricule=mat_norm,
            email=str(email).strip() if email else None,
            telephone=telephone,
            genre=genre,
            nin=nin,
            adresse=adresse,
            service_text=service.nom,
            site_text=site.nom if site else "",
            service_id=service.id,
            site_id=site.id if site else None,
            user_id=user.id,
        )
        db.add(parent)
        db.flush()
        raise_if_parent_telephone_conflict(db, tel_stash=telephone, parent=parent)
        return user

    if role in {UserRole.GESTIONNAIRE, UserRole.SUPER_ADMIN}:
        if not email:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="email requis pour ce rôle.")
        if not matricule:
            # Ne pas réutiliser la partie locale de l'e-mail : elle coïncide souvent avec le
            # matricule d'un compte PARENT (login par matricule). Les admins se connectent par e-mail.
            matricule = f"adm_{secrets.token_hex(10)}"
        email_norm = str(email).strip()
        email_key = email_norm.lower()[:100]
        existing_admin = (
            db.query(User)
            .filter(
                User.role.in_((UserRole.GESTIONNAIRE, UserRole.SUPER_ADMIN)),
                User.remember_token.isnot(None),
                func.lower(User.remember_token) == email_key,
            )
            .first()
        )
        if existing_admin:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Un compte administrateur existe déjà avec cette adresse e-mail.",
            )
        existing_mat = db.query(User).filter(User.matricule == matricule).first()
        if existing_mat:
            if existing_mat.role == UserRole.PARENT:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=(
                        "Ce matricule est déjà utilisé par un compte parent. "
                        "Choisissez un autre matricule pour cet administrateur (la connexion admin reste par e-mail)."
                    ),
                )
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Ce matricule ou identifiant de connexion est déjà utilisé.",
            )
        user = User(
            role=role,
            name=name,
            matricule=matricule,
            password=hash_password(password),
            is_active=True,
            must_change_password=bool(must_change_password),
            remember_token=_stash_admin_email(email),
        )
        db.add(user)
        db.flush()
        if must_change_password:
            admin_must_change_store.set_flag(user.id, True)
        return user

    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Rôle non supporté.")


def set_user_active(db: Session, *, user_id: int, is_active: bool) -> User:
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Utilisateur introuvable.")
    user.is_active = is_active
    db.add(user)
    db.flush()
    return user


def delete_admin_user(db: Session, *, user_id: int, requester_id: int) -> None:
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Utilisateur introuvable.")
    if user.role not in {UserRole.GESTIONNAIRE, UserRole.SUPER_ADMIN}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Suppression autorisee uniquement pour les administrateurs.")
    if user.id == requester_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Vous ne pouvez pas supprimer votre propre compte.")
    admin_must_change_store.clear_flag(user_id)
    db.delete(user)
    db.flush()


def delete_user_by_super_admin(db: Session, *, user_id: int, requester_id: int) -> None:
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Utilisateur introuvable.")

    if user.id == requester_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Vous ne pouvez pas supprimer votre propre compte.")

    if user.role in {UserRole.GESTIONNAIRE, UserRole.SUPER_ADMIN}:
        delete_admin_user(db, user_id=user_id, requester_id=requester_id)
        return

    if user.role == UserRole.PARENT:
        parent = db.query(Parent).filter(Parent.user_id == user.id).first()
        if parent and parent.enfants:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Suppression impossible: ce parent a deja des enfants/inscriptions.",
            )
        if parent:
            db.delete(parent)
            db.flush()
        db.delete(user)
        db.flush()
        return

    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Role non supporte pour suppression.")


def update_user(
    db: Session,
    *,
    user_id: int,
    name: Optional[str],
    is_active: Optional[bool],
    email: Optional[str],
    role: Optional[UserRole],
    matricule: Optional[str] = None,
    parent_prenom: Optional[str] = None,
    parent_nom: Optional[str] = None,
    parent_service: Optional[str] = None,
    parent_site_code: Optional[str] = None,
    parent_telephone: Optional[str] = None,
) -> User:
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Utilisateur introuvable.")
    if name is not None:
        user.name = name
    if is_active is not None:
        user.is_active = is_active
    if email is not None:
        if user.role in {UserRole.GESTIONNAIRE, UserRole.SUPER_ADMIN}:
            user.remember_token = _stash_admin_email(str(email) if email else None)
        # parent: email va aussi sur le profil parent ci-dessous
    if role is not None:
        if role not in {UserRole.GESTIONNAIRE, UserRole.SUPER_ADMIN}:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Rôle invalide pour un administrateur.")
        user.role = role

    if user.role == UserRole.PARENT and user.parent_profile is not None:
        parent = user.parent_profile
        if matricule is not None:
            mat_norm = matricule.strip()
            if not mat_norm:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Matricule parent invalide.")
            taken = (
                db.query(User)
                .filter(
                    func.lower(User.matricule) == mat_norm.lower(),
                    User.id != user.id,
                )
                .first()
            )
            if taken:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Un compte existe déjà avec ce matricule.",
                )
            user.matricule = mat_norm
            parent.matricule = mat_norm
        if parent_prenom is not None:
            parent.prenom = parent_prenom
        if parent_nom is not None:
            parent.nom = parent_nom
        if parent_telephone is not None:
            tel = normalize_parent_telephone_for_storage(parent_telephone, matricule=parent.matricule)
            raise_if_parent_telephone_conflict(db, tel_stash=tel, parent=parent)
            parent.telephone = tel
        if parent_service is not None:
            service = _get_or_create_service(db, parent_service)
            parent.service_id = service.id
            parent.service_text = service.nom
        if parent_site_code is not None:
            site = _get_or_create_site(db, parent_site_code)
            parent.site_id = site.id if site else None
            parent.site_text = site.nom if site else ""
        if email is not None:
            parent.email = str(email).strip() if email else None
        db.add(parent)
    db.flush()
    return user


def change_password_for_user(db: Session, *, user_id: int, new_password: str) -> None:
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Utilisateur introuvable.")
    user.password = hash_password(new_password)
    user.must_change_password = False
    admin_must_change_store.clear_flag(user_id)
    db.flush()


# Mot de passe initial parent (aligné sur app/api/routers/users.py DEFAULT_PARENT_PASSWORD)
DEFAULT_PARENT_PLAIN_PASSWORD = "Passer123"


def reset_parent_password_to_default(db: Session, *, user_id: int) -> None:
    """Réinitialise uniquement un compte PARENT : Passer123 + changement obligatoire à la prochaine connexion."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Utilisateur introuvable.")
    if user.role != UserRole.PARENT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cette réinitialisation est réservée aux comptes parent.",
        )
    user.password = hash_password(DEFAULT_PARENT_PLAIN_PASSWORD)
    user.must_change_password = True
    admin_must_change_store.clear_flag(user_id)
    db.flush()


def set_admin_temp_password(db: Session, *, user_id: int, temp_password: str) -> User:
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Utilisateur introuvable.")
    if user.role not in {UserRole.GESTIONNAIRE, UserRole.SUPER_ADMIN}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Réinitialisation automatique réservée aux administrateurs.")
    user.password = hash_password(temp_password)
    user.must_change_password = True
    admin_must_change_store.set_flag(user_id, True)
    db.flush()
    return user


def change_password_self(db: Session, *, user: User, old_password: str, new_password: str) -> None:
    from app.security import verify_password

    if not verify_password(old_password, user.password):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Mot de passe actuel incorrect.")
    user.password = hash_password(new_password)
    user.must_change_password = False
    admin_must_change_store.clear_flag(user.id)
    db.flush()
