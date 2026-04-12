"""Verrouillage métier après validation définitive de la liste finale (paramètre runtime JSON)."""

from __future__ import annotations

from fastapi import HTTPException, status

from app.services.runtime_settings_store import read_settings

LISTE_FINALE_DEFINITIVE_DETAIL = (
    "Impossible pour toute information veuillez contacter l'administrateur"
)


def liste_finale_definitive_validee() -> bool:
    return bool(read_settings().get("listeFinaleValideeDefinitive"))


def raise_if_liste_finale_definitive() -> None:
    if liste_finale_definitive_validee():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=LISTE_FINALE_DEFINITIVE_DETAIL,
        )
