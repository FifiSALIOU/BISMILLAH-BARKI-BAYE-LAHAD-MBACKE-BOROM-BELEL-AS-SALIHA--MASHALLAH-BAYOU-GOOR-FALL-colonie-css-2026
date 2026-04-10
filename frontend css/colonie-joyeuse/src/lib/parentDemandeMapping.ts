import type { Enfant, Parent } from '@/data/mockData';

/** Réponse `GET /parent/demandes` (DemandeOut) */
export type DemandeOutApi = {
  id: number;
  liste_code: string;
  rang_dans_liste: number;
  date_inscription: string;
  updated_at?: string | null;
  statut: string;
  non_validation_reason?: string | null;
  /** Aligné sur statut RETENUE : validation des infos par l’admin, pas « retenu liste finale ». */
  is_selection_finale: boolean;
  has_desistement_pending: boolean;
  is_reinscrit: boolean;
  rejet_definitif?: boolean;
  date_desistement?: string | null;
  enfant_id: number;
  enfant_prenom: string;
  enfant_nom: string;
  enfant_date_naissance: string;
  enfant_sexe: string;
  enfant_lien_parente: string;
  enfant_is_titulaire: boolean;
};

export type TransparenceRowApi = {
  demande_id: number;
  enfant_id: number;
  liste_code: string;
  rang_dans_liste: number;
  date_inscription: string;
  updated_at?: string | null;
  is_reinscrit: boolean;
  statut_demande: string;
  parent_matricule: string;
  parent_prenom: string;
  parent_nom: string;
  parent_service: string;
  enfant_prenom: string;
  enfant_nom: string;
  enfant_date_naissance: string;
  enfant_sexe: string;
  enfant_lien_parente: string;
  enfant_is_titulaire: boolean;
};

export type ListeFinaleRowApi = {
  position: number;
  demande_id: number;
  liste_code: string;
  date_inscription: string;
  parent_matricule: string;
  parent_prenom: string;
  parent_nom: string;
  parent_service: string;
  enfant_prenom: string;
  enfant_nom: string;
  enfant_date_naissance: string;
  enfant_sexe: string;
};

const LIEN_API_TO_FR: Record<string, Enfant['lienParente']> = {
  PERE: 'Père',
  MERE: 'Mère',
  TUTEUR_LEGAL: 'Tuteur légal',
  AUTRE: 'Autre',
};

function listeFromCode(code: string): Enfant['liste'] {
  if (code === 'PRINCIPALE') return 'principale';
  if (code === 'ATTENTE_N1') return 'attente_n1';
  return 'attente_n2';
}

function statutFromDemande(d: { liste_code: string; enfant_is_titulaire: boolean }): Enfant['statut'] {
  if (d.enfant_is_titulaire) return 'Titulaire';
  if (d.liste_code === 'ATTENTE_N1') return 'Suppléant N1';
  return 'Suppléant N2';
}

function validationFromStatut(statut: string, nonValidationReason?: string | null): {
  validation: Enfant['validation'];
  motifRefus?: string;
} {
  if (statut === 'NON_VALIDEE') {
    return { validation: 'refusé', motifRefus: (nonValidationReason || '').trim() || 'Non précisé' };
  }
  if (statut === 'RETENUE') return { validation: 'validé' };
  return { validation: 'en_attente' };
}

function desistementFromDemande(statut: string, hasPending: boolean): {
  desistement: Enfant['desistement'];
  dateDesistement?: string;
} {
  if (statut === 'DESISTEE') {
    return { desistement: 'validé' };
  }
  if (hasPending) {
    return { desistement: 'demandé', dateDesistement: new Date().toISOString().split('T')[0] };
  }
  return { desistement: null };
}

function toDateIso(d: string | undefined): string {
  if (!d) return '';
  if (d.includes('T')) return d.split('T')[0];
  return d;
}

export function mapDemandeOutToEnfant(d: DemandeOutApi, parentMatricule: string): Enfant {
  const sexe = d.enfant_sexe === 'F' ? 'F' : 'M';
  const lienParente = LIEN_API_TO_FR[d.enfant_lien_parente] || 'Autre';
  const { validation, motifRefus } = validationFromStatut(d.statut, d.non_validation_reason);
  const { desistement, dateDesistement } = desistementFromDemande(d.statut, d.has_desistement_pending);
  const when = d.date_inscription;
  const dateInscription = when.includes('T') ? when : `${when}T12:00:00.000Z`;

  let dateDes = dateDesistement;
  if (d.date_desistement) {
    const raw = d.date_desistement;
    dateDes = raw.includes('T') ? raw.split('T')[0] : raw.slice(0, 10);
  }

  const updatedAt =
    d.updated_at == null || d.updated_at === ''
      ? null
      : typeof d.updated_at === 'string'
        ? d.updated_at
        : null;

  return {
    id: String(d.id),
    demandeId: d.id,
    enfantDbId: d.enfant_id,
    rangListe: d.rang_dans_liste,
    updatedAt,
    informationsValideesParAdmin: !!d.is_selection_finale,
    parentMatricule,
    prenom: d.enfant_prenom,
    nom: d.enfant_nom,
    dateNaissance: toDateIso(d.enfant_date_naissance),
    sexe,
    lienParente,
    liste: listeFromCode(d.liste_code),
    statut: statutFromDemande(d),
    dateInscription,
    desistement,
    dateDesistement: dateDes,
    validation,
    motifRefus,
    reinscrit: !!d.is_reinscrit,
    rejetDefinitif: !!d.rejet_definitif,
  };
}

export function mapTransparenceRowToEnfant(row: TransparenceRowApi): Enfant {
  const d: DemandeOutApi = {
    id: row.demande_id,
    liste_code: row.liste_code,
    rang_dans_liste: row.rang_dans_liste,
    date_inscription: row.date_inscription,
    updated_at: row.updated_at ?? null,
    statut: row.statut_demande,
    non_validation_reason: null,
    is_selection_finale: false,
    has_desistement_pending: false,
    is_reinscrit: row.is_reinscrit,
    enfant_id: row.enfant_id,
    enfant_prenom: row.enfant_prenom,
    enfant_nom: row.enfant_nom,
    enfant_date_naissance: row.enfant_date_naissance,
    enfant_sexe: row.enfant_sexe,
    enfant_lien_parente: row.enfant_lien_parente,
    enfant_is_titulaire: row.enfant_is_titulaire,
    rejet_definitif: false,
  };
  const e = mapDemandeOutToEnfant(d, row.parent_matricule);
  return { ...e, enfantDbId: row.enfant_id };
}

export function mapListeFinaleRowToEnfant(row: ListeFinaleRowApi): Enfant {
  const sexe = row.enfant_sexe === 'F' ? 'F' : 'M';
  const when = row.date_inscription;
  const dateInscription = when.includes('T') ? when : `${when}T12:00:00.000Z`;
  return {
    id: String(row.demande_id),
    demandeId: row.demande_id,
    parentMatricule: row.parent_matricule,
    prenom: row.enfant_prenom,
    nom: row.enfant_nom,
    dateNaissance: toDateIso(row.enfant_date_naissance),
    sexe,
    lienParente: 'Père',
    liste: listeFromCode(row.liste_code),
    statut: statutFromDemande({
      liste_code: row.liste_code,
      enfant_is_titulaire: row.liste_code === 'PRINCIPALE',
    }),
    dateInscription,
    validation: 'validé',
  };
}

export function parentsFromTransparence(rows: TransparenceRowApi[]): Parent[] {
  const map = new Map<string, Parent>();
  for (const r of rows) {
    if (!map.has(r.parent_matricule)) {
      map.set(r.parent_matricule, {
        matricule: r.parent_matricule,
        prenom: r.parent_prenom,
        nom: r.parent_nom,
        service: r.parent_service,
        motDePasse: '',
      });
    }
  }
  return Array.from(map.values());
}

export function parentsFromListeFinale(rows: ListeFinaleRowApi[]): Parent[] {
  const map = new Map<string, Parent>();
  for (const r of rows) {
    if (!map.has(r.parent_matricule)) {
      map.set(r.parent_matricule, {
        matricule: r.parent_matricule,
        prenom: r.parent_prenom,
        nom: r.parent_nom,
        service: r.parent_service,
        motDePasse: '',
      });
    }
  }
  return Array.from(map.values());
}
