from __future__ import annotations

import secrets
import string
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from pydantic import ValidationError
from sqlalchemy.orm import Session, joinedload

from app.api.deps import get_current_user, require_roles
from app.db.session import get_db
from app.models.enums import UserRole
from app.models.models import Parent, User
from app.schemas.users import (
    AdminUserCreateIn,
    ParentUserCreateIn,
    ResetPasswordIn,
    UserOut,
    UserUpsertIn,
)
from app.services.email import send_email
from app.services.users import (
    change_password_for_user,
    create_user_superadmin,
    delete_user_by_super_admin,
    reset_parent_password_to_default,
    set_admin_temp_password,
    set_user_active,
    update_user,
)

router = APIRouter(prefix="/admin/users", tags=["admin-users"])
DEFAULT_PARENT_PASSWORD = "Passer123"


def _generate_temp_password(length: int = 12) -> str:
    alphabet = string.ascii_letters + string.digits + "!@#$%*?-_"
    return "".join(secrets.choice(alphabet) for _ in range(length))


def _admin_contact_email(u: User) -> str | None:
    t = u.remember_token
    if t and "@" in t:
        return t
    return None


def _public_parent_telephone(value: str | None) -> str | None:
    v = (value or "").strip()
    if not v or v.startswith("tel:"):
        return None
    return v


def _send_admin_credentials_email(contact: str, temp_password: str) -> None:
    """Appelé en tâche de fond pour ne pas bloquer la réponse HTTP sur le SMTP."""
    send_email(
        to=[contact],
        subject="Colonie 2026 — Vos identifiants temporaires",
        body=(
            "Bonjour,\n\n"
            f"Votre compte administrateur a été créé.\n"
            f"- Identifiant (e-mail): {contact}\n"
            f"- Mot de passe temporaire: {temp_password}\n\n"
            "Connectez-vous avec cette adresse e-mail et ce mot de passe sur :\n"
            "http://localhost:8080\n\n"
            "À la première connexion, vous serez obligé de changer ce mot de passe.\n"
            "Cordialement.\n"
        ),
        html_body=(
            "<p>Bonjour,</p>"
            f"<p>Votre compte administrateur a été créé.<br>"
            f"- Identifiant (e-mail): {contact}<br>"
            f"- Mot de passe temporaire: {temp_password}</p>"
            '<p>Veuillez vous connecter à l\'application avec votre e-mail et ce mot de passe : '
            '<a href="http://localhost:8080/?force_login=1">Accéder à l\'application</a>.</p>'
            "<p>À la première connexion, vous serez obligé de changer ce mot de passe.<br>"
            "Cordialement.</p>"
        ),
    )


def _send_admin_password_reset_email(contact: str, temp_password: str) -> None:
    send_email(
        to=[contact],
        subject="Colonie 2026 — Réinitialisation de votre mot de passe",
        body=(
            "Bonjour,\n\n"
            "Votre mot de passe administrateur a été réinitialisé.\n"
            f"- Email: {contact}\n"
            f"- Mot de passe temporaire: {temp_password}\n\n"
            "Connexion: http://localhost:8080\n\n"
            "À la prochaine connexion, vous serez obligé de changer ce mot de passe.\n"
            "Cordialement.\n"
        ),
        html_body=(
            "<p>Bonjour,</p>"
            "<p>Votre mot de passe administrateur a été réinitialisé.<br>"
            f"- Email: {contact}<br>"
            f"- Mot de passe temporaire: {temp_password}</p>"
            '<p><a href="http://localhost:8080/?force_login=1">Accéder à l\'application</a>.</p>'
            "<p>À la prochaine connexion, vous serez obligé de changer ce mot de passe.<br>"
            "Cordialement.</p>"
        ),
    )


def build_user_out(u: User) -> UserOut:
    email = _admin_contact_email(u)
    parent_prenom = parent_nom = parent_service = parent_site_code = parent_telephone = None
    matricule_out = u.matricule
    if u.role == UserRole.PARENT and u.parent_profile:
        pp = u.parent_profile
        # Aligné fiche RH : le matricule affiché pour les parents suit `parents.matricule` (connexion = `users.matricule`).
        m = (pp.matricule or "").strip()
        if m:
            matricule_out = m
        parent_prenom = pp.prenom
        parent_nom = pp.nom
        parent_service = pp.service_text
        parent_telephone = _public_parent_telephone(pp.telephone)
        parent_site_code = str(pp.site_obj.code) if pp.site_obj else (pp.site_text or None)
        email = pp.email or email
    return UserOut(
        id=u.id,
        name=u.name,
        role=u.role,
        is_active=u.is_active,
        email=email,
        matricule=matricule_out,
        parent_prenom=parent_prenom,
        parent_nom=parent_nom,
        parent_service=parent_service,
        parent_site_code=parent_site_code,
        parent_telephone=parent_telephone,
    )


@router.get("", response_model=list[UserOut])
def list_users(
    db: Session = Depends(get_db),
    admin: User = Depends(require_roles(UserRole.SUPER_ADMIN)),
):
    _ = db, admin
    users = (
        db.query(User)
        .options(joinedload(User.parent_profile).joinedload(Parent.site_obj))
        .order_by(User.id.asc())
        .all()
    )
    return [build_user_out(u) for u in users]


@router.post("", response_model=UserOut)
def create_user(
    payload: dict[str, Any],
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    admin: User = Depends(require_roles(UserRole.SUPER_ADMIN)),
):
    _ = admin
    role = payload.get("role")
    if not role:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="role requis")

    try:
        role_enum = UserRole(role) if isinstance(role, str) else role
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="role invalide") from e

    if role_enum == UserRole.PARENT:
        try:
            p = ParentUserCreateIn.model_validate(payload)
        except ValidationError as e:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e))

        user = create_user_superadmin(
            db=db,
            role=UserRole.PARENT,
            name=p.name,
            password=DEFAULT_PARENT_PASSWORD,
            email=str(p.email) if p.email else None,
            matricule=p.matricule,
            parent_payload={
                "prenom": p.prenom,
                "nom": p.nom,
                "service": p.service,
                "site_code": p.site_code,
                "telephone": p.telephone,
            },
            must_change_password=True,
        )
        db.commit()
        db.refresh(user)
        return build_user_out(user)

    try:
        a = AdminUserCreateIn.model_validate(payload)
    except ValidationError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e))

    temp_password = _generate_temp_password()
    user = create_user_superadmin(
        db=db,
        role=a.role,
        name=a.name,
        password=temp_password,
        email=str(a.email) if a.email else None,
        matricule=a.matricule,
        parent_payload=None,
        must_change_password=True,
    )
    db.commit()
    db.refresh(user)
    contact = _admin_contact_email(user)
    if contact:
        background_tasks.add_task(_send_admin_credentials_email, contact, temp_password)
    return build_user_out(user)


@router.patch("/{user_id}", response_model=UserOut)
def upsert_user(
    user_id: int,
    payload: UserUpsertIn,
    db: Session = Depends(get_db),
    admin: User = Depends(require_roles(UserRole.SUPER_ADMIN)),
):
    _ = admin
    user = update_user(
        db,
        user_id=user_id,
        name=payload.name,
        is_active=payload.is_active,
        email=payload.email,
        role=payload.role,
        matricule=payload.matricule,
        parent_prenom=payload.parent_prenom,
        parent_nom=payload.parent_nom,
        parent_service=payload.parent_service,
        parent_site_code=payload.parent_site_code,
        parent_telephone=payload.parent_telephone,
    )
    db.commit()
    db.refresh(user)
    return build_user_out(user)


@router.post("/{user_id}/deactivate")
def deactivate_user(
    user_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_roles(UserRole.SUPER_ADMIN)),
):
    _ = admin
    set_user_active(db, user_id=user_id, is_active=False)
    db.commit()
    return {"ok": True}


@router.delete("/{user_id}")
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_roles(UserRole.SUPER_ADMIN)),
):
    delete_user_by_super_admin(db, user_id=user_id, requester_id=admin.id)
    db.commit()
    return {"ok": True}


@router.post("/{user_id}/reset-password")
def reset_password_user(
    user_id: int,
    payload: ResetPasswordIn,
    db: Session = Depends(get_db),
    admin: User = Depends(require_roles(UserRole.SUPER_ADMIN)),
):
    _ = admin
    change_password_for_user(db, user_id=user_id, new_password=payload.new_password)
    db.commit()
    return {"ok": True}


@router.post("/{user_id}/reset-password-auto")
def reset_password_user_auto(
    user_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    admin: User = Depends(require_roles(UserRole.SUPER_ADMIN)),
):
    _ = admin
    temp_password = _generate_temp_password()
    user = set_admin_temp_password(db, user_id=user_id, temp_password=temp_password)
    db.commit()
    db.refresh(user)
    contact = _admin_contact_email(user)
    if contact:
        background_tasks.add_task(_send_admin_password_reset_email, contact, temp_password)
    return {"ok": True}


@router.post("/{user_id}/reset-password-parent-default")
def reset_password_parent_default(
    user_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_roles(UserRole.SUPER_ADMIN)),
):
    """Parents uniquement : mot de passe = Passer123, changement obligatoire à la connexion."""
    _ = admin
    reset_parent_password_to_default(db, user_id=user_id)
    db.commit()
    return {"ok": True}
