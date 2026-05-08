"""Calcul unique de la liste finale des retenus (filtres, tri, capacité) — aligné sur GET /parent/liste-finale."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy.orm import Session, joinedload

from app.models.enums import DemandeStatut, ListeCode
from app.models.models import DemandeInscription, Enfant
from app.services.inscriptions import ensure_listes_exist
from app.services.runtime_settings_store import read_settings

_LISTE_ORDRE: dict[ListeCode, int] = {
    ListeCode.PRINCIPALE: 0,
    ListeCode.ATTENTE_N1: 1,
    ListeCode.ATTENTE_N2: 2,
}


def inscriptions_cloturees() -> bool:
    """True uniquement après la date/heure de fin d'inscription configurée."""
    cfg = read_settings()
    fin = cfg.get("dateFinInscriptions")
    heure_fin = str(cfg.get("heureFinInscriptions") or "23:59").strip() or "23:59"
    if fin is None or fin == "":
        return False
    try:
        date_part = str(fin).split("T")[0]
        hh, mm = heure_fin.split(":")
        end_local = datetime.fromisoformat(f"{date_part}T{int(hh):02d}:{int(mm):02d}:00")
    except (ValueError, OSError):
        return False
    return datetime.now() >= end_local


def demandes_liste_finale_retenus_si_cloturees(db: Session) -> list[DemandeInscription] | None:
    """Si inscriptions non clôturées : None. Sinon même requête, tri et troncature que /parent/liste-finale (liste peut être vide)."""
    if not inscriptions_cloturees():
        return None
    ensure_listes_exist(db)

    raw_settings = read_settings()
    capacite_max = raw_settings.get("capaciteMax", 100)
    try:
        capacite_max = None if capacite_max is None else max(int(capacite_max), 0)
    except Exception:
        capacite_max = 100

    demandes = (
        db.query(DemandeInscription)
        .options(
            joinedload(DemandeInscription.enfant).joinedload(Enfant.parent),
            joinedload(DemandeInscription.liste),
        )
        # Exclut les demandes "vierges" (créées sans liste) qui ne font pas partie d'une liste finale.
        .filter(DemandeInscription.liste_id.isnot(None))
        .filter(DemandeInscription.statut != DemandeStatut.NON_VALIDEE)
        .filter(DemandeInscription.statut != DemandeStatut.DESISTEE)
        .all()
    )

    def _order(d: DemandeInscription) -> tuple[int, int, int]:
        ord_liste = (
            _LISTE_ORDRE.get(d.liste.code, 99) if d.liste is not None else 99
        )
        return (ord_liste, d.rang_dans_liste or 0, d.id)

    ordered = sorted(demandes, key=_order)
    if capacite_max is not None:
        ordered = ordered[:capacite_max]
    return ordered
