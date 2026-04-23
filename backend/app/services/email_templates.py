from __future__ import annotations

from datetime import datetime


def _dt(d: datetime | None) -> str:
    if not d:
        return ""
    return d.strftime("%Y-%m-%d %H:%M")


def subject_inscription(parent_matricule: str, enfant_nom: str) -> str:
    return f"Colonie 2026 — Confirmation inscription ({parent_matricule}) — {enfant_nom}"


def body_inscription(*, parent_matricule: str, enfant_prenom: str, enfant_nom: str, liste: str, rang: int, date: datetime):
    return (
        "Bonjour,\n\n"
        "Votre inscription a bien été enregistrée.\n\n"
        f"- Matricule: {parent_matricule}\n"
        f"- Enfant: {enfant_prenom} {enfant_nom}\n"
        f"- Liste: {liste}\n"
        f"- Rang: {rang}\n"
        f"- Date: {_dt(date)}\n\n"
        "Cordialement.\n"
    )


def subject_inscription_admin_notify(parent_matricule: str, enfant_nom: str) -> str:
    return f"Colonie 2026 — Nouvelle inscription (notification) — {parent_matricule} — {enfant_nom}"


def body_inscription_admin_notify(
    *,
    parent_matricule: str,
    parent_prenom: str,
    parent_nom: str,
    enfant_prenom: str,
    enfant_nom: str,
    liste: str,
    rang: int,
    date: datetime,
):
    """Message pour gestionnaires / super admins (ton informatif, pas « votre inscription »)."""
    parent_label = f"{parent_prenom} {parent_nom}".strip() or parent_matricule
    return (
        "Bonjour,\n\n"
        f"{parent_label} vient d’enregistrer une nouvelle inscription sur la plateforme Colonie 2026.\n\n"
        f"- Matricule parent: {parent_matricule}\n"
        f"- Parent: {parent_prenom} {parent_nom}\n"
        f"- Enfant: {enfant_prenom} {enfant_nom}\n"
        f"- Liste: {liste}\n"
        f"- Rang: {rang}\n"
        f"- Date d’enregistrement: {_dt(date)}\n\n"
        "Cordialement.\n"
    )


def subject_reinscription_admin_notify(parent_matricule: str, enfant_nom: str) -> str:
    return f"Colonie 2026 — Réinscription (notification) — {parent_matricule} — {enfant_nom}"


def body_reinscription_admin_notify(
    *,
    parent_matricule: str,
    parent_prenom: str,
    parent_nom: str,
    enfant_prenom: str,
    enfant_nom: str,
    liste: str,
    rang: int,
    date: datetime,
):
    parent_label = f"{parent_prenom} {parent_nom}".strip() or parent_matricule
    return (
        "Bonjour,\n\n"
        f"{parent_label} vient de réinscrire un enfant après désistement sur la plateforme Colonie 2026.\n\n"
        f"- Matricule parent: {parent_matricule}\n"
        f"- Parent: {parent_prenom} {parent_nom}\n"
        f"- Enfant: {enfant_prenom} {enfant_nom}\n"
        f"- Liste: {liste}\n"
        f"- Rang: {rang}\n"
        f"- Date de réinscription: {_dt(date)}\n\n"
        "Cordialement.\n"
    )


def subject_titulaire(parent_matricule: str) -> str:
    return f"Colonie 2026 — Changement de titulaire ({parent_matricule})"


def body_titulaire(
    *,
    parent_matricule: str,
    parent_prenom: str,
    parent_nom: str,
    new_titulaire: str,
    old_titulaire: str | None,
    when: datetime,
):
    parent_label = f"{(parent_prenom or '').strip()} {(parent_nom or '').strip()}".strip() or "—"
    return (
        "Bonjour,\n\n"
        "Un changement de titulaire a été effectué.\n\n"
        f"- Matricule: {parent_matricule}\n"
        f"- Parent: {parent_label}\n"
        f"- Ancien titulaire: {old_titulaire or '—'}\n"
        f"- Nouveau titulaire: {new_titulaire}\n"
        f"- Date et heure: {when.strftime('%Y-%m-%d %H:%M:%S')}\n\n"
        "Cordialement.\n"
    )


def subject_selection(parent_matricule: str, enfant_nom: str) -> str:
    return f"Colonie 2026 — Validation des informations ({parent_matricule}) — {enfant_nom}"


def body_selection(*, parent_matricule: str, enfant: str, selected: bool, when: datetime):
    """Courriel après « Approuver » / « Refuser » côté gestionnaire : contrôle de conformité des infos, pas la liste finale."""
    if selected:
        suite = (
            "Les informations de cette demande ont été contrôlées et jugées conformes par l’administration.\n"
            "Cela ne signifie pas que l’enfant figure dans la liste finale des retenus : celle-ci est établie automatiquement après la clôture des inscriptions.\n"
        )
    else:
        suite = (
            "Les informations de cette demande n’ont pas été jugées conformes par l’administration.\n"
            "Un motif a été enregistré. Si la demande est transférée vers une autre liste, vous recevrez aussi un e-mail de transfert.\n"
        )
    return (
        "Bonjour,\n\n"
        "Mise à jour concernant le contrôle des informations de votre demande d’inscription.\n\n"
        f"- Matricule: {parent_matricule}\n"
        f"- Enfant: {enfant}\n"
        f"- Décision: {'informations conformes' if selected else 'informations non conformes'}\n"
        f"- Date: {_dt(when)}\n\n"
        f"{suite}\n"
        "Cordialement.\n"
    )


def subject_transfer(parent_matricule: str, enfant_nom: str) -> str:
    return f"Colonie 2026 — Transfert de liste ({parent_matricule}) — {enfant_nom}"


def body_transfer(
    *,
    parent_matricule: str,
    enfant: str,
    from_liste: str,
    from_rang: int,
    to_liste: str,
    to_rang: int,
    reason: str | None,
    when: datetime,
):
    return (
        "Bonjour,\n\n"
        "Votre demande a été transférée vers une autre liste.\n\n"
        f"- Matricule: {parent_matricule}\n"
        f"- Enfant: {enfant}\n"
        f"- Ancienne liste: {from_liste} (rang {from_rang})\n"
        f"- Nouvelle liste: {to_liste} (rang {to_rang})\n"
        f"- Motif: {reason or '—'}\n"
        f"- Date: {_dt(when)}\n\n"
        "Cordialement.\n"
    )


def subject_desistement(parent_matricule: str, enfant_nom: str) -> str:
    return f"Colonie 2026 — Désistement ({parent_matricule}) — {enfant_nom}"


def subject_desistement_admin(parent_matricule: str, enfant_nom: str) -> str:
    return f"Colonie 2026 — Désistement à traiter — {parent_matricule} — {enfant_nom}"


def body_desistement_requested(*, parent_matricule: str, enfant: str, when: datetime, reason: str | None):
    return (
        "Bonjour,\n\n"
        "Votre demande de désistement a bien été enregistrée.\n\n"
        f"- Matricule: {parent_matricule}\n"
        f"- Enfant: {enfant}\n"
        f"- Date: {_dt(when)}\n"
        f"- Motif: {reason or '—'}\n\n"
        "Cordialement.\n"
    )


def body_desistement_requested_admin(
    *,
    parent_matricule: str,
    enfant: str,
    when: datetime,
    reason: str | None,
):
    return (
        "Bonjour,\n\n"
        "Un parent a enregistré une demande de désistement pour la Colonie 2026. "
        "Elle est en attente de validation dans l’espace gestionnaire.\n\n"
        f"- Matricule parent: {parent_matricule}\n"
        f"- Enfant concerné: {enfant}\n"
        f"- Date de la demande: {_dt(when)}\n"
        f"- Motif communiqué par le parent: {reason or '—'}\n\n"
        "Merci de traiter cette demande depuis l’administration.\n\n"
        "Cordialement.\n"
    )


def subject_desistement_valide_parent(parent_matricule: str, enfant_nom: str) -> str:
    return f"Colonie 2026 — Désistement validé ({parent_matricule}) — {enfant_nom}"


def subject_desistement_valide_admin(parent_matricule: str, enfant_nom: str) -> str:
    return f"Colonie 2026 — Désistement validé (notification) — {parent_matricule} — {enfant_nom}"


def body_desistement_validated(*, parent_matricule: str, enfant: str, when: datetime):
    return (
        "Bonjour,\n\n"
        "Votre désistement a été validé. L’enfant ne fait plus partie de la liste finale.\n\n"
        f"- Matricule: {parent_matricule}\n"
        f"- Enfant: {enfant}\n"
        f"- Date: {_dt(when)}\n\n"
        "Cordialement.\n"
    )


def body_desistement_validated_admin(*, parent_matricule: str, parent_prenom: str, parent_nom: str, enfant: str, when: datetime):
    # Ancien libellé (référence) : « validé depuis l’espace gestionnaire », « liste finale »,
    # « Date de validation » — harmonisé pour couvrir aussi le désistement immédiat depuis l’espace parent.
    return (
        "Bonjour,\n\n"
        "Un désistement a été enregistré pour la Colonie 2026. "
        "L’enfant concerné ne fait plus partie de la liste active.\n\n"
        f"- Matricule parent: {parent_matricule}\n"
        f"- Parent: {parent_prenom} {parent_nom}\n"
        f"- Enfant concerné: {enfant}\n"
        f"- Date: {_dt(when)}\n\n"
        "Cordialement.\n"
    )


def subject_desistement_annule_parent(parent_matricule: str, enfant_nom: str) -> str:
    return f"Colonie 2026 — Désistement annulé ({parent_matricule}) — {enfant_nom}"


def subject_desistement_annule_admin(parent_matricule: str, enfant_nom: str) -> str:
    return f"Colonie 2026 — Annulation de désistement — {parent_matricule} — {enfant_nom}"


def body_desistement_cancelled_parent(*, parent_matricule: str, enfant: str, when: datetime):
    return (
        "Bonjour,\n\n"
        "Votre demande de désistement a bien été annulée.\n\n"
        f"- Matricule: {parent_matricule}\n"
        f"- Enfant: {enfant}\n"
        f"- Date d'annulation: {_dt(when)}\n\n"
        "Cordialement.\n"
    )


def body_desistement_cancelled_admin(*, parent_matricule: str, enfant: str, when: datetime):
    return (
        "Bonjour,\n\n"
        "Un parent a annulé une demande de désistement avant validation gestionnaire.\n\n"
        f"- Matricule parent: {parent_matricule}\n"
        f"- Enfant concerné: {enfant}\n"
        f"- Date d'annulation: {_dt(when)}\n\n"
        "Aucune action n'est requise si la demande n'a pas encore été traitée.\n\n"
        "Cordialement.\n"
    )

