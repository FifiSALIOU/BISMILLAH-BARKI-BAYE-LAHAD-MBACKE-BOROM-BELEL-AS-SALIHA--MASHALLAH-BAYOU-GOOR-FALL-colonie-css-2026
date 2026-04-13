"""Paramètres runtime (équivalent app_settings) : stockage fichier JSON, sans table PostgreSQL."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

# Aligné sur RuntimeSettingsIn (admin) + clés cycle liste finale
DEFAULT_RUNTIME_SETTINGS: dict[str, Any] = {
    "colonieNom": "Colonie de Vacances 2026",
    "dateDebutInscriptions": "2026-01-01",
    "dateFinInscriptions": "2026-04-30",
    "dateDebutColonie": "2026-07-01",
    "dateFinColonie": "2026-08-31",
    "capaciteMax": 100,
    "maxEnfantsParParent": 2,
    "ageMin": 2012,
    "ageMax": 2019,
    "inscriptionsOuvertes": True,
    "accesParentsActif": True,
    "listeFinalePretePourValidation": False,
    "listeFinaleValideeDefinitive": False,
}


def merged_runtime_settings() -> dict[str, Any]:
    """Fusion défauts + fichier runtime_settings.json (même logique que l’admin)."""
    return {**DEFAULT_RUNTIME_SETTINGS, **read_settings()}


def _path() -> Path:
    base = Path(__file__).resolve().parents[2] / "data"
    base.mkdir(parents=True, exist_ok=True)
    return base / "runtime_settings.json"


def read_settings() -> dict[str, Any]:
    p = _path()
    if not p.exists():
        return {}
    try:
        raw = json.loads(p.read_text(encoding="utf-8"))
        return raw if isinstance(raw, dict) else {}
    except Exception:
        return {}


def merge_with_defaults(defaults: dict[str, Any]) -> dict[str, Any]:
    return {**defaults, **read_settings()}


# Clés exposées sans authentification (page login, bandeaux)
_PUBLIC_SETTINGS_KEYS = (
    "colonieNom",
    "dateDebutInscriptions",
    "dateFinInscriptions",
    "dateDebutColonie",
    "dateFinColonie",
    "capaciteMax",
    "maxEnfantsParParent",
    "ageMin",
    "ageMax",
    "inscriptionsOuvertes",
    "accesParentsActif",
)


def public_runtime_settings_for_client() -> dict[str, Any]:
    full = merged_runtime_settings()
    return {k: full[k] for k in _PUBLIC_SETTINGS_KEYS if k in full}


def write_settings(payload: dict[str, Any]) -> None:
    p = _path()
    p.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def get_max_enfants_par_parent(default: int) -> int:
    data = read_settings()
    val = data.get("maxEnfantsParParent", default)
    try:
        if val is None:
            return 999_999
        n = int(val)
        return n if n > 0 else default
    except Exception:
        return default
