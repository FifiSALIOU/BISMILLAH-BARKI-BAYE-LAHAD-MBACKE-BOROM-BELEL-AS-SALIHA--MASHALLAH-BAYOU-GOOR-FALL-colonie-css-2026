type TitulaireSwapBadgeRecord = {
  parentMatricule: string;
  promotedDemandeId: number;
  exTitulaireDemandeId: number;
  updatedAt: string;
};

type LookupArgs = {
  parentMatricule: string;
  demandeId: number;
};

export type TitulaireSwapBadgeKind = 'promoted' | 'ex_titulaire';

const STORAGE_KEY = 'titulaire-swap-badges-v1';

const normalizeMatricule = (value: string): string => (value || '').trim().toUpperCase();

const isBrowser = (): boolean => typeof window !== 'undefined' && !!window.localStorage;

const readRecords = (): TitulaireSwapBadgeRecord[] => {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (x): x is TitulaireSwapBadgeRecord =>
        !!x &&
        typeof x.parentMatricule === 'string' &&
        typeof x.promotedDemandeId === 'number' &&
        typeof x.exTitulaireDemandeId === 'number' &&
        typeof x.updatedAt === 'string',
    );
  } catch {
    return [];
  }
};

const writeRecords = (records: TitulaireSwapBadgeRecord[]): void => {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch {
    // Ignoré: persistance optionnelle d'affichage.
  }
};

export const markTitulaireSwapBadges = (args: {
  parentMatricule: string;
  promotedDemandeId: number;
  exTitulaireDemandeId: number;
}): void => {
  const parentMatricule = normalizeMatricule(args.parentMatricule);
  if (!parentMatricule) return;
  if (!Number.isFinite(args.promotedDemandeId) || !Number.isFinite(args.exTitulaireDemandeId)) return;
  const next: TitulaireSwapBadgeRecord = {
    parentMatricule,
    promotedDemandeId: Number(args.promotedDemandeId),
    exTitulaireDemandeId: Number(args.exTitulaireDemandeId),
    updatedAt: new Date().toISOString(),
  };
  const records = readRecords().filter((x) => normalizeMatricule(x.parentMatricule) !== parentMatricule);
  records.push(next);
  writeRecords(records);
};

export const getTitulaireSwapBadgeKind = ({ parentMatricule, demandeId }: LookupArgs): TitulaireSwapBadgeKind | null => {
  const key = normalizeMatricule(parentMatricule);
  if (!key || !Number.isFinite(demandeId)) return null;
  const rec = readRecords().find((x) => normalizeMatricule(x.parentMatricule) === key);
  if (!rec) return null;
  if (Number(rec.promotedDemandeId) === Number(demandeId)) return 'promoted';
  if (Number(rec.exTitulaireDemandeId) === Number(demandeId)) return 'ex_titulaire';
  return null;
};

/** Affichage uniquement : aligne les pastilles « Promu » / « Ex-titulaire » sur le rôle actuel (pas de changement métier ni localStorage). */
export const titulaireSwapBadgeKindForDisplay = (
  kind: TitulaireSwapBadgeKind | null,
  statut: 'Titulaire' | 'Suppléant N1' | 'Suppléant N2',
): TitulaireSwapBadgeKind | null => {
  if (!kind) return null;
  if (kind === 'promoted' && statut === 'Titulaire') return 'promoted';
  if (kind === 'ex_titulaire' && statut === 'Suppléant N1') return 'ex_titulaire';
  return null;
};
