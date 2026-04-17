import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { flushSync } from 'react-dom';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { useInscription } from '@/contexts/InscriptionContext';
import { calculateAge, type Enfant, type Parent } from '@/data/mockData';
import { apiRequest } from '@/lib/api';
import {
  mapDemandeOutToEnfant,
  mapTransparenceRowToEnfant,
  mapListeFinaleRowToEnfant,
  parentsFromTransparence,
  parentsFromListeFinale,
  type DemandeOutApi,
  type TransparenceRowApi,
  type ListeFinaleRowApi,
} from '@/lib/parentDemandeMapping';
import {
  compareEnfantsOrdreArrivee,
  idDemandePourRang,
  rangAfficheParDemandeIdPourEnfants,
} from '@/lib/ordreArriveeListe';
import { Users, UserCheck, Clock, Star, Award, AlertTriangle, Lock, UserPlus, ArrowUpDown, HandMetal, XCircle, RotateCcw, Hash, Search, User, FilePenLine, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { toast } from '@/hooks/use-toast';
import InscrireEnfant from '@/components/parent/InscrireEnfant';
import ListeFinaleParent from '@/components/parent/ListeFinaleParent';

type LienParenteApi = 'PERE' | 'MERE' | 'TUTEUR_LEGAL' | 'AUTRE';

const LIEN_PARENTE_FR_TO_API: Record<string, LienParenteApi> = {
  'Père': 'PERE',
  'Mère': 'MERE',
  'Tuteur légal': 'TUTEUR_LEGAL',
  Autre: 'AUTRE',
};

export default function ParentDashboard() {
  const { parent, token, refreshParentProfile } = useAuth();
  const { settings, addHistorique } = useInscription();

  const [mesEnfants, setMesEnfants] = useState<Enfant[]>([]);
  const [transparenceEnfants, setTransparenceEnfants] = useState<Enfant[]>([]);
  const [transparenceParents, setTransparenceParents] = useState<Parent[]>([]);
  const [listeFinaleApiEnfants, setListeFinaleApiEnfants] = useState<Enfant[]>([]);
  const [listeFinaleApiParents, setListeFinaleApiParents] = useState<Parent[]>([]);
  /** Aligné sur le serveur : liste finale publiée seulement après clôture des inscriptions. */
  const [listeFinaleApiPubliee, setListeFinaleApiPubliee] = useState(false);
  /** Après validation définitive par le gestionnaire : actions de désistement / titulaire bloquées côté API. */
  const [listeFinaleDefinitiveApi, setListeFinaleDefinitiveApi] = useState(false);
  /** True seulement après succès de `/parent/demandes` + transparence (jamais sur erreur réseau/API — évite le bandeau « pas d'enfant » puis disparition). */
  const [demandesParentChargees, setDemandesParentChargees] = useState(false);
  const chargementDemandesSeqRef = useRef(0);

  const loadAll = useCallback(async () => {
    const matricule = parent?.matricule;
    if (!token || !matricule) return;
    const seq = ++chargementDemandesSeqRef.current;
    try {
      const [demandes, trans] = await Promise.all([
        apiRequest<DemandeOutApi[]>('/parent/demandes', { token }),
        apiRequest<TransparenceRowApi[]>('/parent/inscriptions-transparence', { token }),
      ]);
      if (seq !== chargementDemandesSeqRef.current) return;

      const rows = trans || [];
      const mapped = (demandes || []).map((d) => mapDemandeOutToEnfant(d, matricule));
      /* Un seul commit : évite un rendu intermédiaire « prêt + liste vide ». */
      flushSync(() => {
        setMesEnfants(mapped);
        setTransparenceEnfants(rows.map(mapTransparenceRowToEnfant));
        setTransparenceParents(parentsFromTransparence(rows));
        setDemandesParentChargees(true);
      });

      try {
        const finaleRes = await apiRequest<{
          disponible: boolean;
          retenus: ListeFinaleRowApi[];
          liste_finale_definitive?: boolean;
        }>('/parent/liste-finale', { token });
        if (seq !== chargementDemandesSeqRef.current) return;
        const fin = finaleRes?.retenus ?? [];
        setListeFinaleApiPubliee(!!finaleRes?.disponible);
        setListeFinaleDefinitiveApi(!!finaleRes?.liste_finale_definitive);
        setListeFinaleApiEnfants(fin.map(mapListeFinaleRowToEnfant));
        setListeFinaleApiParents(parentsFromListeFinale(fin));
      } catch {
        if (seq !== chargementDemandesSeqRef.current) return;
        setListeFinaleApiPubliee(false);
        setListeFinaleDefinitiveApi(false);
        setListeFinaleApiEnfants([]);
        setListeFinaleApiParents([]);
      }
    } catch (e) {
      console.error(e);
      if (seq !== chargementDemandesSeqRef.current) return;
      /* Ne pas passer demandesParentChargees à true ici : sinon bandeau « pas d'enfant codifié » si une requête échoue puis la suivante réussit. */
      toast({
        title: 'Chargement incomplet',
        description: e instanceof Error ? e.message : 'Impossible de charger vos inscriptions. Réessayez dans un instant.',
        variant: 'destructive',
      });
    }
  }, [token, parent?.matricule]);

  useEffect(() => {
    chargementDemandesSeqRef.current += 1;
    setMesEnfants([]);
    setTransparenceEnfants([]);
    setTransparenceParents([]);
    setListeFinaleApiPubliee(false);
    setListeFinaleDefinitiveApi(false);
    setListeFinaleApiEnfants([]);
    setListeFinaleApiParents([]);
    setDemandesParentChargees(false);
  }, [parent?.matricule, token]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  // Inscription dialog
  const [inscrireOpen, setInscrireOpen] = useState(false);

  // Action states (from MesEnfants)
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [selectedId, setSelectedId] = useState('');
  const [selectedName, setSelectedName] = useState('');
  const [desistementOpen, setDesistementOpen] = useState(false);
  const [desistementId, setDesistementId] = useState('');
  const [desistementName, setDesistementName] = useState('');
  const [reinscrireOpen, setReinscrireOpen] = useState(false);
  const [reinscrireId, setReinscrireId] = useState('');
  const [reinscireName, setReinscireName] = useState('');
  const [cancelDesistError, setCancelDesistError] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editEnfantId, setEditEnfantId] = useState('');
  const [editPrenom, setEditPrenom] = useState('');
  const [editNom, setEditNom] = useState('');
  const [editDateNaissance, setEditDateNaissance] = useState('');
  const [editSexe, setEditSexe] = useState<'M' | 'F'>('M');
  const [editLienParente, setEditLienParente] = useState<LienParenteApi>('PERE');

  // Tabs
  const [activeTab, setActiveTab] = useState('principale');
  const [highlightedEnfantId, setHighlightedEnfantId] = useState<string | null>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [phoneInput, setPhoneInput] = useState('');
  const [phoneSaving, setPhoneSaving] = useState(false);
  const [ordreRolesDialogOpen, setOrdreRolesDialogOpen] = useState(false);
  const [ordreRolesDialogText, setOrdreRolesDialogText] = useState('');

  useEffect(() => {
    if (!listeFinaleApiPubliee && activeTab === 'liste_finale') {
      setActiveTab('principale');
    }
  }, [listeFinaleApiPubliee, activeTab]);

  useEffect(() => {
    setPhoneInput(parent?.telephone || '');
  }, [parent?.telephone]);

  const enfantsMesEligibles = useMemo(() => {
    const lo = settings.ageMin;
    const hi = settings.ageMax;
    return mesEnfants.filter((e) => {
      const y = new Date(e.dateNaissance).getFullYear();
      return y >= lo && y <= hi;
    });
  }, [mesEnfants, settings.ageMin, settings.ageMax]);

  /** Places « P + N1 + N2 biologique » occupées : aligné sur le plafond MAX (2 ou 3) sans autre changement métier. */
  const placesListesParentSaison = useMemo(() => {
    const occupeTitulaire = enfantsMesEligibles.some((e) => e.statut === 'Titulaire' && !e.desistement);
    const occupeN1 = enfantsMesEligibles.some((e) => e.liste === 'attente_n1' && !e.desistement);
    const nonInscritPourCompte = (e: Enfant) =>
      (e.sansAttributionListe === true && e.lienParente !== 'Autre' && e.statut !== 'Titulaire') ||
      (e.rangListe == null &&
        e.liste === 'attente_n2' &&
        e.lienParente !== 'Autre' &&
        e.statut !== 'Titulaire');
    const bioN2Inscrit = (e: Enfant) =>
      e.lienParente !== 'Autre' && e.liste === 'attente_n2' && !nonInscritPourCompte(e);
    const occupeN2Bio = enfantsMesEligibles.some((e) => bioN2Inscrit(e) && !e.desistement);
    return (occupeTitulaire ? 1 : 0) + (occupeN1 ? 1 : 0) + (occupeN2Bio ? 1 : 0);
  }, [enfantsMesEligibles]);

  /** Ordre des cartes « Mes enfants » uniquement : Titulaire → N1 → N2 biologique inscrit → le reste (affichage seul). */
  const enfantsMesEligiblesOrdreAffichage = useMemo(() => {
    const nonInscritPourTri = (e: Enfant) =>
      (e.sansAttributionListe === true && e.lienParente !== 'Autre' && e.statut !== 'Titulaire') ||
      (e.rangListe == null &&
        e.liste === 'attente_n2' &&
        e.lienParente !== 'Autre' &&
        e.statut !== 'Titulaire');
    const bioN2Inscrit = (e: Enfant) =>
      e.lienParente !== 'Autre' && e.liste === 'attente_n2' && !nonInscritPourTri(e);
    const rank = (e: Enfant): number => {
      if (e.statut === 'Titulaire') return 0;
      if (e.statut === 'Suppléant N1') return 1;
      if (bioN2Inscrit(e)) return 2;
      return 3;
    };
    return [...enfantsMesEligibles]
      .map((e, i) => ({ e, i }))
      .sort((a, b) => {
        const d = rank(a.e) - rank(b.e);
        if (d !== 0) return d;
        return a.i - b.i;
      })
      .map(({ e }) => e);
  }, [enfantsMesEligibles]);

  if (!parent) return null;

  const phoneRaw = (parent.telephone || '').trim();
  const hasRequiredPhone = !!phoneRaw && phoneRaw !== '-' && !phoneRaw.startsWith('tel:');

  const saveRequiredPhone = async () => {
    const tel = phoneInput.trim();
    if (!tel) {
      toast({ title: 'Numéro requis', description: 'Veuillez saisir votre numéro de téléphone.', variant: 'destructive' });
      return;
    }
    if (!token) return;
    setPhoneSaving(true);
    try {
      await apiRequest('/parent/telephone', {
        method: 'POST',
        token,
        body: JSON.stringify({ telephone: tel }),
      });
      await refreshParentProfile();
      toast({ title: 'Numéro enregistré', description: 'Votre numéro de téléphone a été enregistré.' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Impossible d’enregistrer le numéro.';
      toast({ title: 'Erreur', description: msg, variant: 'destructive' });
    } finally {
      setPhoneSaving(false);
    }
  };

  const now = new Date();
  const dateFin = settings.dateFinInscriptions ? new Date(settings.dateFinInscriptions + 'T23:59:59') : null;
  const inscriptionsCloturees = dateFin ? now > dateFin : false;

  const MAX = settings.maxEnfantsParParent;
  const enfants = mesEnfants;
  const allEnfants = transparenceEnfants;
  const allParents = transparenceParents;

  /**
   * Désistement validé ou demande rejetée sur les infos (NON_VALIDEE → refusé) :
   * pas dans les onglets transparence Liste P / N1 / N2 — sans changer les rangs en base.
   */
  const dansOngletsListeTransparence = (e: Enfant) =>
    e.desistement !== 'validé' && (e.validation || 'en_attente') !== 'refusé';

  /** Fallback si `rangListe` absent (données mock) — ordre d’arrivée. Les données API ont `rangListe` = `rang_dans_liste`. */
  const rangAfficheParListe = useMemo(() => {
    const keys: Enfant['liste'][] = ['principale', 'attente_n1', 'attente_n2'];
    const out: Record<string, Map<number, number>> = {};
    for (const l of keys) {
      const subset = allEnfants.filter((e) => e.liste === l && dansOngletsListeTransparence(e));
      out[l] = rangAfficheParDemandeIdPourEnfants(subset);
    }
    return out;
  }, [allEnfants]);
  const allDesistes =
    inscriptionsCloturees && enfantsMesEligibles.length > 0 && enfantsMesEligibles.every((e) => e.desistement === 'validé');
  const titulaire = enfantsMesEligibles.find((e) => e.statut === 'Titulaire');
  const suppN1 = enfantsMesEligibles.find((e) => e.liste === 'attente_n1');
  const suppN2 = enfantsMesEligibles.find((e) => e.statut === 'Suppléant N2');

  /** Identifiants de demandes réellement dans la liste finale publiée (après clôture) — pas la simple validation des infos. */
  const demandeIdsListeFinaleRetenus = useMemo(() => {
    const ids = new Set<number>();
    for (const row of listeFinaleApiEnfants) {
      if (typeof row.demandeId === 'number') ids.add(row.demandeId);
    }
    return ids;
  }, [listeFinaleApiEnfants]);

  const enfantsRetenusListeFinale = listeFinaleApiPubliee
    ? enfantsMesEligibles.filter(
        (e) => typeof e.demandeId === 'number' && demandeIdsListeFinaleRetenus.has(e.demandeId),
      )
    : [];

  const enfantN1 = enfantsMesEligibles.find((e) => e.liste === 'attente_n1' && !e.desistement);
  const hasTitulaire = enfantsMesEligibles.some((e) => e.statut === 'Titulaire');
  const hasSuppleantN1 = enfantsMesEligibles.some((e) => e.liste === 'attente_n1' && !e.desistement);
  const isNonInscrit = (e: Enfant) =>
    (e.sansAttributionListe === true && e.lienParente !== 'Autre' && e.statut !== 'Titulaire') ||
    (e.rangListe == null &&
      e.liste === 'attente_n2' &&
      e.lienParente !== 'Autre' &&
      e.statut !== 'Titulaire');

  const capListesTitulaireN1Atteint = MAX != null && placesListesParentSaison >= MAX;
  const actionsTitulaireN1BloqueesPourCarte = (e: Enfant) =>
    capListesTitulaireN1Atteint && isNonInscrit(e) && e.lienParente !== 'Autre';
  /** Biologique déjà affecté à la liste N°2 (vraie inscription N2) : masquer Titulaire / N1 / N2, garder désistement. Ne concerne pas « Autre » ni « non inscrit ». */
  const enfantBiologiqueSuppleantN2Place = (e: Enfant) =>
    e.lienParente !== 'Autre' && e.liste === 'attente_n2' && !isNonInscrit(e);
  const getDemandeIdForAction = (e: Enfant | undefined): number | null => {
    if (!e) return null;
    if (typeof e.demandeId === 'number' && Number.isFinite(e.demandeId)) return e.demandeId;
    const fallback = Number(e.id);
    return Number.isFinite(fallback) ? fallback : null;
  };

  // Action handlers (same as MesEnfants - unchanged behavior)
  const handleSetTitulaire = (id: string, name: string) => { setSelectedId(id); setSelectedName(name); setConfirmOpen(true); };
  const confirmChange = async () => {
    const e = enfants.find((x) => x.id === selectedId);
    const demandeId = getDemandeIdForAction(e);
    /** L’API `/parent/titulaire` attend en priorité l’id de la demande (`DemandeOut.id`). */
    if (!demandeId || !token) {
      setConfirmOpen(false);
      return;
    }
    try {
      await apiRequest('/parent/titulaire', {
        method: 'POST',
        token,
        body: JSON.stringify({ enfant_id_titulaire: demandeId }),
      });
      await loadAll();
      addHistorique({ utilisateur: `${parent.prenom} ${parent.nom}`, role: 'Parent', action: 'Changement titulaire', details: `A défini ${selectedName} comme titulaire`, cible: selectedName });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Action impossible';
      toast({ title: 'Action impossible', description: msg, variant: 'destructive' });
      console.error(err);
    }
    setConfirmOpen(false);
  };

  const handleDesistement = (id: string, name: string) => { setDesistementId(id); setDesistementName(name); setDesistementOpen(true); };
  const desistementTarget = enfants.find(e => e.id === desistementId);
  const isTitulaireDesistement = desistementTarget?.statut === 'Titulaire';

  const handleSwapAndDesist = async () => {
    const demandeId = getDemandeIdForAction(enfantN1);
    if (!demandeId || !token) return;
    try {
      await apiRequest('/parent/titulaire', {
        method: 'POST',
        token,
        body: JSON.stringify({ enfant_id_titulaire: demandeId }),
      });
      await loadAll();
      addHistorique({ utilisateur: `${parent.prenom} ${parent.nom}`, role: 'Parent', action: 'Changement titulaire', details: `A défini ${enfantN1.prenom} ${enfantN1.nom} comme titulaire avant désistement`, cible: `${enfantN1.prenom} ${enfantN1.nom}` });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Action impossible';
      toast({ title: 'Action impossible', description: msg, variant: 'destructive' });
      console.error(err);
    }
  };

  const confirmDesistement = async () => {
    if (!token) return;
    try {
      await apiRequest(`/parent/desistement/${Number(desistementId)}`, {
        method: 'POST',
        token,
        body: JSON.stringify({ reason: null }),
      });
      await loadAll();
      addHistorique({
        utilisateur: `${parent.prenom} ${parent.nom}`,
        role: 'Parent',
        action: 'Désistement enregistré',
        details: `A confirmé le désistement de ${desistementName} (effectif immédiatement).`,
        cible: desistementName,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Action impossible';
      toast({ title: 'Action impossible', description: msg, variant: 'destructive' });
      console.error(err);
    }
    setDesistementOpen(false);
  };

  const handleAnnulerDesistement = async (id: string) => {
    const enfant = enfants.find(e => e.id === id);
    if (enfant?.desistement === 'validé') { setCancelDesistError(true); return; }
    if (!token) return;
    try {
      await apiRequest(`/parent/desistement/${Number(id)}/annuler`, { method: 'POST', token });
      await loadAll();
      addHistorique({ utilisateur: `${parent.prenom} ${parent.nom}`, role: 'Parent', action: 'Annulation désistement', details: `A annulé le désistement de ${enfant?.prenom} ${enfant?.nom}`, cible: `${enfant?.prenom} ${enfant?.nom}` });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Action impossible';
      toast({ title: 'Action impossible', description: msg, variant: 'destructive' });
      console.error(err);
    }
  };

  const handleReinscrire = (id: string, name: string) => { setReinscrireId(id); setReinscireName(name); setReinscrireOpen(true); };
  const confirmReinscrire = async () => {
    if (!token) return;
    try {
      await apiRequest(`/parent/desistement/${Number(reinscrireId)}/reinscrire`, { method: 'POST', token });
      await loadAll();
      addHistorique({ utilisateur: `${parent.prenom} ${parent.nom}`, role: 'Parent', action: 'Réinscription', details: `A réinscrit ${reinscireName} après désistement`, cible: reinscireName });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Action impossible';
      toast({ title: 'Action impossible', description: msg, variant: 'destructive' });
      console.error(err);
    }
    setReinscrireOpen(false);
  };

  const setAsSuppleantN1 = async (id: string) => {
    if (!hasTitulaire) {
      setOrdreRolesDialogText(
        'Vous devez d’abord désigner l’enfant titulaire avant de placer un suppléant N°1.',
      );
      setOrdreRolesDialogOpen(true);
      return;
    }
    const current = enfants.find((e) => e.id === id);
    const demandeId = getDemandeIdForAction(current);
    if (!current || !token) return;
    if (!demandeId) return;
    try {
      await apiRequest('/parent/suppleant-n1', {
        method: 'POST',
        token,
        body: JSON.stringify({ enfant_id_titulaire: demandeId }),
      });
      await loadAll();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Action impossible';
      toast({ title: 'Action impossible', description: msg, variant: 'destructive' });
    }
  };

  const setAsSuppleantN2 = async (id: string) => {
    if (!hasTitulaire || !hasSuppleantN1) {
      setOrdreRolesDialogText(
        'L’ordre à respecter est : d’abord le titulaire, ensuite le suppléant N°1, puis le suppléant N°2. Définissez les rôles précédents avant le suppléant N°2. ' +
          'Le bouton suppléant N°2 n’apparaît que si l’administration autorise trois enfants par parent (section Paramètres).',
      );
      setOrdreRolesDialogOpen(true);
      return;
    }
    const current = enfants.find((e) => e.id === id);
    const demandeId = getDemandeIdForAction(current);
    if (!current || !token) return;
    if (!demandeId) return;
    try {
      await apiRequest('/parent/suppleant-n2', {
        method: 'POST',
        token,
        body: JSON.stringify({ enfant_id_titulaire: demandeId }),
      });
      await loadAll();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Action impossible';
      toast({ title: 'Action impossible', description: msg, variant: 'destructive' });
    }
  };

  const afficherBoutonSuppleantN1PourCarte = (e: Enfant) => e.statut !== 'Suppléant N1';

  const handleEditDemande = (enfant: Enfant) => {
    const lienApi = LIEN_PARENTE_FR_TO_API[enfant.lienParente] || 'AUTRE';
    setEditEnfantId(enfant.id);
    setEditPrenom(enfant.prenom);
    setEditNom(enfant.nom);
    setEditDateNaissance((enfant.dateNaissance || '').slice(0, 10));
    setEditSexe(enfant.sexe === 'F' ? 'F' : 'M');
    setEditLienParente(lienApi);
    setEditOpen(true);
  };

  const confirmEditDemande = async () => {
    if (!token) return;
    if (!editPrenom.trim() || !editNom.trim() || !editDateNaissance) {
      toast({ title: 'Champs requis', description: 'Prénom, nom et date de naissance sont obligatoires.', variant: 'destructive' });
      return;
    }
    try {
      await apiRequest(`/parent/demandes/${Number(editEnfantId)}`, {
        method: 'PUT',
        token,
        body: JSON.stringify({
          prenom: editPrenom.trim(),
          nom: editNom.trim(),
          date_naissance: editDateNaissance,
          sexe: editSexe,
          lien_parente: editLienParente,
        }),
      });
      await loadAll();
      addHistorique({
        utilisateur: `${parent.prenom} ${parent.nom}`,
        role: 'Parent',
        action: 'Correction inscription',
        details: `A corrigé les informations de ${editPrenom.trim()} ${editNom.trim()} sans changement de rang.`,
        cible: `${editPrenom.trim()} ${editNom.trim()}`,
      });
      setEditOpen(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Correction impossible';
      toast({ title: 'Correction impossible', description: msg, variant: 'destructive' });
      console.error(err);
    }
  };

  const getStatutStyle = (statut: string) => {
    switch (statut) {
      case 'Titulaire': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'Suppléant N1': return 'bg-accent/10 text-accent border-accent/20';
      case 'Suppléant N2': return 'bg-primary/10 text-primary border-primary/20';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const getListeLabel = (liste: string) => {
    switch (liste) {
      case 'principale': return 'Liste Principale';
      case 'attente_n1': return "Liste d'Attente N°1";
      case 'attente_n2': return "Liste d'Attente N°2";
      default: return liste;
    }
  };

  const getListeTabKey = (liste: string) => {
    switch (liste) {
      case 'principale': return 'principale';
      case 'attente_n1': return 'attente_n1';
      case 'attente_n2': return 'attente_n2';
      default: return 'principale';
    }
  };

  const isInFinale = (id: string) => {
    if (!listeFinaleApiPubliee) return false;
    const e = enfants.find((x) => x.id === id);
    return typeof e?.demandeId === 'number' && demandeIdsListeFinaleRetenus.has(e.demandeId);
  };

  const getRangDansListeLocal = (id: string) => {
    const e = enfants.find((x) => x.id === id);
    if (!e) return 0;
    if (typeof e.rangListe === 'number' && e.rangListe > 0) return e.rangListe;
    const did = idDemandePourRang(e);
    if (did < 0) return 0;
    return rangAfficheParListe[e.liste]?.get(did) ?? 0;
  };

  // Validation badge
  const getValidationBadge = (enfant: typeof enfants[0]) => {
    if (enfant.validation === 'validé') return <span className="text-xs font-medium px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200">✅ Informations validées</span>;
    if (enfant.validation === 'refusé') return <span className="text-xs font-medium px-2 py-0.5 rounded-md bg-destructive/10 text-destructive border border-destructive/20">❌ Informations non validées — {enfant.motifRefus}</span>;
    /* Soumise sans refus : plus de badge « attente de validation ». Ancien rendu conservé en commentaire :
    return <span className="text-xs font-medium px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200">⏳ Informations en attente de validation</span>;
    */
    return null;
  };

  // Card click -> open corresponding tab and highlight (enfants déjà sur une liste dans les tableaux transparence)
  const handleCardClick = (enfant: typeof enfants[0]) => {
    if (isNonInscrit(enfant)) return;
    setActiveTab(getListeTabKey(enfant.liste));
    setHighlightedEnfantId(enfant.id);
    setTimeout(() => setHighlightedEnfantId(null), 3000);
  };

  useEffect(() => {
    if (!highlightedEnfantId) return;
    const rowId = `enfant-row-${highlightedEnfantId}`;
    // Après changement d'onglet, attendre le rendu puis cibler la ligne.
    const t = window.setTimeout(() => {
      const rowEl = document.getElementById(rowId);
      if (rowEl) {
        rowEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else {
        tabsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 220);
    return () => window.clearTimeout(t);
  }, [activeTab, highlightedEnfantId]);

  // List data for tabs — aligné sur `rang_dans_liste` (champ `rangListe`) comme côté gestionnaire
  const getListeEnfants = (liste: string) => {
    const subset = allEnfants.filter((e) => e.liste === liste && dansOngletsListeTransparence(e));
    return [...subset].sort((a, b) => {
      const hasA = typeof a.rangListe === 'number';
      const hasB = typeof b.rangListe === 'number';
      if (hasA && hasB && a.rangListe !== b.rangListe) return (a.rangListe as number) - (b.rangListe as number);
      if (hasA && !hasB) return -1;
      if (!hasA && hasB) return 1;
      return compareEnfantsOrdreArrivee(a, b);
    });
  };

  const getStatutBadge = (statut: string) => {
    switch (statut) {
      case 'Titulaire': return 'bg-emerald-50 text-emerald-700';
      case 'Suppléant N1': return 'bg-accent/10 text-accent';
      case 'Suppléant N2': return 'bg-primary/10 text-primary';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const renderListeTable = (liste: string) => {
    const listeEnfants = getListeEnfants(liste);
    const filtered = listeEnfants.filter(e => {
      if (!searchTerm) return true;
      const p = allParents.find(x => x.matricule === e.parentMatricule);
      const s = searchTerm.toLowerCase();
      return e.parentMatricule.toLowerCase().includes(s) || e.nom.toLowerCase().includes(s) || e.prenom.toLowerCase().includes(s) || (p?.nom || '').toLowerCase().includes(s) || (p?.prenom || '').toLowerCase().includes(s);
    });
    const rangMapFiltre = rangAfficheParDemandeIdPourEnfants(filtered);

    return (
      <div className="bg-card rounded-xl shadow-card border border-border">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="font-semibold">Rang</TableHead>
                <TableHead className="font-semibold">Matricule</TableHead>
                <TableHead className="font-semibold">Nom du parent</TableHead>
                <TableHead className="font-semibold">Prénom du parent</TableHead>
                <TableHead className="font-semibold">Service</TableHead>
                <TableHead className="font-semibold">Prénom Enfant</TableHead>
                <TableHead className="font-semibold">Nom Enfant</TableHead>
                <TableHead className="font-semibold">Âge</TableHead>
                <TableHead className="font-semibold">Sexe</TableHead>
                <TableHead className="font-semibold">Statut</TableHead>
                <TableHead className="font-semibold">Inscrit le</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow><TableCell colSpan={11} className="text-center py-8 text-muted-foreground">Aucune inscription</TableCell></TableRow>
              ) : (
                filtered.map(e => {
                  const p = allParents.find(x => x.matricule === e.parentMatricule);
                  const isHighlighted = highlightedEnfantId === e.id;
                  const did = idDemandePourRang(e);
                  const rangAff =
                    typeof e.rangListe === 'number' && e.rangListe > 0
                      ? e.rangListe
                      : did >= 0
                        ? rangMapFiltre.get(did)
                        : undefined;
                  return (
                    <TableRow key={e.id} className={`transition-colors duration-500 ${isHighlighted ? 'bg-accent/20 ring-2 ring-accent ring-inset' : ''}`} id={`enfant-row-${e.id}`}>
                      <TableCell className="font-bold text-foreground">{rangAff ?? '—'}</TableCell>
                      <TableCell className="font-mono tabular-nums text-sm">{e.parentMatricule}</TableCell>
                      <TableCell>{p?.nom || '—'}</TableCell>
                      <TableCell>{p?.prenom || '—'}</TableCell>
                      <TableCell className="text-sm">{p?.service || '—'}</TableCell>
                      <TableCell>{e.prenom}</TableCell>
                      <TableCell className="font-medium">{e.nom}</TableCell>
                      <TableCell>{calculateAge(e.dateNaissance)} ans</TableCell>
                      <TableCell>{e.sexe === 'M' ? 'M' : 'F'}</TableCell>
                      <TableCell><span className={`text-xs font-medium px-2 py-0.5 rounded-md ${getStatutBadge(e.statut)}`}>{e.statut}</span></TableCell>
                      <TableCell className="tabular-nums text-sm text-muted-foreground">{new Date(e.dateInscription).toLocaleDateString('fr-FR')}</TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    );
  };

  const canInscrire = !inscriptionsCloturees && (MAX === null || placesListesParentSaison < MAX);
  const noEnfantCharge = enfants.length === 0;
  /** Parent sans enfant codifié côté RH : liste vide ou uniquement des inscriptions « Autre » (non biologique). */
  const parentQueDesNonBio = enfants.every((e) => e.lienParente === 'Autre');
  const nonBioInscriptionsCount = enfants.filter((e) => e.lienParente === 'Autre').length;
  const nonBioUniqueLimitReached = parentQueDesNonBio && nonBioInscriptionsCount >= 1;
  const afficherInscriptionNonBio = !inscriptionsCloturees && parentQueDesNonBio && !nonBioUniqueLimitReached;

  const prevNonBioCountRef = useRef(nonBioInscriptionsCount);
  useEffect(() => {
    const prev = prevNonBioCountRef.current;
    if (parentQueDesNonBio && prev === 0 && nonBioInscriptionsCount >= 1) {
      toast({
        title: 'Limite atteinte',
        description: 'Vous avez atteint votre unique inscription autorisée pour un enfant non biologique.',
      });
    }
    prevNonBioCountRef.current = nonBioInscriptionsCount;
  }, [parentQueDesNonBio, nonBioInscriptionsCount]);

  if (!hasRequiredPhone) {
    return (
      <div className="w-full max-w-5xl space-y-8 pl-[170px]">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Bienvenue, {parent.prenom} {parent.nom}</h1>
            <p className="text-muted-foreground mt-1">
              Matricule : <span className="font-mono tabular-nums text-foreground">{parent.matricule}</span> — {parent.service}
            </p>
            <p className="text-muted-foreground">Tél : {parent.telephone || '—'}</p>
          </div>
        </motion.div>

        <div className="max-w-xl mx-auto w-full">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-xl shadow-card border border-border p-6 space-y-4">
            <h2 className="text-3xl font-bold text-foreground flex items-center gap-2">
              <Phone className="w-6 h-6 text-accent" />
              Numéro de téléphone obligatoire
            </h2>
            <p className="text-muted-foreground">Vous devez renseigner votre numéro de téléphone avant de pouvoir inscrire vos enfants et faire vos sélections.</p>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Numéro de téléphone</label>
              <Input
                value={phoneInput}
                onChange={(e) => setPhoneInput(e.target.value)}
                placeholder="Ex: 70 00 00 00"
                className="h-11 rounded-lg"
              />
            </div>
            <Button onClick={() => void saveRequiredPhone()} disabled={phoneSaving || !phoneInput.trim()} className="w-full rounded-lg bg-accent text-white hover:bg-accent/90">
              {phoneSaving ? 'Enregistrement...' : 'Enregistrer mon numéro'}
            </Button>
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-5xl space-y-8 pl-[170px]">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Bienvenue, {parent.prenom} {parent.nom}</h1>
          <p className="text-muted-foreground mt-1">
            Matricule : <span className="font-mono tabular-nums text-foreground">{parent.matricule}</span> — {parent.service}
          </p>
          <p className="text-muted-foreground">Tél : {parent.telephone || '—'}</p>
        </div>
        {/* Bouton "Inscrire un enfant" masqué à la demande.
        {canInscrire && (
          <Button onClick={() => setInscrireOpen(true)} className="rounded-lg bg-accent text-white hover:bg-accent/90 gap-2">
            <UserPlus className="w-4 h-4" />
            {noEnfantCharge ? 'Inscrire un enfant (non biologique)' : 'Inscrire un enfant'}
          </Button>
        )}
        */}
      </motion.div>

      {/* Bandeau inscriptions clôturées */}
      {inscriptionsCloturees && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-amber-50 border border-amber-200 rounded-xl p-5 flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
            {allDesistes ? <Lock className="w-6 h-6 text-amber-600" /> : <AlertTriangle className="w-6 h-6 text-amber-600" />}
          </div>
          <div>
            <h3 className="font-semibold text-amber-800">
              {allDesistes ? '🔒 Accès restreint — Aucune action disponible' : '⚠️ Période d\'inscription terminée'}
            </h3>
            <p className="text-sm text-amber-700 mt-1">
              {allDesistes
                ? 'Tous vos enfants ont été désistés et validés par le gestionnaire. Vous ne disposez plus d\'aucune action. Pour toute question, contactez l\'administration.'
                : `Les inscriptions sont clôturées depuis le ${new Date(settings.dateFinInscriptions).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}. Vous ne pouvez plus inscrire de nouveaux enfants ni modifier vos inscriptions. Seule l'action de désistement reste disponible depuis vos cartes ci-dessous.`}
            </p>
          </div>
        </motion.div>
      )}

      {/* Liste finale publiée : enfants effectivement retenus (calcul automatique après clôture) */}
      {enfantsRetenusListeFinale.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-emerald-50 border border-emerald-200 rounded-xl p-5 flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center flex-shrink-0">
            <Award className="w-6 h-6 text-emerald-600" />
          </div>
          <div>
            <h3 className="font-semibold text-emerald-800">🎉 Bonne nouvelle !</h3>
            <p className="text-sm text-emerald-700 mt-1">
              {enfantsRetenusListeFinale.length === 1
                ? `Votre enfant ${enfantsRetenusListeFinale[0].prenom} ${enfantsRetenusListeFinale[0].nom} figure dans la liste finale des retenus pour la Colonie de Vacances 2026.`
                : `Vos enfants ${enfantsRetenusListeFinale.map(e => `${e.prenom} ${e.nom}`).join(' et ')} figurent dans la liste finale des retenus pour la Colonie de Vacances 2026.`}
            </p>
          </div>
        </motion.div>
      )}

      {/* Bloc statistiques parent masqué à la demande.
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'Enfants inscrits', value: enfants.length, max: MAX, icon: Users, color: 'text-primary' },
          { label: 'Places restantes', value: (MAX ?? 0) - enfants.length, max: MAX, icon: UserCheck, color: 'text-emerald-600' },
          { label: 'En liste principale', value: titulaire ? 1 : 0, max: 1, icon: Star, color: 'text-accent' },
        ].map((stat, i) => (
          <motion.div key={stat.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 * i }} className="bg-card rounded-xl shadow-card p-5 border border-border">
            <div className="flex items-center justify-between">
              <stat.icon className={`w-5 h-5 ${stat.color}`} />
              <span className="text-2xl font-bold text-foreground">{stat.value}<span className="text-sm font-normal text-muted-foreground">/{stat.max}</span></span>
            </div>
            <p className="text-sm text-muted-foreground mt-2">{stat.label}</p>
          </motion.div>
        ))}
      </div>
      */}

      {/* Vos inscriptions - Cards with actions */}
      <div className="space-y-4">
        {enfantsMesEligibles.length > 0 && <h2 className="text-lg font-semibold text-foreground">Mes enfants</h2>}
        {demandesParentChargees && noEnfantCharge && (
          <div className="max-w-4xl space-y-4">
            <div className="rounded-xl border border-amber-300/90 bg-amber-50/40 p-5">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-full border border-amber-300/80 bg-amber-50 shrink-0">
                  <AlertTriangle className="h-5 w-5 text-amber-500" />
                </div>
                <div>
                  <p className="text-base font-semibold text-foreground">Cet agent n&apos;a pas d&apos;enfant codifié</p>
                  <p className="mt-1 text-sm text-muted-foreground">Vous pouvez inscrire un enfant en fournissant les documents justificatifs.</p>
                </div>
              </div>
            </div>
            {afficherInscriptionNonBio && (
              <Button onClick={() => setInscrireOpen(true)} variant="outline" className="rounded-lg h-10 px-4 gap-2 text-sm">
                <UserPlus className="w-4 h-4" />
                Inscrire un enfant (non biologique)
              </Button>
            )}
          </div>
        )}
        {capListesTitulaireN1Atteint &&
          enfantsMesEligibles.some((e) => isNonInscrit(e) && e.lienParente !== 'Autre') &&
          !inscriptionsCloturees && (
            <Alert className="max-w-4xl border-amber-200 bg-amber-50/60">
              <AlertTitle>Maximum atteint pour cette saison</AlertTitle>
              <AlertDescription>
                Vous avez atteint le maximum d&apos;enfants autorisé pour la saison sur les rôles Titulaire et
                Suppléant N°1 ({MAX} enfant{MAX != null && MAX > 1 ? 's' : ''}
                {settings.colonieNom ? ` — ${settings.colonieNom}` : ''}).
              </AlertDescription>
            </Alert>
          )}
        {enfantsMesEligibles.length > 0 && (
        <div className="grid gap-4 w-full max-w-4xl">
          {enfantsMesEligiblesOrdreAffichage.map((enfant, i) => (
            <motion.div
              key={enfant.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 + 0.1 * i }}
              className={`w-full rounded-xl border border-border bg-card transition-shadow shadow-card ${
                isNonInscrit(enfant) ? 'cursor-default' : 'cursor-pointer hover:shadow-md'
              } ${actionsTitulaireN1BloqueesPourCarte(enfant) ? 'opacity-60 border-dashed' : ''}`}
              onClick={() => handleCardClick(enfant)}
            >
              <div className="p-4 space-y-2">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <p className="font-semibold text-foreground truncate">{enfant.prenom} {enfant.nom}</p>
                    <span className={`inline-block px-2 py-0.5 rounded-md text-xs font-medium ${
                      (enfant.liste === 'attente_n2' && enfant.lienParente === 'Autre')
                        ? getStatutBadge('Suppléant N2')
                        : ((!hasTitulaire || isNonInscrit(enfant)) ? 'bg-muted text-muted-foreground' : getStatutBadge(enfant.statut))
                    }`}>
                      {(!hasTitulaire || isNonInscrit(enfant))
                        ? (enfant.liste === 'attente_n2' && enfant.lienParente === 'Autre' ? 'Suppléant N2' : 'Non inscrit')
                        : enfant.statut}
                    </span>
                  </div>
                  <div className="flex gap-2 flex-wrap" onClick={e => e.stopPropagation()}>
                    {!inscriptionsCloturees &&
                      enfant.lienParente !== 'Autre' &&
                      !enfant.desistement &&
                      !enfant.rejetDefinitif &&
                      !listeFinaleDefinitiveApi &&
                      enfant.statut !== 'Titulaire' &&
                      !actionsTitulaireN1BloqueesPourCarte(enfant) &&
                      !enfantBiologiqueSuppleantN2Place(enfant) && (
                      <>
                        {(!hasTitulaire || enfant.statut === 'Suppléant N1') && (
                          <Button
                            variant={enfant.statut === 'Suppléant N1' ? 'outline' : 'default'}
                            size="sm"
                            onClick={() => handleSetTitulaire(enfant.id, `${enfant.prenom} ${enfant.nom}`)}
                            className={
                              enfant.statut === 'Suppléant N1'
                                ? 'rounded-lg gap-1 text-xs'
                                : 'rounded-lg gap-1 text-xs !bg-[#f5a623] !border-[#f5a623] !text-white hover:!bg-[#e39a1f]'
                            }
                          >
                            {enfant.statut === 'Suppléant N1' ? <><ArrowUpDown className="w-3 h-3" />Définir titulaire</> : 'Titulaire'}
                          </Button>
                        )}
                        {afficherBoutonSuppleantN1PourCarte(enfant) && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => { void setAsSuppleantN1(enfant.id); }}
                            className="rounded-lg gap-1 text-xs !bg-transparent hover:!bg-transparent !text-foreground hover:!text-foreground"
                          >
                            Suppléant N1
                          </Button>
                        )}
                        {MAX != null && MAX >= 3 && enfant.sansAttributionListe === true && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => { void setAsSuppleantN2(enfant.id); }}
                            className="rounded-lg gap-1 text-xs !bg-transparent hover:!bg-transparent !text-foreground hover:!text-foreground"
                          >
                            Suppléant N2
                          </Button>
                        )}
                      </>
                    )}
                    {((
                      enfant.statut === 'Titulaire' ||
                      (hasTitulaire && hasSuppleantN1 && enfant.statut === 'Suppléant N1') ||
                      (enfant.lienParente === 'Autre' && enfant.liste === 'attente_n2') ||
                      (enfant.liste === 'attente_n2' &&
                        enfant.lienParente !== 'Autre' &&
                        !isNonInscrit(enfant))
                    ) && !enfant.desistement && enfant.validation !== 'refusé' && !enfant.rejetDefinitif && !listeFinaleDefinitiveApi) && (
                      <Button variant="outline" size="sm" onClick={() => handleDesistement(enfant.id, `${enfant.prenom} ${enfant.nom}`)} className="rounded-lg gap-1 text-xs text-destructive border-destructive/30 hover:bg-destructive/10">
                        <HandMetal className="w-3 h-3" />Désistement
                      </Button>
                    )}
                    {enfant.desistement === 'demandé' && !enfant.rejetDefinitif && !listeFinaleDefinitiveApi && (
                      <Button variant="outline" size="sm" onClick={() => handleAnnulerDesistement(enfant.id)} className="rounded-lg gap-1 text-xs text-amber-700 border-amber-300 hover:bg-amber-50">
                        <XCircle className="w-3 h-3" />Annuler désistement
                      </Button>
                    )}
                    {!inscriptionsCloturees && enfant.desistement === 'validé' && !enfant.rejetDefinitif && !listeFinaleDefinitiveApi && (
                      <Button variant="outline" size="sm" onClick={() => handleReinscrire(enfant.id, `${enfant.prenom} ${enfant.nom}`)} className="rounded-lg gap-1 text-xs hover:bg-accent hover:text-white hover:border-accent">
                        <RotateCcw className="w-3 h-3" />Réinscrire
                      </Button>
                    )}
                  </div>
                </div>
                {/* Lien de parenté masqué à l'affichage (Père/Mère) à la demande.
                <p className="text-sm text-muted-foreground">{calculateAge(enfant.dateNaissance)} ans — {enfant.sexe === 'M' ? 'Garçon' : 'Fille'} — {enfant.lienParente}</p>
                */}
                <p className="text-sm text-muted-foreground">
                  Né(e) le {new Date(enfant.dateNaissance).toLocaleDateString('fr-FR')} — {enfant.sexe === 'M' ? 'Garçon' : 'Fille'}
                  {enfant.lienParente === 'Autre' ? ' — Enfant non biologique' : ''}
                </p>
                  
                  {/*
                  Ancien affichage (le rang était toujours visible, y compris après désistement) :
                  <div className="flex items-center gap-1.5">
                    <Hash className="w-3 h-3 text-muted-foreground" />
                    <span className="text-xs font-medium text-muted-foreground">
                      Rang <strong className="text-foreground">{getRangDansListeLocal(slot.enfant.id)}</strong> — {getListeLabel(slot.enfant.liste)}
                    </span>
                  </div>
                  */}
                  {/* Afficher Rang/Liste après choix parent ; et aussi pour enfant non biologique N2. */}
                  {(enfant.statut === 'Titulaire' || (hasTitulaire && hasSuppleantN1) || (enfant.lienParente === 'Autre' && enfant.liste === 'attente_n2')) &&
                    !isNonInscrit(enfant) &&
                    !(enfant.desistement && enfant.lienParente === 'Autre' && enfant.liste === 'attente_n2') && (
                    <div className="flex items-center gap-1.5">
                      <Hash className="w-3 h-3 text-muted-foreground" />
                      <span className="text-xs font-medium text-muted-foreground">
                        {enfant.desistement ? (
                          getListeLabel(enfant.liste)
                        ) : (
                          <>
                            Rang <strong className="text-foreground">{getRangDansListeLocal(enfant.id)}</strong> — {getListeLabel(enfant.liste)}
                          </>
                        )}
                      </span>
                    </div>
                  )}

                  {enfant.reinscrit && (
                    <div className="flex flex-wrap gap-1.5">
                      <span className="text-xs font-medium px-2 py-0.5 rounded-md bg-accent/10 text-accent border border-accent/20">Réinscrit</span>
                    </div>
                  )}

                  {/* Validation badge (rien si soumise sans refus) */}
                  {getValidationBadge(enfant)}
                  {enfant.rejetDefinitif && (
                    <span className="inline-block px-2 py-0.5 rounded-md text-xs font-semibold bg-destructive/15 text-destructive border border-destructive/25">
                      Refus définitif — aucune action possible
                    </span>
                  )}

                  {/* Désistement badges */}
                  {enfant.desistement === 'demandé' && (
                    <span className="inline-block px-2 py-0.5 rounded-md text-xs font-medium bg-amber-50 text-amber-700">⏳ Désistement en attente</span>
                  )}
                  {enfant.desistement === 'validé' && (
                    <span className="inline-block px-2 py-0.5 rounded-md text-xs font-medium bg-destructive/10 text-destructive">Désisté</span>
                  )}

                  {/* Retenu badge */}
                  {isInFinale(enfant.id) && !enfant.desistement && (
                    <span className="inline-block px-2 py-0.5 rounded-md text-xs font-semibold bg-emerald-100 text-emerald-700 border border-emerald-200 flex items-center gap-1 w-fit">
                      <Award className="w-3 h-3" /> Retenu(e) pour la colonie
                    </span>
                  )}

                  {(enfant.statut === 'Titulaire' || (hasTitulaire && hasSuppleantN1)) && !isNonInscrit(enfant) && (
                    <p className="text-[10px] text-muted-foreground/60 mt-1">Cliquez sur la carte pour voir sa position dans la liste</p>
                  )}
              </div>
            </motion.div>
          ))}
        </div>
        )}
        {afficherInscriptionNonBio && enfantsMesEligibles.length > 0 && (
          <div className="max-w-4xl">
            <Button onClick={() => setInscrireOpen(true)} variant="outline" className="rounded-lg h-10 px-4 gap-2 text-sm">
              <UserPlus className="w-4 h-4" />
              Inscrire un autre enfant (non biologique)
            </Button>
          </div>
        )}
        {nonBioUniqueLimitReached && (
          <Alert className="max-w-4xl border-amber-200 bg-amber-50/60">
            {/* <AlertTitle>Inscription non biologique limitée</AlertTitle> */}
            <AlertDescription>
              Vous avez déjà utilisé votre unique inscription autorisée pour un enfant non biologique.
            </AlertDescription>
          </Alert>
        )}
      </div>

      {/* Tabs : affichés seulement après chargement demandes + transparence (évite flash titre / encart). */}
      {demandesParentChargees && (
      <div ref={tabsRef} className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground">Toutes les inscriptions</h2>
        <div className="bg-accent/5 border border-accent/20 rounded-lg p-3">
          <p className="text-xs text-muted-foreground">
            <strong className="text-accent">ℹ️ Information :</strong> Ces listes sont en consultation uniquement. Elles permettent de vérifier la transparence du processus d'inscription.
          </p>
        </div>

        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Rechercher par matricule, nom..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-9 rounded-lg" />
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full" style={{ gridTemplateColumns: listeFinaleApiPubliee ? 'repeat(4, 1fr)' : 'repeat(3, 1fr)' }}>
            <TabsTrigger value="principale">Liste Principale</TabsTrigger>
            <TabsTrigger value="attente_n1">Liste N°1</TabsTrigger>
            <TabsTrigger value="attente_n2">Liste N°2</TabsTrigger>
            {listeFinaleApiPubliee && (
              <TabsTrigger value="liste_finale">Liste Finale</TabsTrigger>
            )}
          </TabsList>
          <TabsContent value="principale">{renderListeTable('principale')}</TabsContent>
          <TabsContent value="attente_n1">{renderListeTable('attente_n1')}</TabsContent>
          <TabsContent value="attente_n2">{renderListeTable('attente_n2')}</TabsContent>
          {listeFinaleApiPubliee && (
            <TabsContent value="liste_finale">
              <ListeFinaleParent apiListeFinale={listeFinaleApiEnfants} apiParents={listeFinaleApiParents} apiListeFinalePubliee />
            </TabsContent>
          )}
        </Tabs>
      </div>
      )}

      {/* Inscription Dialog */}
      <Dialog open={inscrireOpen} onOpenChange={setInscrireOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto rounded-xl">
          <InscrireEnfant
            onClose={() => setInscrireOpen(false)}
            nbEnfantsInscrits={enfants.length}
            nonBiologiqueMode={parentQueDesNonBio}
            onInscriptionSuccess={() => { void loadAll(); }}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-lg rounded-xl">
          <DialogHeader>
            <DialogTitle className="text-foreground">Modifier la demande</DialogTitle>
            <DialogDescription className="pt-2">
              Corrigez les informations si nécessaire. Votre rang et votre position dans la liste restent inchangés.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Prénom</label>
              <Input value={editPrenom} onChange={(e) => setEditPrenom(e.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Nom</label>
              <Input value={editNom} onChange={(e) => setEditNom(e.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Date de naissance</label>
              <Input type="date" value={editDateNaissance} onChange={(e) => setEditDateNaissance(e.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Sexe</label>
              <select
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={editSexe}
                onChange={(e) => setEditSexe(e.target.value === 'F' ? 'F' : 'M')}
              >
                <option value="M">Masculin</option>
                <option value="F">Féminin</option>
              </select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <label className="text-sm font-medium text-foreground">Lien de parenté</label>
              <select
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={editLienParente}
                onChange={(e) => setEditLienParente((e.target.value as LienParenteApi) || 'AUTRE')}
              >
                <option value="PERE">Père</option>
                <option value="MERE">Mère</option>
                <option value="TUTEUR_LEGAL">Tuteur légal</option>
                <option value="AUTRE">Autre</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)} className="rounded-lg">Annuler</Button>
            <Button onClick={confirmEditDemande} className="rounded-lg bg-accent text-white hover:bg-accent/90">Enregistrer la correction</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Titulaire */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-md rounded-xl">
          <DialogHeader>
            <DialogTitle className="text-foreground">Changer l'enfant titulaire</DialogTitle>
            <DialogDescription className="pt-2">Êtes-vous sûr de vouloir définir <strong>{selectedName}</strong> comme enfant titulaire ?</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} className="rounded-lg">Annuler</Button>
            <Button onClick={confirmChange} className="rounded-lg bg-accent text-white hover:bg-accent/90">Confirmer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Désistement */}
      <Dialog open={desistementOpen} onOpenChange={setDesistementOpen}>
        <DialogContent className="sm:max-w-lg rounded-xl overflow-hidden">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 shrink-0 rounded-xl bg-destructive/10 flex items-center justify-center"><AlertTriangle className="w-5 h-5 text-destructive" /></div>
              <DialogTitle className="text-foreground">Confirmer le désistement</DialogTitle>
            </div>
            <DialogDescription asChild>
              <div className="pt-2 space-y-3 text-sm text-muted-foreground">
                <p>Vous êtes sur le point de demander le désistement de <strong className="text-foreground">{desistementName}</strong>.</p>
                <p>Cela signifie que vous ne souhaitez plus que cet enfant participe à la Colonie de Vacances 2026. Cette demande sera envoyée à l'administration pour validation.</p>
                <p>Vous pourrez annuler cette demande tant que le gestionnaire ne l'a pas encore validée.</p>
                {isTitulaireDesistement && enfantN1 && !inscriptionsCloturees && (
                  <p className="text-foreground font-medium">
                    💡 Avant de confirmer, souhaitez-vous définir <strong>{enfantN1.prenom} {enfantN1.nom}</strong> (actuellement Suppléant N1) comme nouveau Titulaire ? Cliquez sur le bouton ci-dessous pour effectuer ce changement avant le désistement.
                  </p>
                )}
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col sm:flex-row gap-2 pt-2">
            <Button variant="outline" onClick={() => setDesistementOpen(false)} className="rounded-lg">Annuler</Button>
            {isTitulaireDesistement && enfantN1 && !inscriptionsCloturees && (
              <Button onClick={handleSwapAndDesist} variant="outline" className="rounded-lg gap-1 text-accent border-accent/30 hover:bg-accent/10 whitespace-normal text-left">
                <ArrowUpDown className="w-3 h-3 shrink-0" />Promouvoir {enfantN1.prenom} titulaire
              </Button>
            )}
            <Button onClick={confirmDesistement} className="rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/90 whitespace-nowrap">Confirmer le désistement</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel desist error */}
      <Dialog open={cancelDesistError} onOpenChange={setCancelDesistError}>
        <DialogContent className="sm:max-w-md rounded-xl">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center"><AlertTriangle className="w-5 h-5 text-amber-600" /></div>
              <DialogTitle className="text-foreground">Annulation impossible</DialogTitle>
            </div>
            <DialogDescription className="pt-2">
              Le gestionnaire a déjà validé le désistement de cet enfant. L'annulation n'est plus possible à ce stade.
              <br /><br />Si vous souhaitez remettre votre enfant dans le processus d'inscription, veuillez utiliser le bouton <strong>« Réinscrire »</strong> disponible sur la fiche de cet enfant. L'enfant sera réintégré dans sa liste d'origine en respectant l'ordre d'arrivée.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter><Button onClick={() => setCancelDesistError(false)} className="bg-primary text-primary-foreground rounded-lg">Compris</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Ordre des rôles (titulaire → N1 → N2) */}
      <Dialog open={ordreRolesDialogOpen} onOpenChange={setOrdreRolesDialogOpen}>
        <DialogContent className="sm:max-w-md rounded-xl">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 shrink-0 rounded-xl bg-amber-100 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
              </div>
              <DialogTitle className="text-foreground">Ordre des rôles</DialogTitle>
            </div>
            <DialogDescription className="pt-2 text-sm text-muted-foreground whitespace-pre-wrap">
              {ordreRolesDialogText}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setOrdreRolesDialogOpen(false)} className="rounded-lg bg-primary text-primary-foreground">
              Compris
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Réinscrire */}
      <Dialog open={reinscrireOpen} onOpenChange={setReinscrireOpen}>
        <DialogContent className="sm:max-w-md rounded-xl">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center"><RotateCcw className="w-5 h-5 text-accent" /></div>
              <DialogTitle className="text-foreground">Réinscrire l'enfant</DialogTitle>
            </div>
            <DialogDescription className="pt-2">
              Vous souhaitez réinscrire <strong>{reinscireName}</strong> après son désistement.
              <br /><br /><strong>Important :</strong> L'enfant sera réintégré dans sa liste d'origine mais ne retrouvera pas son ancien rang. Il sera placé en fin de liste en respectant l'ordre d'arrivée (nouvelle date d'inscription).
              <br /><br />La demande devra à nouveau être validée par le gestionnaire.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReinscrireOpen(false)} className="rounded-lg">Annuler</Button>
            <Button variant="outline" onClick={confirmReinscrire} className="rounded-lg hover:bg-accent hover:text-white hover:border-accent">Confirmer la réinscription</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
