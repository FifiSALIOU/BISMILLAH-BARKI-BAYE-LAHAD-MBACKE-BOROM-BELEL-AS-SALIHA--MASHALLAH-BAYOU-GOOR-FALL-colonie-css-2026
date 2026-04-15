import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
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
import { Users, UserCheck, Clock, Star, Award, AlertTriangle, Lock, UserPlus, ArrowUpDown, HandMetal, XCircle, RotateCcw, Hash, Search, User, FilePenLine } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
  const { parent, token } = useAuth();
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

  const loadAll = useCallback(async () => {
    if (!token || !parent) return;
    try {
      const [demandes, trans] = await Promise.all([
        apiRequest<DemandeOutApi[]>('/parent/demandes', { token }),
        apiRequest<TransparenceRowApi[]>('/parent/inscriptions-transparence', { token }),
      ]);
      const rows = trans || [];
      setMesEnfants((demandes || []).map((d) => mapDemandeOutToEnfant(d, parent.matricule)));
      setTransparenceEnfants(rows.map(mapTransparenceRowToEnfant));
      setTransparenceParents(parentsFromTransparence(rows));

      try {
        const finaleRes = await apiRequest<{
          disponible: boolean;
          retenus: ListeFinaleRowApi[];
          liste_finale_definitive?: boolean;
        }>('/parent/liste-finale', { token });
        const fin = finaleRes?.retenus ?? [];
        setListeFinaleApiPubliee(!!finaleRes?.disponible);
        setListeFinaleDefinitiveApi(!!finaleRes?.liste_finale_definitive);
        setListeFinaleApiEnfants(fin.map(mapListeFinaleRowToEnfant));
        setListeFinaleApiParents(parentsFromListeFinale(fin));
      } catch {
        setListeFinaleApiPubliee(false);
        setListeFinaleDefinitiveApi(false);
        setListeFinaleApiEnfants([]);
        setListeFinaleApiParents([]);
      }
    } catch (e) {
      console.error(e);
    }
  }, [token, parent]);

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

  useEffect(() => {
    if (!listeFinaleApiPubliee && activeTab === 'liste_finale') {
      setActiveTab('principale');
    }
  }, [listeFinaleApiPubliee, activeTab]);

  if (!parent) return null;

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
  const allDesistes = inscriptionsCloturees && enfants.length > 0 && enfants.every(e => e.desistement === 'validé');
  const titulaire = enfants.find(e => e.statut === 'Titulaire');
  const suppN1 = enfants.find(e => e.statut === 'Suppléant N1');
  const suppN2 = enfants.find(e => e.statut === 'Suppléant N2');

  /** Identifiants de demandes réellement dans la liste finale publiée (après clôture) — pas la simple validation des infos. */
  const demandeIdsListeFinaleRetenus = useMemo(() => {
    const ids = new Set<number>();
    for (const row of listeFinaleApiEnfants) {
      if (typeof row.demandeId === 'number') ids.add(row.demandeId);
    }
    return ids;
  }, [listeFinaleApiEnfants]);

  const enfantsRetenusListeFinale = listeFinaleApiPubliee
    ? enfants.filter((e) => typeof e.demandeId === 'number' && demandeIdsListeFinaleRetenus.has(e.demandeId))
    : [];

  const enfantN1 = enfants.find(e => e.statut === 'Suppléant N1' && !e.desistement);

  // Action handlers (same as MesEnfants - unchanged behavior)
  const handleSetTitulaire = (id: string, name: string) => { setSelectedId(id); setSelectedName(name); setConfirmOpen(true); };
  const confirmChange = async () => {
    const e = enfants.find((x) => x.id === selectedId);
    /** L’API `/parent/titulaire` attend en priorité l’id de la demande (`DemandeOut.id`). */
    if (!e?.demandeId || !token) {
      setConfirmOpen(false);
      return;
    }
    try {
      await apiRequest('/parent/titulaire', {
        method: 'POST',
        token,
        body: JSON.stringify({ enfant_id_titulaire: e.demandeId }),
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
    if (!enfantN1?.demandeId || !token) return;
    try {
      await apiRequest('/parent/titulaire', {
        method: 'POST',
        token,
        body: JSON.stringify({ enfant_id_titulaire: enfantN1.demandeId }),
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

  // Card click -> open corresponding tab and highlight
  const handleCardClick = (enfant: typeof enfants[0]) => {
    const tabKey = getListeTabKey(enfant.liste);
    setActiveTab(tabKey);
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

  const allSlots = [
    { label: 'Titulaire — Liste Principale', enfant: titulaire, color: 'bg-emerald-500', bgColor: 'bg-emerald-50', textColor: 'text-emerald-700', icon: Star },
    { label: 'Suppléant — Liste N1', enfant: suppN1, color: 'bg-accent', bgColor: 'bg-accent/10', textColor: 'text-accent', icon: Clock },
    { label: 'Suppléant — Liste N2', enfant: suppN2, color: 'bg-orange-500', bgColor: 'bg-orange-50', textColor: 'text-orange-700', icon: Clock },
  ];

  const filledSlots = allSlots.filter(s => s.enfant);
  const emptySlots = allSlots.filter(s => !s.enfant);
  const canInscrire = !inscriptionsCloturees && (MAX === null || enfants.length < MAX);
  const noEnfantCharge = enfants.length === 0;
  const slotsToShow = enfants.length < (MAX ?? Infinity)
    ? [...filledSlots, ...(emptySlots.length > 0 ? [emptySlots[0]] : [])]
    : filledSlots;

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Bienvenue, {parent.prenom} {parent.nom}</h1>
          <p className="text-muted-foreground mt-1">
            Matricule : <span className="font-mono tabular-nums text-foreground">{parent.matricule}</span> — {parent.service}
          </p>
        </div>
        {canInscrire && (
          <Button onClick={() => setInscrireOpen(true)} className="rounded-lg bg-accent text-white hover:bg-accent/90 gap-2">
            <UserPlus className="w-4 h-4" />
            {noEnfantCharge ? 'Inscrire un enfant (non biologique)' : 'Inscrire un enfant'}
          </Button>
        )}
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

      {/* Vos inscriptions - Cards with actions */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground">Vos inscriptions</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {slotsToShow.map((slot, i) => (
            <motion.div
              key={slot.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 + 0.1 * i }}
              className={`rounded-xl border border-border p-5 ${slot.enfant ? 'bg-card cursor-pointer hover:shadow-md transition-shadow' : 'bg-muted/30 border-dashed'} shadow-card`}
              onClick={() => slot.enfant && handleCardClick(slot.enfant)}
            >
              <div className="flex items-center gap-2 mb-3">
                <div className={`w-2 h-2 rounded-full ${slot.enfant ? slot.color : 'bg-muted-foreground/30'}`} />
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{slot.label}</span>
              </div>
              {slot.enfant ? (
                <div className="space-y-2">
                  <p className="font-semibold text-foreground">{slot.enfant.prenom} {slot.enfant.nom}</p>
                  <p className="text-sm text-muted-foreground">{calculateAge(slot.enfant.dateNaissance)} ans — {slot.enfant.sexe === 'M' ? 'Garçon' : 'Fille'} — {slot.enfant.lienParente}</p>
                  
                  {/*
                  Ancien affichage (le rang était toujours visible, y compris après désistement) :
                  <div className="flex items-center gap-1.5">
                    <Hash className="w-3 h-3 text-muted-foreground" />
                    <span className="text-xs font-medium text-muted-foreground">
                      Rang <strong className="text-foreground">{getRangDansListeLocal(slot.enfant.id)}</strong> — {getListeLabel(slot.enfant.liste)}
                    </span>
                  </div>
                  */}
                  {/* Rang et liste : rang masqué à l’affichage seulement si désistement (jusqu’à réinscription : désistement effacé). */}
                  <div className="flex items-center gap-1.5">
                    <Hash className="w-3 h-3 text-muted-foreground" />
                    <span className="text-xs font-medium text-muted-foreground">
                      {slot.enfant.desistement ? (
                        getListeLabel(slot.enfant.liste)
                      ) : (
                        <>
                          Rang <strong className="text-foreground">{getRangDansListeLocal(slot.enfant.id)}</strong> — {getListeLabel(slot.enfant.liste)}
                        </>
                      )}
                    </span>
                  </div>

                  {/* Statut badge */}
                  <div className="flex flex-wrap gap-1.5">
                    <span className={`inline-block px-2 py-0.5 rounded-md text-xs font-medium ${slot.bgColor} ${slot.textColor}`}>{slot.enfant.statut}</span>
                    {slot.enfant.reinscrit && (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-md bg-accent/10 text-accent border border-accent/20">Réinscrit</span>
                    )}
                  </div>

                  {/* Validation badge (rien si soumise sans refus) */}
                  {getValidationBadge(slot.enfant)}
                  {slot.enfant.rejetDefinitif && (
                    <span className="inline-block px-2 py-0.5 rounded-md text-xs font-semibold bg-destructive/15 text-destructive border border-destructive/25">
                      Refus définitif — aucune action possible
                    </span>
                  )}

                  {/* Désistement badges */}
                  {slot.enfant.desistement === 'demandé' && (
                    <span className="inline-block px-2 py-0.5 rounded-md text-xs font-medium bg-amber-50 text-amber-700">⏳ Désistement en attente</span>
                  )}
                  {slot.enfant.desistement === 'validé' && (
                    <span className="inline-block px-2 py-0.5 rounded-md text-xs font-medium bg-destructive/10 text-destructive">Désisté</span>
                  )}

                  {/* Retenu badge */}
                  {isInFinale(slot.enfant.id) && !slot.enfant.desistement && (
                    <span className="inline-block px-2 py-0.5 rounded-md text-xs font-semibold bg-emerald-100 text-emerald-700 border border-emerald-200 flex items-center gap-1 w-fit">
                      <Award className="w-3 h-3" /> Retenu(e) pour la colonie
                    </span>
                  )}

                  {/* Action buttons */}
                  <div className="flex gap-2 mt-2 flex-wrap" onClick={e => e.stopPropagation()}>
                    {!inscriptionsCloturees && !slot.enfant.rejetDefinitif && !slot.enfant.desistement && !listeFinaleDefinitiveApi && (
                      <Button variant="outline" size="sm" onClick={() => handleEditDemande(slot.enfant!)} className="rounded-lg gap-1 text-xs">
                        <FilePenLine className="w-3 h-3" />Modifier
                      </Button>
                    )}
                    {!inscriptionsCloturees && slot.enfant.statut !== 'Titulaire' && slot.enfant.lienParente !== 'Autre' && !slot.enfant.desistement && !slot.enfant.rejetDefinitif && !listeFinaleDefinitiveApi && (
                      <Button variant="outline" size="sm" onClick={() => handleSetTitulaire(slot.enfant!.id, `${slot.enfant!.prenom} ${slot.enfant!.nom}`)} className="rounded-lg gap-1 text-xs">
                        <ArrowUpDown className="w-3 h-3" />Définir titulaire
                      </Button>
                    )}
                    {!slot.enfant.desistement && slot.enfant.validation !== 'refusé' && !slot.enfant.rejetDefinitif && !listeFinaleDefinitiveApi && (
                      <Button variant="outline" size="sm" onClick={() => handleDesistement(slot.enfant!.id, `${slot.enfant!.prenom} ${slot.enfant!.nom}`)} className="rounded-lg gap-1 text-xs text-destructive border-destructive/30 hover:bg-destructive/10">
                        <HandMetal className="w-3 h-3" />Désistement
                      </Button>
                    )}
                    {slot.enfant.desistement === 'demandé' && !slot.enfant.rejetDefinitif && !listeFinaleDefinitiveApi && (
                      <Button variant="outline" size="sm" onClick={() => handleAnnulerDesistement(slot.enfant!.id)} className="rounded-lg gap-1 text-xs text-amber-700 border-amber-300 hover:bg-amber-50">
                        <XCircle className="w-3 h-3" />Annuler désistement
                      </Button>
                    )}
                    {!inscriptionsCloturees && slot.enfant.desistement === 'validé' && !slot.enfant.rejetDefinitif && !listeFinaleDefinitiveApi && (
                      <Button variant="outline" size="sm" onClick={() => handleReinscrire(slot.enfant!.id, `${slot.enfant!.prenom} ${slot.enfant!.nom}`)} className="rounded-lg gap-1 text-xs hover:bg-accent hover:text-white hover:border-accent">
                        <RotateCcw className="w-3 h-3" />Réinscrire
                      </Button>
                    )}
                  </div>

                  <p className="text-[10px] text-muted-foreground/60 mt-1">Cliquez sur la carte pour voir sa position dans la liste</p>
                </div>
              ) : (
                <div className="text-center py-4">
                  <p className="text-sm text-muted-foreground">Place disponible</p>
                  {canInscrire && (
                    <Button variant="outline" size="sm" onClick={() => setInscrireOpen(true)} className="mt-2 rounded-lg gap-1 text-xs">
                      <UserPlus className="w-3 h-3" />Inscrire un enfant
                    </Button>
                  )}
                </div>
              )}
            </motion.div>
          ))}
        </div>
      </div>

      {/* Tabs: Listes + Liste finale */}
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

      {/* Inscription Dialog */}
      <Dialog open={inscrireOpen} onOpenChange={setInscrireOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto rounded-xl">
          <InscrireEnfant
            onClose={() => setInscrireOpen(false)}
            nbEnfantsInscrits={enfants.length}
            nonBiologiqueMode={noEnfantCharge}
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
