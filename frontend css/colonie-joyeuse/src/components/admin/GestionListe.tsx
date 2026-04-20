import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useInscription } from '@/contexts/InscriptionContext';
import { useAuth } from '@/contexts/AuthContext';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { FileDown, Eye, Search, Filter, CheckCircle2, HandMetal, ThumbsDown, X } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { exportStyledExcel } from '@/lib/excelExport';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/api';
import { listeApiToUi, listeUiToApi, statutLabelFromListeUi, type ListeUi } from '@/lib/listeCodes';

type Enfant = {
  id: string;
  demandeId: number;
  parentMatricule: string;
  prenom: string;
  nom: string;
  dateNaissance: string;
  sexe: 'M' | 'F';
  lienParente: string;
  liste: 'principale' | 'attente_n1' | 'attente_n2';
  statut: 'Titulaire' | 'Suppléant N1' | 'Suppléant N2';
  dateInscription: string;
  /** Horodatage de dernière mise à jour de la demande (ex. réinscription) — pour l’ordre d’arrivée affiché. */
  updatedAt?: string | null;
  validation: 'en_attente' | 'validé' | 'refusé';
  motifRefus?: string;
  desistement?: 'demandé' | 'validé' | null;
  parentNom?: string;
  parentPrenom?: string;
  parentService?: string;
  parentAgence?: string;
  parentEmail?: string;
  parentTelephone?: string;
  rang: number;
  reinscrit?: boolean;
  justificatifNomFichier?: string | null;
  justificatifValide?: boolean | null;
};

const calculateAge = (dateNaissance: string): number => {
  const birth = new Date(dateNaissance);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
};

interface Props {
  type: 'principale' | 'attente_n1' | 'attente_n2';
}

export default function GestionListe({ type }: Props) {
  const { addHistorique, settings } = useInscription();
  const { token } = useAuth();
  const [enfants, setEnfants] = useState<Enfant[]>([]);
  const [desistementsByDemande, setDesistementsByDemande] = useState<Record<number, number>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [filterSexe, setFilterSexe] = useState<string>('all');
  const [filterDesistement, setFilterDesistement] = useState<string>('all');
  const [filterReinscrit, setFilterReinscrit] = useState<string>('all');
  const [detailEnfant, setDetailEnfant] = useState<Enfant | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferTarget, setTransferTarget] = useState<Enfant | null>(null);
  const [transferListe, setTransferListe] = useState<string>('');
  const [confirmDesistOpen, setConfirmDesistOpen] = useState(false);
  const [desistTarget, setDesistTarget] = useState<Enfant | null>(null);
  const [refusOpen, setRefusOpen] = useState(false);
  const [refusTarget, setRefusTarget] = useState<Enfant | null>(null);
  const [motifRefus, setMotifRefus] = useState('');
  /** Liste N°2 — bouton « Refus définitif » : après le refus type « Refuser », enchaîner `refus-definitif` (`rejet_definitif = true`). */
  const [refusEnsuiteDefinitifN2, setRefusEnsuiteDefinitifN2] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewMime, setPreviewMime] = useState('');
  const [previewName, setPreviewName] = useState('');
  const [refreshTick, setRefreshTick] = useState(0);

  const titles: Record<string, string> = {
    principale: 'Liste Principale',
    attente_n1: "Liste d'Attente N°1",
    attente_n2: "Liste d'Attente N°2",
  };

  const dotColors: Record<string, string> = {
    principale: 'bg-emerald-500',
    attente_n1: 'bg-accent',
    attente_n2: 'bg-primary',
  };

  const getStatutBadge = (statut: string) => {
    switch (statut) {
      case 'Titulaire': return 'bg-emerald-50 text-emerald-700';
      case 'Suppléant N1': return 'bg-accent/10 text-accent';
      case 'Suppléant N2': return 'bg-primary/10 text-primary';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  // Transfer only allowed from principale/N1 to N2
  const canTransfer = type === 'principale' || type === 'attente_n1';

  useEffect(() => {
    if (!token) return;
    const code = listeUiToApi(type as ListeUi);
    Promise.all([
      apiRequest<any[]>(`/admin/listes/${code}/demandes`, { token }),
      apiRequest<any[]>('/admin/desistements/en-attente', { token }),
    ]).then(([rows, desistements]) => {
      const mapRows: Enfant[] = rows
        .map((d: any): Enfant => {
        const lu = listeApiToUi(d.liste);
        const apiDemandeStatut = String(d.statut || '');
        const isDesistee = apiDemandeStatut === 'DESISTEE';
        return {
        id: String(d.enfant?.id ?? d.demande_id),
        demandeId: d.demande_id,
        parentMatricule: d.parent_matricule,
        prenom: d.enfant?.prenom || '',
        nom: d.enfant?.nom || '',
        dateNaissance: d.enfant?.date_naissance || '',
        sexe: d.enfant?.sexe === 'F' ? 'F' : 'M',
        lienParente: d.enfant?.lien_parente || '',
        liste: lu,
        statut: statutLabelFromListeUi(lu),
        dateInscription: d.date_inscription,
        updatedAt: d.updated_at ?? null,
        validation:
          apiDemandeStatut === 'NON_VALIDEE'
            ? 'refusé'
            : apiDemandeStatut === 'RETENUE'
              ? 'validé'
              : 'en_attente',
        motifRefus: d.non_validation_reason || undefined,
        desistement: isDesistee
          ? 'validé'
          : desistements.some((x) => x.demande_id === d.demande_id)
            ? 'demandé'
            : null,
        parentNom: d.parent_nom,
        parentPrenom: d.parent_prenom,
        parentService: d.parent_service,
        parentTelephone: d.parent_telephone || undefined,
        parentAgence: d.parent_site || '',
        rang: d.rang || 0,
        reinscrit: !!d.is_reinscrit,
        justificatifNomFichier: d.justificatif_nom_fichier ?? null,
        justificatifValide: d.justificatif_valide ?? null,
      };
        })
        /** Désistements validés : visibles uniquement dans « Demandes désistées », pas dans P / N1 / N2. */
        .filter((e) => e.desistement !== 'validé');
      const idx: Record<number, number> = {};
      desistements.forEach((x) => {
        idx[x.demande_id] = x.desistement_id;
      });
      setDesistementsByDemande(idx);
      setEnfants(mapRows);
    }).catch(() => undefined);
  }, [token, type, refreshTick]);

  const filteredEnfants = enfants.filter(e => {
    const p = { nom: e.parentNom, prenom: e.parentPrenom };
    const matchSearch = searchTerm === '' ||
      e.parentMatricule.toLowerCase().includes(searchTerm.toLowerCase()) ||
      e.nom.toLowerCase().includes(searchTerm.toLowerCase()) ||
      e.prenom.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p?.nom || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p?.prenom || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchSexe = filterSexe === 'all' || e.sexe === filterSexe;
    const matchDesist = filterDesistement === 'all' ||
      (filterDesistement === 'demandé' && e.desistement === 'demandé') ||
      (filterDesistement === 'validé' && e.desistement === 'validé') ||
      (filterDesistement === 'aucun' && !e.desistement) ||
      (filterDesistement === 'reinscrit' && e.reinscrit === true) ||
      (filterDesistement === 'refusé' && e.validation === 'refusé');
    return matchSearch && matchSexe && matchDesist;
  });

  /**
   * Tri et colonne Rang : `rang_dans_liste` (API) — aligné sur le backend après désistement / réinscription.
   * Une demande désistée reste donc à sa place (ex. rang 2 si elle était dernière des actifs avant désistement).
   */
  const { enfantsOrdreArrivee, rangAfficheParDemandeId } = useMemo(() => {
    const sorted = [...filteredEnfants].sort((a, b) => {
      const dr = a.rang - b.rang;
      if (dr !== 0) return dr;
      return a.demandeId - b.demandeId;
    });
    const m = new Map<number, number>();
    sorted.forEach((e) => m.set(e.demandeId, e.rang));
    return { enfantsOrdreArrivee: sorted, rangAfficheParDemandeId: m };
  }, [filteredEnfants]);

  const handleTransfer = async () => {
    if (!transferTarget) return;
    const targetListeUi: ListeUi = type === 'principale' ? 'attente_n1' : 'attente_n2';
    await apiRequest(`/admin/demandes/${transferTarget.demandeId}/transferer`, {
      method: 'POST',
      token,
      body: JSON.stringify({ to_liste_code: listeUiToApi(targetListeUi), reason: 'Transfert administratif' }),
    });
    addHistorique({ utilisateur: 'Gestionnaire', role: 'Admin', action: 'Transfert', details: `A transféré ${transferTarget.prenom} ${transferTarget.nom} vers la Liste d'Attente N°2`, cible: `${transferTarget.prenom} ${transferTarget.nom}` });
    toast({ title: '✅ Demande transférée', description: `${transferTarget.prenom} ${transferTarget.nom} a été transféré(e) vers la Liste d'Attente N°2.` });
    setTransferOpen(false); setTransferTarget(null);
    setRefreshTick((t) => t + 1);
  };

  const handleValiderDesistement = async () => {
    if (!desistTarget) return;
    const desistementId = desistementsByDemande[desistTarget.demandeId];
    if (!desistementId) return;
    await apiRequest(`/admin/desistements/${desistementId}/valider`, {
      method: 'POST',
      token,
      body: JSON.stringify({ validated: true }),
    });
    addHistorique({ utilisateur: 'Gestionnaire', role: 'Admin', action: 'Validation désistement', details: `A validé le désistement de ${desistTarget.prenom} ${desistTarget.nom}`, cible: `${desistTarget.prenom} ${desistTarget.nom}` });
    toast({ title: '✅ Désistement validé', description: `Le désistement de ${desistTarget.prenom} ${desistTarget.nom} a été validé.` });
    setConfirmDesistOpen(false); setDesistTarget(null);
    setRefreshTick((t) => t + 1);
  };

  /*
   * Ancien flux « Approuver » (validation explicite → API selection-finale is_selection_finale: true).
   * Désactivé par commentaire : les infos sont considérées correctes tant que la demande n’est pas refusée ;
   * seul « Refuser » reste proposé. L’API / le statut RETENUE existent toujours pour les données déjà traitées.
   *
   * const handleValider = async (enfant: Enfant) => {
   *   await apiRequest(`/admin/demandes/${enfant.demandeId}/selection-finale`, {
   *     method: 'POST',
   *     token,
   *     body: JSON.stringify({ is_selection_finale: true }),
   *   });
   *   addHistorique({ utilisateur: 'Gestionnaire', role: 'Admin', action: 'Approbation', details: `A approuvé les informations de ${enfant.prenom} ${enfant.nom}`, cible: `${enfant.prenom} ${enfant.nom}` });
   *   toast({ title: '✅ Informations approuvées', description: `Les informations de ${enfant.prenom} ${enfant.nom} ont été validées.` });
   *   setRefreshTick((t) => t + 1);
   * };
   */

  const handleRefuser = async () => {
    if (!token || !refusTarget || !motifRefus.trim()) return;
    const chainDefinitif = refusEnsuiteDefinitifN2;
    const id = refusTarget.demandeId;
    const motif = motifRefus.trim();
    const prenom = refusTarget.prenom;
    const nom = refusTarget.nom;
    try {
      await apiRequest(`/admin/demandes/${id}/selection-finale`, {
        method: 'POST',
        token,
        body: JSON.stringify({ is_selection_finale: false, non_validation_reason: motif }),
      });
      if (chainDefinitif) {
        await apiRequest(`/admin/demandes/${id}/refus-definitif`, { method: 'POST', token });
      }
      addHistorique({
        utilisateur: 'Gestionnaire',
        role: 'Admin',
        action: chainDefinitif ? 'Refus définitif' : 'Refus',
        details: chainDefinitif
          ? `A refusé définitivement la demande de ${prenom} ${nom}. Motif : ${motif}`
          : `A refusé la demande de ${prenom} ${nom}. Motif : ${motif}`,
        cible: `${prenom} ${nom}`,
      });
      toast({
        title: chainDefinitif ? '❌ Refus définitif enregistré' : '❌ Demande refusée',
        description: `${prenom} ${nom} — Motif : ${motif}`,
      });
      setRefusOpen(false);
      setRefusTarget(null);
      setMotifRefus('');
      setRefusEnsuiteDefinitifN2(false);
      setRefreshTick((t) => t + 1);
    } catch {
      toast({
        title: 'Erreur',
        description: chainDefinitif
          ? 'Le refus ou le passage en refus définitif a échoué. Vérifiez l’état de la demande.'
          : 'Le refus n’a pas pu être enregistré.',
        variant: 'destructive',
      });
    }
  };

  const handleVoirJustificatif = (enfant: Enfant) => {
    if (!token) return;
    const base = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';
    fetch(`${base}/admin/demandes/${enfant.demandeId}/justificatif`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        if (!res.ok) throw new Error('Impossible de télécharger le justificatif.');
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setPreviewUrl(url);
        setPreviewMime(blob.type || '');
        setPreviewName(enfant.justificatifNomFichier || 'justificatif');
        setPreviewOpen(true);
      })
      .catch((err) => {
        toast({ title: 'Erreur', description: err instanceof Error ? err.message : 'Erreur justificatif', variant: 'destructive' });
      });
  };

  useEffect(() => {
    if (!previewOpen && previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      setPreviewMime('');
      setPreviewName('');
    }
  }, [previewOpen, previewUrl]);

  const handleValiderJustificatif = async (enfant: Enfant) => {
    if (!token) return;
    await apiRequest(`/admin/demandes/${enfant.demandeId}/valider-justificatif`, {
      method: 'POST',
      token,
    });
    toast({ title: '✅ Justificatif validé' });
    setRefreshTick((t) => t + 1);
  };

  const generateCSV = () => {
    const headers = ['Rang', 'Matricule', 'Nom Parent', 'Prénom Parent', 'Service', 'Agence', 'Nom Enfant', 'Prénom Enfant', 'Âge', 'Sexe', 'Statut', 'Informations', 'Désistement'];
    const rows = enfantsOrdreArrivee.map((e) => {
      return [e.rang, e.parentMatricule, e.parentNom || '', e.parentPrenom || '', e.parentService || '', e.parentAgence || '', e.nom, e.prenom, `${calculateAge(e.dateNaissance)} ans`, e.sexe === 'M' ? 'Masculin' : 'Féminin', e.statut, e.validation || 'en_attente', e.desistement || 'Aucun'];
    });
    return { headers, rows };
  };

  /** Export PDF / Excel : sans « Informations » ni « Désistement » (tableau à l’écran inchangé). */
  const dataForPdfExcelExport = () => {
    const { headers, rows } = generateCSV();
    return {
      headers: headers.slice(0, -2),
      rows: rows.map((r) => r.slice(0, -2)),
    };
  };

  const exportExcel = () => {
    const { headers, rows } = dataForPdfExcelExport();
    exportStyledExcel(headers, rows, type, `${type}.xlsx`);
  };

  const exportPDF = () => {
    const { headers, rows } = dataForPdfExcelExport();
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.setFontSize(16);
    doc.text(titles[type], 14, 15);
    doc.setFontSize(10);
    doc.text(`Total : ${enfantsOrdreArrivee.length} enfant(s)`, 14, 22);
    autoTable(doc, {
      head: [headers],
      body: rows.map((r) => r.map((c) => String(c))),
      startY: 28,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [59, 130, 246] },
    });
    doc.save(`${type}.pdf`);
  };

  const showFullDetail = type === 'attente_n2' && !!detailEnfant;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {!showFullDetail && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <span className={`w-3 h-3 rounded-full ${dotColors[type]}`} />
            <div>
              <h1 className="text-2xl font-bold text-foreground">{titles[type]}</h1>
              <p className="text-muted-foreground mt-1"><strong>{enfants.length}</strong> enfant(s) — classés par rang dans la liste</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={exportExcel} variant="outline" className="gap-2 rounded-lg"><FileDown className="w-4 h-4" />Export Excel</Button>
            <Button onClick={exportPDF} variant="outline" className="gap-2 rounded-lg"><FileDown className="w-4 h-4" />Export PDF</Button>
          </div>
        </motion.div>
      )}

      {!showFullDetail && (
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Rechercher par matricule, nom..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-9 rounded-lg" />
        </div>
        <Select value={filterSexe} onValueChange={setFilterSexe}>
          <SelectTrigger className="w-[140px] rounded-lg"><Filter className="w-3 h-3 mr-2" /><SelectValue placeholder="Sexe" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous</SelectItem>
            <SelectItem value="M">Masculin</SelectItem>
            <SelectItem value="F">Féminin</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterDesistement} onValueChange={setFilterDesistement}>
          <SelectTrigger className="w-[180px] rounded-lg"><Filter className="w-3 h-3 mr-2" /><SelectValue placeholder="Désistement" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous</SelectItem>
            {/* Options masquées (demande métier) — logique de filtrage inchangée côté code.
            <SelectItem value="aucun">Sans désistement</SelectItem>
            <SelectItem value="demandé">Désistement demandé</SelectItem>
            <SelectItem value="validé">Désistement validé</SelectItem>
            <SelectItem value="refusé">Enfants refusés</SelectItem>
            */}
            <SelectItem value="reinscrit">Enfant réinscrit</SelectItem>
          </SelectContent>
        </Select>
      </motion.div>
      )}

      {!showFullDetail && (
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-card rounded-xl shadow-card border border-border">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="font-semibold w-16">Rang</TableHead>
                <TableHead className="font-semibold">Matricule</TableHead>
                <TableHead className="font-semibold">Nom du parent</TableHead>
                <TableHead className="font-semibold">Prénom du parent</TableHead>
                <TableHead className="font-semibold">Service</TableHead>
                <TableHead className="font-semibold">Agence</TableHead>
                <TableHead className="font-semibold">Prénom Enfant</TableHead>
                <TableHead className="font-semibold">Nom Enfant</TableHead>
                <TableHead className="font-semibold">Âge</TableHead>
                <TableHead className="font-semibold">Sexe</TableHead>
                <TableHead className="font-semibold">Statut</TableHead>
                {type === 'attente_n2' && (
                  <TableHead className="font-semibold">Informations</TableHead>
                )}
                <TableHead className="font-semibold">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {enfantsOrdreArrivee.length === 0 ? (
                <TableRow><TableCell colSpan={type === 'attente_n2' ? 13 : 12} className="text-center py-12 text-muted-foreground">Aucun enfant dans cette liste</TableCell></TableRow>
              ) : (
                enfantsOrdreArrivee.map((e) => {
                  const p = { nom: e.parentNom, prenom: e.parentPrenom, service: e.parentService, email: e.parentEmail, telephone: e.parentTelephone };
                  const validation = e.validation || 'en_attente';
                  return (
                    <TableRow
                      key={e.id}
                      className={`${e.desistement === 'validé' ? 'opacity-50' : ''} ${type === 'attente_n2' ? 'cursor-pointer hover:bg-muted/30' : ''}`}
                      onClick={() => {
                        if (type === 'attente_n2') setDetailEnfant(e);
                      }}
                    >
                      <TableCell className="font-bold text-foreground text-center">{e.rang}</TableCell>
                      <TableCell className="font-mono tabular-nums text-sm">{e.parentMatricule}</TableCell>
                      <TableCell>{p?.nom || '—'}</TableCell>
                      <TableCell>{p?.prenom || '—'}</TableCell>
                      <TableCell className="text-sm">{p?.service || '—'}</TableCell>
                      <TableCell className="text-sm">{e.parentAgence || '—'}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {e.prenom}
                          {e.reinscrit && <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-primary/10 text-primary">Réinscrit</span>}
                        </div>
                      </TableCell>
                      <TableCell className="font-medium">{e.nom}</TableCell>
                      <TableCell>{calculateAge(e.dateNaissance)} ans</TableCell>
                      <TableCell>{e.sexe === 'M' ? 'M' : 'F'}</TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-md ${getStatutBadge(e.statut)}`}>{e.statut}</span>
                          {e.desistement === 'demandé' && <span className="text-xs font-medium px-2 py-0.5 rounded-md bg-amber-50 text-amber-700">⏳ Désistement</span>}
                          {e.desistement === 'validé' && <span className="text-xs font-medium px-2 py-0.5 rounded-md bg-destructive/10 text-destructive">Désisté</span>}
                        </div>
                      </TableCell>
                      {type === 'attente_n2' && (
                        <TableCell>
                          {validation === 'validé' && (
                            <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700">Approuvé</span>
                          )}
                          {validation === 'refusé' && (
                            <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-destructive/10 text-destructive">Refusé</span>
                          )}
                          {validation === 'en_attente' && (
                            <span className="text-xs font-medium px-2 py-0.5 rounded-md bg-muted text-muted-foreground">En attente</span>
                          )}
                        </TableCell>
                      )}
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-2" onClick={(evt) => evt.stopPropagation()}>
                          {/*
                          Ancien bouton « Approuver » (voir handleValider commenté plus haut).
                          {validation === 'en_attente' && !e.desistement && (
                            <Button size="sm" onClick={() => handleValider(e)} className="gap-1 text-xs rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white h-7 px-2">
                              <CheckCircle2 className="w-3 h-3" />Approuver
                            </Button>
                          )}
                          */}
                          {/* Action "Refuser" masquée à la demande.
                          {validation === 'en_attente' && !e.desistement && (
                            <Button size="sm" onClick={() => { setRefusEnsuiteDefinitifN2(false); setRefusTarget(e); setRefusOpen(true); }} className="gap-1 text-xs rounded-lg bg-destructive hover:bg-destructive/90 text-destructive-foreground h-7 px-2">
                              <ThumbsDown className="w-3 h-3" />Refuser
                            </Button>
                          )}
                          */}
                          {e.desistement === 'demandé' && (
                            <Button size="sm" onClick={() => { setDesistTarget(e); setConfirmDesistOpen(true); }} className="gap-1 text-xs rounded-lg bg-accent hover:bg-accent/90 text-white h-7 px-2">
                              <CheckCircle2 className="w-3 h-3" />Valider désist.
                            </Button>
                          )}
                          {type !== 'attente_n2' && (
                            <Button size="sm" variant="outline" onClick={() => setDetailEnfant(e)} className="gap-1 text-xs rounded-lg h-8 px-3">
                              <Eye className="w-3 h-3" />Détails
                            </Button>
                          )}
                          {/* Bouton "Justificatif" masqué à la demande.
                          {type === 'attente_n2' && !!e.justificatifNomFichier && (
                            <Button size="sm" variant="outline" onClick={() => handleVoirJustificatif(e)} className="gap-1 text-xs rounded-lg h-8 px-3">
                              <Eye className="w-3 h-3" />Justificatif
                            </Button>
                          )}
                          */}
                          {type === 'attente_n2' && !!e.justificatifNomFichier && e.justificatifValide == null && (
                            <>
                              <Button size="sm" onClick={() => handleValiderJustificatif(e)} className="gap-1 text-xs rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white h-8 px-3">
                                <CheckCircle2 className="w-3 h-3" />Valider
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => {
                                  setRefusEnsuiteDefinitifN2(true);
                                  setRefusTarget(e);
                                  setRefusOpen(true);
                                }}
                                className="gap-1 text-xs rounded-lg bg-destructive hover:bg-destructive/90 text-destructive-foreground h-8 px-3"
                              >
                                <ThumbsDown className="w-3 h-3" />Refus définitif
                              </Button>
                            </>
                          )}
                          {type === 'attente_n2' && !!e.justificatifNomFichier && e.justificatifValide != null && (
                            <Button size="sm" variant="outline" onClick={() => setDetailEnfant(e)} className="gap-1 text-xs rounded-lg h-8 px-3">
                              <Eye className="w-3 h-3" />Voir détails
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </motion.div>
      )}

      {showFullDetail && detailEnfant && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-xl shadow-card border border-border p-6 space-y-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-foreground">Détails complets de la demande</h2>
              <p className="text-sm text-muted-foreground mt-1">Parent : {detailEnfant.parentPrenom} {detailEnfant.parentNom} — Enfant : {detailEnfant.prenom} {detailEnfant.nom}</p>
            </div>
            <Button variant="outline" onClick={() => setDetailEnfant(null)} className="rounded-lg">
              Fermer
            </Button>
          </div>
          {(() => {
            const p = { nom: detailEnfant.parentNom, prenom: detailEnfant.parentPrenom, service: detailEnfant.parentService, email: detailEnfant.parentEmail, telephone: detailEnfant.parentTelephone };
            return (
              <div className="space-y-4">
                <div className="flex items-center gap-2 flex-wrap">
                  {detailEnfant.validation === 'validé' && <span className="text-xs font-semibold px-3 py-1 rounded-full bg-emerald-50 text-emerald-700">✅ Approuvé</span>}
                  {detailEnfant.validation === 'refusé' && (
                    <div><span className="text-xs font-semibold px-3 py-1 rounded-full bg-destructive/10 text-destructive">❌ Refusé</span>
                    {detailEnfant.motifRefus && <p className="text-xs text-destructive mt-1">Motif : {detailEnfant.motifRefus}</p>}</div>
                  )}
                  {detailEnfant.desistement && <span className={`text-xs font-semibold px-3 py-1 rounded-full ${detailEnfant.desistement === 'validé' ? 'bg-destructive/10 text-destructive' : 'bg-amber-50 text-amber-700'}`}>{detailEnfant.desistement === 'validé' ? '✓ Désistement validé' : '⏳ Désistement en attente'}</span>}
                  {detailEnfant.reinscrit && <span className="text-xs font-semibold px-3 py-1 rounded-full bg-primary/10 text-primary">Réinscrit</span>}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div className="space-y-3">
                    <h3 className="font-semibold text-foreground border-b border-border pb-1">Parent</h3>
                    <div><span className="text-muted-foreground">Matricule :</span> <span className="font-mono">{detailEnfant.parentMatricule}</span></div>
                    <div><span className="text-muted-foreground">Nom :</span> {p?.nom}</div>
                    <div><span className="text-muted-foreground">Prénom :</span> {p?.prenom}</div>
                    <div><span className="text-muted-foreground">Service :</span> {p?.service}</div>
                    <div><span className="text-muted-foreground">Email :</span> {p?.email || '—'}</div>
                    <div><span className="text-muted-foreground">Tél :</span> {p?.telephone || '—'}</div>
                  </div>
                  <div className="space-y-3">
                    <h3 className="font-semibold text-foreground border-b border-border pb-1">Enfant</h3>
                    <div><span className="text-muted-foreground">Nom :</span> {detailEnfant.nom}</div>
                    <div><span className="text-muted-foreground">Prénom :</span> {detailEnfant.prenom}</div>
                    <div><span className="text-muted-foreground">Âge :</span> {calculateAge(detailEnfant.dateNaissance)} ans</div>
                    <div><span className="text-muted-foreground">Sexe :</span> {detailEnfant.sexe === 'M' ? 'Masculin' : 'Féminin'}</div>
                    <div><span className="text-muted-foreground">Lien :</span> {detailEnfant.lienParente}</div>
                    <div><span className="text-muted-foreground">Rang dans la liste :</span> {rangAfficheParDemandeId.get(detailEnfant.demandeId) ?? detailEnfant.rang ?? '—'}</div>
                  </div>
                </div>
                <div className="space-y-2 border-t border-border pt-3">
                  <h3 className="font-semibold text-foreground">Pièce justificative</h3>
                  {detailEnfant.justificatifNomFichier ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm text-muted-foreground">Fichier : {detailEnfant.justificatifNomFichier}</span>
                      <Button size="sm" variant="outline" onClick={() => handleVoirJustificatif(detailEnfant)} className="gap-1 text-xs rounded-lg h-8 px-3">
                        <Eye className="w-3 h-3" />Voir la pièce
                      </Button>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Aucune pièce justificative jointe.</p>
                  )}
                </div>
                <div className="text-xs text-muted-foreground pt-2 border-t border-border">Inscrit le {new Date(detailEnfant.dateInscription).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
              </div>
            );
          })()}
        </motion.div>
      )}

      {/* Detail Dialog */}
      <Dialog open={type !== 'attente_n2' && !!detailEnfant} onOpenChange={() => setDetailEnfant(null)}>
        <DialogContent className="sm:max-w-lg rounded-xl">
          <DialogHeader><DialogTitle className="text-foreground">Détails de la demande</DialogTitle></DialogHeader>
          {detailEnfant && (() => {
            const p = { nom: detailEnfant.parentNom, prenom: detailEnfant.parentPrenom, service: detailEnfant.parentService, email: detailEnfant.parentEmail, telephone: detailEnfant.parentTelephone };
            return (
              <div className="space-y-4">
                <div className="flex items-center gap-2 flex-wrap">
                  {detailEnfant.validation === 'validé' && <span className="text-xs font-semibold px-3 py-1 rounded-full bg-emerald-50 text-emerald-700">✅ Approuvé</span>}
                  {detailEnfant.validation === 'refusé' && (
                    <div><span className="text-xs font-semibold px-3 py-1 rounded-full bg-destructive/10 text-destructive">❌ Refusé</span>
                    {detailEnfant.motifRefus && <p className="text-xs text-destructive mt-1">Motif : {detailEnfant.motifRefus}</p>}</div>
                  )}
                  {detailEnfant.desistement && <span className={`text-xs font-semibold px-3 py-1 rounded-full ${detailEnfant.desistement === 'validé' ? 'bg-destructive/10 text-destructive' : 'bg-amber-50 text-amber-700'}`}>{detailEnfant.desistement === 'validé' ? '✓ Désistement validé' : '⏳ Désistement en attente'}</span>}
                  {detailEnfant.reinscrit && <span className="text-xs font-semibold px-3 py-1 rounded-full bg-primary/10 text-primary">Réinscrit</span>}
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="space-y-3">
                    <h3 className="font-semibold text-foreground border-b border-border pb-1">Parent</h3>
                    <div><span className="text-muted-foreground">Matricule :</span> <span className="font-mono">{detailEnfant.parentMatricule}</span></div>
                    <div><span className="text-muted-foreground">Nom :</span> {p?.nom}</div>
                    <div><span className="text-muted-foreground">Prénom :</span> {p?.prenom}</div>
                    <div><span className="text-muted-foreground">Service :</span> {p?.service}</div>
                    <div><span className="text-muted-foreground">Email :</span> {p?.email || '—'}</div>
                    <div><span className="text-muted-foreground">Tél :</span> {p?.telephone || '—'}</div>
                  </div>
                  <div className="space-y-3">
                    <h3 className="font-semibold text-foreground border-b border-border pb-1">Enfant</h3>
                    <div><span className="text-muted-foreground">Nom :</span> {detailEnfant.nom}</div>
                    <div><span className="text-muted-foreground">Prénom :</span> {detailEnfant.prenom}</div>
                    <div><span className="text-muted-foreground">Âge :</span> {calculateAge(detailEnfant.dateNaissance)} ans</div>
                    <div><span className="text-muted-foreground">Sexe :</span> {detailEnfant.sexe === 'M' ? 'Masculin' : 'Féminin'}</div>
                    <div><span className="text-muted-foreground">Lien :</span> {detailEnfant.lienParente}</div>
                    <div><span className="text-muted-foreground">Rang dans la liste :</span> {rangAfficheParDemandeId.get(detailEnfant.demandeId) ?? detailEnfant.rang ?? '—'}</div>
                  </div>
                </div>
                <div className="space-y-2 border-t border-border pt-3">
                  <h3 className="font-semibold text-foreground">Pièce justificative</h3>
                  {detailEnfant.justificatifNomFichier ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm text-muted-foreground">Fichier : {detailEnfant.justificatifNomFichier}</span>
                      <Button size="sm" variant="outline" onClick={() => handleVoirJustificatif(detailEnfant)} className="gap-1 text-xs rounded-lg h-8 px-3">
                        <Eye className="w-3 h-3" />Voir la pièce
                      </Button>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Aucune pièce justificative jointe.</p>
                  )}
                </div>
                <div className="text-xs text-muted-foreground pt-2 border-t border-border">Inscrit le {new Date(detailEnfant.dateInscription).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Transfer Dialog - always to N2 */}
      <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
        <DialogContent className="sm:max-w-md rounded-xl">
          <DialogHeader>
            <DialogTitle className="text-foreground">Transférer vers la Liste d'Attente N°2</DialogTitle>
            <DialogDescription>Vous allez transférer <strong>{transferTarget?.prenom} {transferTarget?.nom}</strong> vers la Liste d'Attente N°2.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransferOpen(false)} className="rounded-lg">Annuler</Button>
            <Button onClick={handleTransfer} className="rounded-lg bg-primary text-primary-foreground">Transférer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Désistement */}
      <Dialog open={confirmDesistOpen} onOpenChange={setConfirmDesistOpen}>
        <DialogContent className="sm:max-w-md rounded-xl">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center"><HandMetal className="w-5 h-5 text-amber-600" /></div>
              <DialogTitle className="text-foreground">Valider le désistement</DialogTitle>
            </div>
            <DialogDescription className="pt-2">Confirmez-vous la validation du désistement de <strong>{desistTarget?.prenom} {desistTarget?.nom}</strong> ?<br /><br />Cet enfant sera retiré de la liste finale des enfants retenus.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDesistOpen(false)} className="rounded-lg">Annuler</Button>
            <Button onClick={handleValiderDesistement} className="rounded-lg bg-accent text-white hover:bg-accent/90">Valider le désistement</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Refus Dialog */}
      <Dialog
        open={refusOpen}
        onOpenChange={(o) => {
          setRefusOpen(o);
          if (!o) {
            setMotifRefus('');
            setRefusEnsuiteDefinitifN2(false);
          }
        }}
      >
        <DialogContent className="sm:max-w-md rounded-xl">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-destructive/10 flex items-center justify-center"><ThumbsDown className="w-5 h-5 text-destructive" /></div>
              <DialogTitle className="text-foreground">Refuser la demande</DialogTitle>
            </div>
            <DialogDescription className="pt-2">Vous êtes sur le point de refuser définitivement la demande de <strong>{refusTarget?.prenom} {refusTarget?.nom}</strong>. Veuillez indiquer le motif du refus.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Motif du refus *</Label>
            <Textarea value={motifRefus} onChange={e => setMotifRefus(e.target.value)} placeholder="Indiquez le motif du refus..." className="rounded-lg min-h-[80px]" />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setRefusOpen(false);
                setMotifRefus('');
                setRefusEnsuiteDefinitifN2(false);
              }}
              className="rounded-lg"
            >
              Annuler
            </Button>
            <Button onClick={handleRefuser} disabled={!motifRefus.trim()} className="rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/90">Refuser</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="sm:max-w-4xl rounded-xl p-0 overflow-hidden">
          <div className="relative bg-card">
            <button
              type="button"
              onClick={() => setPreviewOpen(false)}
              className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background hover:bg-muted"
              aria-label="Fermer l'aperçu"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="px-5 py-4 border-b border-border">
              <DialogTitle className="text-base text-foreground">Pièce justificative</DialogTitle>
              <DialogDescription className="pt-1">{previewName}</DialogDescription>
            </div>
            <div className="p-4 bg-muted/20">
              {previewUrl && previewMime.startsWith('image/') ? (
                <img src={previewUrl} alt={previewName} className="max-h-[70vh] w-full object-contain rounded-md bg-background" />
              ) : previewUrl ? (
                <iframe src={previewUrl} title={previewName} className="w-full h-[70vh] rounded-md bg-background" />
              ) : null}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
