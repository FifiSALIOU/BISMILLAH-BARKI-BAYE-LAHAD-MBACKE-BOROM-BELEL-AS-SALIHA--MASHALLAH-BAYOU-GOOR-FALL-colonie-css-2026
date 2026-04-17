from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, EmailStr, Field

from app.models.enums import UserRole


class UserOut(BaseModel):
    id: int
    name: str
    role: UserRole
    is_active: bool
    email: Optional[str] = None
    matricule: Optional[str] = None
    parent_prenom: Optional[str] = None
    parent_nom: Optional[str] = None
    parent_service: Optional[str] = None
    parent_site_code: Optional[str] = None
    parent_telephone: Optional[str] = None

    class Config:
        from_attributes = True


class AdminUserCreateIn(BaseModel):
    role: UserRole
    name: str = Field(min_length=1, max_length=255)
    email: Optional[EmailStr] = None
    matricule: Optional[str] = Field(default=None, min_length=1, max_length=50)
    password: Optional[str] = Field(default=None, min_length=8, max_length=255)


class ParentUserCreateIn(BaseModel):
    role: UserRole = UserRole.PARENT
    name: str = Field(min_length=1, max_length=255)
    email: Optional[EmailStr] = None
    matricule: str = Field(min_length=1, max_length=50)
    prenom: str = Field(min_length=1, max_length=255)
    nom: str = Field(min_length=1, max_length=255)
    service: str = Field(min_length=1, max_length=255)
    site_code: Optional[str] = Field(default=None, min_length=1, max_length=50)
    telephone: Optional[str] = Field(default=None, max_length=191)
    password: Optional[str] = Field(default=None, max_length=255)


class UserUpsertIn(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    is_active: Optional[bool] = None
    email: Optional[EmailStr] = None
    role: Optional[UserRole] = None
    matricule: Optional[str] = Field(default=None, min_length=1, max_length=50)
    parent_prenom: Optional[str] = Field(default=None, min_length=1, max_length=255)
    parent_nom: Optional[str] = Field(default=None, min_length=1, max_length=255)
    parent_service: Optional[str] = Field(default=None, min_length=1, max_length=255)
    parent_site_code: Optional[str] = Field(default=None, min_length=1, max_length=50)
    parent_telephone: Optional[str] = Field(default=None, min_length=1, max_length=50)


class ResetPasswordIn(BaseModel):
    new_password: str = Field(min_length=8, max_length=255)

