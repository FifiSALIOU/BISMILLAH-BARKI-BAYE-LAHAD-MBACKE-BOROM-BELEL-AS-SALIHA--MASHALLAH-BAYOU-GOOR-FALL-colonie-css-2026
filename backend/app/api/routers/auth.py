from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.enums import UserRole
from app.models.models import Parent, User
from app.schemas.auth import (
    AdminLoginRequest,
    ChangePasswordIn,
    FirstLoginChangePasswordIn,
    ParentLoginRequest,
    TokenResponse,
)
from app.security import create_access_token, hash_password, verify_password
from app.services import admin_must_change_store
from app.services.runtime_settings_store import public_runtime_settings_for_client
from app.services.users import change_password_self

router = APIRouter(prefix="/auth", tags=["auth"])
DEFAULT_PARENT_PASSWORD = "Passer123"


@router.get("/public-settings")
def get_public_runtime_settings():
    """Paramètres d’affichage (dates d’inscription, accès parents) sans authentification — page de connexion."""
    return public_runtime_settings_for_client()


def _must_change_password(user: User) -> bool:
    if user.role == UserRole.PARENT:
        return verify_password(DEFAULT_PARENT_PASSWORD, user.password)
    # Colonne SQL (source de vérité) + fichier JSON historique pour compatibilité
    return bool(user.must_change_password) or admin_must_change_store.get_flag(user.id)


def _resolve_admin_login_user(db: Session, login: str) -> User | None:
    """Connexion admin / gestionnaire uniquement par e-mail (remember_token), pas par matricule."""
    login = login.strip().lower()
    if not login:
        return None
    return db.query(User).filter(func.lower(User.remember_token) == login).first()


@router.post("/login-parent", response_model=TokenResponse)
def login_parent(payload: ParentLoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    user = db.query(User).filter(User.matricule == payload.matricule).first()
    if not user or user.role != UserRole.PARENT or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Matricule ou mot de passe incorrect.")
    if not verify_password(payload.password, user.password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Matricule ou mot de passe incorrect.")
    token = create_access_token(subject=str(user.id), role=user.role.value)
    return TokenResponse(access_token=token, must_change_password=_must_change_password(user))


@router.post("/login-admin", response_model=TokenResponse)
def login_admin(payload: AdminLoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    user = _resolve_admin_login_user(db, payload.email)
    if not user or user.role not in {UserRole.GESTIONNAIRE, UserRole.SUPER_ADMIN} or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Email ou mot de passe incorrect.")
    if not verify_password(payload.password, user.password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Email ou mot de passe incorrect.")
    token = create_access_token(subject=str(user.id), role=user.role.value)
    return TokenResponse(access_token=token, must_change_password=_must_change_password(user))


@router.post("/change-password")
def change_password(
    payload: ChangePasswordIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, bool]:
    if user.role == UserRole.PARENT and payload.new_password.strip() == DEFAULT_PARENT_PASSWORD:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Le nouveau mot de passe ne peut pas être le mot de passe par défaut (Passer123).",
        )
    change_password_self(db, user=user, old_password=payload.old_password, new_password=payload.new_password)
    db.commit()
    return {"ok": True}


@router.post("/change-password-first-login")
def change_password_first_login(
    payload: FirstLoginChangePasswordIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, bool]:
    if user.role not in {UserRole.GESTIONNAIRE, UserRole.SUPER_ADMIN}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Endpoint reserve aux comptes administrateurs.",
        )
    if not user.must_change_password and not admin_must_change_store.get_flag(user.id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Aucun changement de mot de passe obligatoire n'est requis.",
        )
    user.password = hash_password(payload.new_password)
    user.must_change_password = False
    admin_must_change_store.clear_flag(user.id)
    db.commit()
    return {"ok": True}


@router.get("/me")
def me(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    contact = None
    if user.role in {UserRole.GESTIONNAIRE, UserRole.SUPER_ADMIN}:
        contact = user.remember_token if user.remember_token and "@" in user.remember_token else None
    payload = {
        "id": user.id,
        "role": user.role.value,
        "name": user.name,
        "email": contact,
        "matricule": user.matricule,
    }
    if user.role == UserRole.PARENT:
        parent = (
            db.query(Parent)
            .options(joinedload(Parent.site_obj))
            .filter(Parent.user_id == user.id)
            .first()
        )
        site_code = None
        site_nom = None
        if parent:
            if parent.site_obj is not None:
                site_code = parent.site_obj.code
                site_nom = parent.site_obj.nom
            else:
                st = (parent.site_text or "").strip()
                if st:
                    site_nom = st
        payload["parent"] = {
            "prenom": parent.prenom if parent else None,
            "nom": parent.nom if parent else None,
            "matricule": parent.matricule if parent else user.matricule,
            "service": parent.service_text if parent else None,
            "email": parent.email if parent else None,
            "telephone": parent.telephone if parent else None,
            "site_code": str(site_code) if site_code is not None else None,
            "site_nom": site_nom,
        }
    return payload
