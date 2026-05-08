import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Enfant, AppSettings, DEFAULT_SETTINGS, Parent, HistoriqueEntry } from '@/data/mockData';
import { idDemandePourRang, rangAfficheParDemandeIdPourEnfants, trierEnfantsParOrdreArrivee } from '@/lib/ordreArriveeListe';

interface InscriptionContextType {
  enfants: Enfant[];
  parents: Parent[];
  settings: AppSettings;
  historique: HistoriqueEntry[];
  updateSettings: (s: Partial<AppSettings>) => void;
  addEnfant: (enfant: Enfant) => void;
  updateEnfant: (id: string, updates: Partial<Enfant>) => void;
  removeEnfant: (id: string) => void;
  getEnfantsByParent: (matricule: string) => Enfant[];
  getEnfantsByListe: (liste: Enfant['liste']) => Enfant[];
  setTitulaire: (matricule: string, enfantId: string) => void;
  demanderDesistement: (enfantId: string) => void;
  annulerDesistement: (enfantId: string) => void;
  validerDesistement: (enfantId: string) => void;
  reinscrireEnfant: (enfantId: string) => void;
  transfererEnfant: (enfantId: string, nouvelleListe: Enfant['liste']) => void;
  getListeFinale: () => Enfant[];
  getRangDansListe: (enfantId: string) => number;
  addParent: (parent: Parent) => void;
  updateParent: (matricule: string, updates: Partial<Parent>) => void;
  removeParent: (matricule: string) => void;
  validerEnfant: (enfantId: string) => void;
  refuserEnfant: (enfantId: string, motif: string) => void;
  getEnfantsDesistesFinale: () => Enfant[];
  addHistorique: (entry: Omit<HistoriqueEntry, 'id' | 'date' | 'heure'>) => void;
  isListeFinaleComplete: () => boolean;
  genererListeFinale: () => void;
  listeFinaleGeneree: boolean;
}

const InscriptionContext = createContext<InscriptionContextType | undefined>(undefined);

export function InscriptionProvider({ children }: { children: ReactNode }) {
  const [enfants, setEnfants] = useState<Enfant[]>([]);
  const [parents, setParents] = useState<Parent[]>([]);
  const [settings, setSettings] = useState<AppSettings>({ ...DEFAULT_SETTINGS });
  const [historique, setHistorique] = useState<HistoriqueEntry[]>([]);
  const [listeFinaleGeneree, setListeFinaleGeneree] = useState<boolean>(false);

  const updateSettings = (s: Partial<AppSettings>) => {
    setSettings(prev => ({ ...prev, ...s }));
  };

  const addHistorique = (entry: Omit<HistoriqueEntry, 'id' | 'date' | 'heure'>) => {
    const now = new Date();
    setHistorique(prev => [{
      ...entry,
      id: `h_${Date.now()}`,
      date: now.toISOString().split('T')[0],
      heure: now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
    }, ...prev]);
  };

  const addEnfant = (enfant: Enfant) => {
    setEnfants(prev => [...prev, enfant]);
  };

  const updateEnfant = (id: string, updates: Partial<Enfant>) => {
    setEnfants(prev => prev.map(e => e.id === id ? { ...e, ...updates } : e));
  };

  const removeEnfant = (id: string) => {
    setEnfants(prev => prev.filter(e => e.id !== id));
  };

  const getEnfantsByParent = (matricule: string) => {
    return enfants.filter(e => e.parentMatricule === matricule);
  };

  const getEnfantsByListe = (liste: Enfant['liste']) => {
    return trierEnfantsParOrdreArrivee(enfants.filter(e => e.liste === liste));
  };

  const setTitulaire = (matricule: string, enfantId: string) => {
    setEnfants(prev => {
      const parentEnfants = prev.filter(e => e.parentMatricule === matricule);
      const others = prev.filter(e => e.parentMatricule !== matricule);
      const updated = parentEnfants.map(e => {
        if (e.id === enfantId) {
          return { ...e, liste: 'principale' as const, statut: 'Titulaire' as const };
        }
        if (e.liste === 'principale' && e.statut === 'Titulaire') {
          if (e.lienParente === 'Autre') {
            return { ...e, liste: 'attente_n2' as const, statut: 'Suppléant N2' as const };
          }
          return { ...e, liste: 'attente_n1' as const, statut: 'Suppléant N1' as const };
        }
        return e;
      });
      return [...others, ...updated];
    });
  };

  const demanderDesistement = (enfantId: string) => {
    setEnfants(prev => prev.map(e => e.id === enfantId ? { ...e, desistement: 'demandé' as const, dateDesistement: new Date().toISOString().split('T')[0] } : e));
  };

  const annulerDesistement = (enfantId: string) => {
    setEnfants(prev => prev.map(e => e.id === enfantId ? { ...e, desistement: null, dateDesistement: undefined } : e));
  };

  const validerDesistement = (enfantId: string) => {
    setEnfants(prev => prev.map(e => e.id === enfantId ? { ...e, desistement: 'validé' as const } : e));
  };

  const reinscrireEnfant = (enfantId: string) => {
    setEnfants(prev => {
      const enfant = prev.find(e => e.id === enfantId);
      if (!enfant) return prev;
      const now = new Date();
      const newDateInscription = now.toISOString();
      return prev.map(e => {
        if (e.id !== enfantId) return e;
        return {
          ...e,
          desistement: null,
          dateDesistement: undefined,
          validation: 'en_attente' as const,
          reinscrit: true,
          dateInscription: newDateInscription,
          updatedAt: newDateInscription,
        };
      });
    });
  };

  const validerEnfant = (enfantId: string) => {
    setEnfants(prev => prev.map(e => e.id === enfantId ? { ...e, validation: 'validé' as const } : e));
  };

  const refuserEnfant = (enfantId: string, motif: string) => {
    setEnfants(prev => {
      const enfant = prev.find(e => e.id === enfantId);
      if (!enfant) return prev.map(e => e.id === enfantId ? { ...e, validation: 'refusé' as const, motifRefus: motif } : e);

      // Count how many children this parent has registered (across all lists)
      const parentChildCount = prev.filter(e => e.parentMatricule === enfant.parentMatricule).length;

      // Determine target list based on parent's total child count
      let targetListe: Enfant['liste'];
      let targetStatut: string;

      if (parentChildCount <= 1) {
        // Parent has only 1 child → transfer to N1
        targetListe = 'attente_n1';
        targetStatut = 'Suppléant N1';
      } else {
        // Parent has 2+ children → transfer to N2
        targetListe = 'attente_n2';
        targetStatut = 'Suppléant N2';
      }

      const newDateInscription = new Date().toISOString();

      return prev.map(e =>
        e.id === enfantId
          ? {
              ...e,
              validation: 'refusé' as const,
              motifRefus: motif,
              liste: targetListe,
              statut: targetStatut as any,
              dateInscription: newDateInscription,
            }
          : e
      );
    });
  };

  const transfererEnfant = (enfantId: string, nouvelleListe: Enfant['liste']) => {
    const statutMap: Record<string, string> = {
      principale: 'Titulaire',
      attente_n1: 'Suppléant N1',
      attente_n2: 'Suppléant N2',
    };
    const newDateInscription = new Date().toISOString();
    setEnfants(prev => prev.map(e =>
      e.id === enfantId
        ? { ...e, liste: nouvelleListe, statut: statutMap[nouvelleListe] as any, dateInscription: newDateInscription }
        : e
    ));
  };

  const getRangDansListe = (enfantId: string) => {
    const enfant = enfants.find(e => e.id === enfantId);
    if (!enfant) return 0;
    if (typeof enfant.rangListe === 'number' && enfant.rangListe > 0) return enfant.rangListe;
    const listeEnfants = enfants.filter(e => e.liste === enfant.liste);
    const m = rangAfficheParDemandeIdPourEnfants(listeEnfants);
    const did = idDemandePourRang(enfant);
    return did >= 0 ? m.get(did) ?? 0 : 0;
  };

  const isInscriptionsCloturees = () => {
    if (!settings.dateFinInscriptions) return false;
    const now = new Date();
    const heureFin = settings.heureFinInscriptions || '23:59';
    const dateFin = new Date(`${settings.dateFinInscriptions}T${heureFin}:59`);
    return now > dateFin;
  };

  const getOrderedEligibleEnfants = () => {
    const byListe = (liste: Enfant['liste']) =>
      trierEnfantsParOrdreArrivee(
        enfants.filter(e => e.liste === liste && (e.validation || 'en_attente') !== 'refusé'),
      );

    return [
      ...byListe('principale'),
      ...byListe('attente_n1'),
      ...byListe('attente_n2'),
    ];
  };

  const getListeFinale = () => {
    if (!isInscriptionsCloturees() || !listeFinaleGeneree) return [];

    const orderedEligibleEnfants = getOrderedEligibleEnfants().filter(e => e.desistement !== 'validé');

    if (settings.capaciteMax === null) return orderedEligibleEnfants;
    return orderedEligibleEnfants.slice(0, settings.capaciteMax);
  };

  const isListeFinaleComplete = () => {
    if (settings.capaciteMax === null) return false;
    const listeFinale = getListeFinale();
    return listeFinale.length >= settings.capaciteMax;
  };

  const getEnfantsDesistesFinale = () => {
    if (!isInscriptionsCloturees() || !listeFinaleGeneree) return [];

    const orderedEligibleEnfants = getOrderedEligibleEnfants();
    const retainedPool = settings.capaciteMax === null
      ? orderedEligibleEnfants
      : orderedEligibleEnfants.slice(0, settings.capaciteMax);

    return retainedPool.filter(e => e.desistement === 'demandé' || e.desistement === 'validé');
  };

  const genererListeFinale = () => {
    if (!isInscriptionsCloturees() || listeFinaleGeneree) return;

    setListeFinaleGeneree(true);
    addHistorique({
      utilisateur: 'Système',
      role: 'Admin',
      action: 'Génération liste finale',
      details: `La liste finale a été générée selon la priorité Principale > N1 > N2`,
      cible: 'Liste finale',
    });
  };

  const addParent = (parent: Parent) => {
    setParents(prev => [...prev, parent]);
  };

  const updateParent = (matricule: string, updates: Partial<Parent>) => {
    setParents(prev => prev.map(p => p.matricule === matricule ? { ...p, ...updates } : p));
  };

  const removeParent = (matricule: string) => {
    setParents(prev => prev.filter(p => p.matricule !== matricule));
  };

  return (
    <InscriptionContext.Provider value={{
      enfants, parents, settings, historique, updateSettings,
      addEnfant, updateEnfant, removeEnfant,
      getEnfantsByParent, getEnfantsByListe,
      setTitulaire, demanderDesistement, annulerDesistement, validerDesistement, reinscrireEnfant,
      transfererEnfant, getListeFinale, getRangDansListe,
      addParent, updateParent, removeParent,
      validerEnfant, refuserEnfant, getEnfantsDesistesFinale,
      addHistorique, isListeFinaleComplete,
      genererListeFinale, listeFinaleGeneree,
    }}>
      {children}
    </InscriptionContext.Provider>
  );
}

export function useInscription() {
  const ctx = useContext(InscriptionContext);
  if (!ctx) throw new Error('useInscription must be used within InscriptionProvider');
  return ctx;
}
