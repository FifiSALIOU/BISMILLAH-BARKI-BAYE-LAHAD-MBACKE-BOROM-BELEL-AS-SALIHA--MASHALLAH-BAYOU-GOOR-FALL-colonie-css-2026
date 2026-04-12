import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { FileDown, Search, Filter, Eye, Award, CheckCircle2, HandMetal, AlertTriangle, Sparkles, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/hooks/use-toast';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { exportStyledExcel } from '@/lib/excelExport';
import { apiRequest } from '@/lib/api';
import { listeApiToUi, listeUiToApi, statutLabelFromListeUi } from '@/lib/listeCodes';

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
  /** `rang_dans_liste` API — même logique que `GET /parent/liste-finale`. */
  rangListe: number;
  demandeStatut?: string;
  updatedAt?: string | null;
  desistement?: 'demandé' | 'validé' | null;
  dateDesistement?: string;
  reinscrit?: boolean;
  parentNom?: string;
  parentPrenom?: string;
  parentService?: string;
  parentTelephone?: string;
  parentSite?: string;
};

const priorityListe: Record<Enfant['liste'], number> = {
  principale: 0,
  attente_n1: 1,
  attente_n2: 2,
};

function sortOrdreListeFinale(a: Enfant, b: Enfant): number {
  const pa = priorityListe[a.liste];
  const pb = priorityListe[b.liste];
  if (pa !== pb) return pa - pb;
  const ra = a.rangListe ?? 0;
  const rb = b.rangListe ?? 0;
  if (ra !== rb) return ra - rb;
  return a.demandeId - b.demandeId;
}

const calculateAge = (dateNaissance: string): number => {
  const birth = new Date(dateNaissance);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
};

/** Liste finale : calculée uniquement après la fin de la journée de date de clôture. */
function areInscriptionsClosed(cfg: { dateFinInscriptions?: string | null }): boolean {
  if (!cfg?.dateFinInscriptions) return false;
  const dateFin = new Date(`${cfg.dateFinInscriptions}T23:59:59`);
  return new Date() > dateFin;
}

export default function ListeFinale() {
  const { token } = useAuth();
  const [enfantsRetenus, setEnfantsRetenus] = useState<Enfant[]>([]);
  const [enfantsDesistes, setEnfantsDesistes] = useState<Enfant[]>([]);
  const [settings, setSettings] = useState<any>({ capaciteMax: null, dateFinInscriptions: null });
  const [listeFinaleGeneree, setListeFinaleGeneree] = useState(false);
  const [listeFinaleValideeDefinitive, setListeFinaleValideeDefinitive] = useState(false);
  const [validerDefinitifLoading, setValiderDefinitifLoading] = useState(false);
  const [confirmValidationDefinitiveOpen, setConfirmValidationDefinitiveOpen] = useState(false);
  const [desistementsByDemande, setDesistementsByDemande] = useState<Record<number, number>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [filterSexe, setFilterSexe] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<'retenus' | 'desistes'>('retenus');
  const [detailEnfant, setDetailEnfant] = useState<Enfant | null>(null);
  const [confirmDesistOpen, setConfirmDesistOpen] = useState(false);
  const [desistTarget, setDesistTarget] = useState<Enfant | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [validerDesistLoading, setValiderDesistLoading] = useState(false);

  const capaciteLabel = settings.capaciteMax !== null ? settings.capaciteMax : '∞';
  const isComplete = settings.capaciteMax !== null ? enfantsRetenus.length >= settings.capaciteMax : false;

  useEffect(() => {
    if (!token) return;
    Promise.all([
      apiRequest<any>('/admin/settings', { token }),
      apiRequest<any[]>(`/admin/listes/${listeUiToApi('principale')}/demandes`, { token }),
      apiRequest<any[]>(`/admin/listes/${listeUiToApi('attente_n1')}/demandes`, { token }),
      apiRequest<any[]>(`/admin/listes/${listeUiToApi('attente_n2')}/demandes`, { token }),
      apiRequest<any[]>('/admin/desistements/en-attente', { token }),
      apiRequest<any[]>('/admin/demandes/desistees', { token }),
    ]).then(([cfg, p, n1, n2, desistements, desisteesRows]) => {
      setSettings(cfg);
      const cloture = areInscriptionsClosed(cfg);
      if (!cloture) {
        setEnfantsRetenus([]);
        setEnfantsDesistes([]);
        setListeFinaleGeneree(false);
        setListeFinaleValideeDefinitive(false);
        setDesistementsByDemande({});
        return;
      }
      setListeFinaleGeneree(!!cfg?.listeFinalePretePourValidation);
      setListeFinaleValideeDefinitive(!!cfg?.listeFinaleValideeDefinitive);
      const mapRows = (list: any[]): Enfant[] =>
        list.map((d: any) => {
          const lu = listeApiToUi(d.liste);
          const rang = typeof d.rang === 'number' ? d.rang : 0;
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
          rangListe: rang,
          demandeStatut: d.statut || '',
          updatedAt: d.updated_at ?? null,
          reinscrit: !!d.is_reinscrit,
          parentNom: d.parent_nom,
          parentPrenom: d.parent_prenom,
          parentService: d.parent_service,
          parentTelephone: d.parent_telephone || undefined,
          parentSite: d.parent_site || d.parent_site_code || '',
        };
        });
      const all = [...mapRows(p), ...mapRows(n1), ...mapRows(n2)];
      const eligibles = all.filter(
        (e) => e.demandeStatut !== 'NON_VALIDEE' && e.demandeStatut !== 'DESISTEE',
      );
      const ordered = [...eligibles].sort(sortOrdreListeFinale);
      const cap = cfg?.capaciteMax;
      const retenus = cap == null ? ordered : ordered.slice(0, cap);
      setEnfantsRetenus(retenus);

      const pending: Enfant[] = [];
      for (const x of desistements) {
        const row = all.find((r) => r.demandeId === x.demande_id);
        if (row?.id) {
          pending.push({
            ...row,
            desistement: 'demandé',
            dateDesistement: x.requested_at,
          });
        }
      }
      const desistesValides = mapRows(desisteesRows || []).map((e) => ({
        ...e,
        desistement: 'validé' as const,
        dateDesistement: e.updatedAt || e.dateInscription,
      }));
      setEnfantsDesistes([...desistesValides, ...pending].sort(sortOrdreListeFinale));

      const idx: Record<number, number> = {};
      desistements.forEach((x) => {
        idx[x.demande_id] = x.desistement_id;
      });
      setDesistementsByDemande(idx);
    }).catch(() => undefined);
  }, [token, refreshTick]);

  const now = new Date();
  const dateFin = settings.dateFinInscriptions ? new Date(settings.dateFinInscriptions + 'T23:59:59') : null;
  const inscriptionsCloturees = dateFin ? now > dateFin : false;

  const getStatutBadge = (statut: string) => {
    switch (statut) {
      case 'Titulaire': return 'bg-emerald-50 text-emerald-700';
      case 'Suppléant N1': return 'bg-accent/10 text-accent';
      case 'Suppléant N2': return 'bg-primary/10 text-primary';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const getListeLabel = (liste: string) => {
    switch (liste) {
      case 'principale': return 'Liste Principale';
      case 'attente_n1': return "Liste N°1";
      case 'attente_n2': return "Liste N°2";
      default: return liste;
    }
  };

  const filterList = (list: Enfant[]) => list.filter(e => {
    const p = { nom: e.parentNom };
    const matchSearch = searchTerm === '' ||
      e.parentMatricule.toLowerCase().includes(searchTerm.toLowerCase()) ||
      e.nom.toLowerCase().includes(searchTerm.toLowerCase()) ||
      e.prenom.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p?.nom || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchSexe = filterSexe === 'all' || e.sexe === filterSexe;
    return matchSearch && matchSexe;
  });

  const filteredRetenus = filterList(enfantsRetenus);
  const filteredDesistes = filterList(enfantsDesistes);

  const handleValiderDesistement = async () => {
    if (!desistTarget || validerDesistLoading) return;
    const desistementId = desistementsByDemande[desistTarget.demandeId];
    if (!desistementId) {
      toast({ title: 'Données obsolètes', description: 'Rechargez l’écran.', variant: 'destructive' });
      return;
    }
    setValiderDesistLoading(true);
    const nom = `${desistTarget.prenom} ${desistTarget.nom}`;
    try {
      await apiRequest(`/admin/desistements/${desistementId}/valider`, {
        method: 'POST',
        token,
        body: JSON.stringify({ validated: true }),
      });
      toast({ title: '✅ Désistement validé', description: `${nom} retiré(e) des retenus ; ordre = rang dans chaque liste (P → N1 → N2).` });
      setConfirmDesistOpen(false);
      setDesistTarget(null);
      setRefreshTick((t) => t + 1);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erreur inconnue';
      if (msg.includes('introuvable')) {
        toast({ title: 'Déjà traité', description: 'Actualisation…', variant: 'destructive' });
        setConfirmDesistOpen(false);
        setDesistTarget(null);
        setRefreshTick((t) => t + 1);
      } else {
        toast({ title: 'Échec', description: msg, variant: 'destructive' });
      }
    } finally {
      setValiderDesistLoading(false);
    }
  };

  const handleGenererListe = async () => {
    if (!inscriptionsCloturees || listeFinaleGeneree || listeFinaleValideeDefinitive) return;
    try {
      await apiRequest('/admin/liste-finale/confirmer-generation', { method: 'POST', token });
      setListeFinaleGeneree(true);
      toast({ title: '✅ Liste finale générée', description: 'La liste finale a été enregistrée selon la priorité Principale > N1 > N2. Vous pouvez valider définitivement lorsque vous le souhaitez.' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erreur inconnue';
      toast({ title: 'Échec', description: msg, variant: 'destructive' });
    }
  };

  const handleValiderListeDefinitive = async () => {
    if (!inscriptionsCloturees || listeFinaleValideeDefinitive || validerDefinitifLoading) return;
    setValiderDefinitifLoading(true);
    try {
      await apiRequest('/admin/liste-finale/valider-definitive', { method: 'POST', token });
      setListeFinaleValideeDefinitive(true);
      setConfirmValidationDefinitiveOpen(false);
      toast({
        title: 'Liste finale validée définitivement',
        description: 'Aucune modification des listes ni désistement parent ne sera possible. Les parents voient un message s’ils tentent une action.',
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erreur inconnue';
      toast({ title: 'Échec', description: msg, variant: 'destructive' });
    } finally {
      setValiderDefinitifLoading(false);
    }
  };

  const exportList = (list: Enfant[], filename: string, format: 'csv' | 'pdf', isDesistes = false) => {
    const baseHeaders = ['Rang', 'Matricule', 'Nom Parent', 'Prénom Parent', 'Téléphone', 'Service', 'Agence', 'Nom Enfant', 'Prénom Enfant', 'Âge', 'Sexe', 'Statut', "Liste d'origine"];
    const headers = isDesistes ? [...baseHeaders, 'Date du désistement'] : baseHeaders;
    const rows = list.map((e, i) => {
      const baseRow = [i + 1, e.parentMatricule, e.parentNom || '', e.parentPrenom || '', e.parentTelephone || '', e.parentService || '', e.parentSite || '', e.nom, e.prenom, calculateAge(e.dateNaissance), e.sexe === 'M' ? 'Masculin' : 'Féminin', e.statut, getListeLabel(e.liste)];
      if (isDesistes) {
        baseRow.push(e.dateDesistement ? new Date(e.dateDesistement).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '—');
      }
      return baseRow;
    });

    if (format === 'csv') {
      exportStyledExcel(headers, rows, isDesistes ? 'Enfants Désistés' : 'Liste Finale', `${filename}.xlsx`);
    } else {
      const doc = new jsPDF({ orientation: 'landscape' });
      doc.setFontSize(16);
      doc.text(isDesistes ? 'Liste des enfants désistés' : 'Liste finale des enfants retenus', 14, 15);
      doc.setFontSize(10);
      doc.text(`${list.length} enfant(s)`, 14, 22);
      autoTable(doc, {
        head: [headers],
        body: rows.map(r => r.map(c => String(c))),
        startY: 28,
        styles: { fontSize: 7 },
        headStyles: { fillColor: isDesistes ? [245, 158, 11] : [16, 185, 129] },
      });
      doc.save(`${filename}.pdf`);
    }
  };

  const handleHeaderExport = (format: 'csv' | 'pdf') => {
    if (activeTab === 'desistes') {
      exportList(filteredDesistes, 'enfants_desistes', format, true);
      return;
    }
    exportList(filteredRetenus, 'liste_finale', format);
  };

  const renderTable = (list: Enfant[], showDesistAction: boolean, isDesistes = false) => (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead className="font-semibold w-16">Rang</TableHead>
            <TableHead className="font-semibold">Matricule</TableHead>
            <TableHead className="font-semibold">Nom du parent</TableHead>
            <TableHead className="font-semibold">Prénom du parent</TableHead>
            <TableHead className="font-semibold">Téléphone</TableHead>
            <TableHead className="font-semibold">Service</TableHead>
            <TableHead className="font-semibold">Agence</TableHead>
            <TableHead className="font-semibold">Prénom Enfant</TableHead>
            <TableHead className="font-semibold">Nom Enfant</TableHead>
            <TableHead className="font-semibold">Âge</TableHead>
            <TableHead className="font-semibold">Sexe</TableHead>
            <TableHead className="font-semibold">Statut</TableHead>
            <TableHead className="font-semibold">Liste d'origine</TableHead>
            {isDesistes && <TableHead className="font-semibold">Date du désistement</TableHead>}
            <TableHead className="font-semibold">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {list.length === 0 ? (
            <TableRow><TableCell colSpan={isDesistes ? 15 : 14} className="text-center py-12 text-muted-foreground">Aucun enfant</TableCell></TableRow>
          ) : (
            list.map((e, i) => {
              const p = { nom: e.parentNom, prenom: e.parentPrenom, telephone: e.parentTelephone, service: e.parentService, site: e.parentSite };
              return (
                <TableRow key={e.id} className={e.desistement === 'validé' ? 'opacity-60' : ''}>
                  <TableCell className="font-bold text-foreground text-center">{i + 1}</TableCell>
                  <TableCell className="font-mono tabular-nums text-sm">{e.parentMatricule}</TableCell>
                  <TableCell>{p?.nom || '—'}</TableCell>
                  <TableCell>{p?.prenom || '—'}</TableCell>
                  <TableCell className="text-sm">{p?.telephone || '—'}</TableCell>
                  <TableCell className="text-sm">{p?.service || '—'}</TableCell>
                  <TableCell className="text-sm">{p?.site || '—'}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {e.prenom}
                      {e.reinscrit && <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-primary/10 text-primary">Réinscrit</span>}
                    </div>
                  </TableCell>
                  <TableCell className="font-medium">{e.nom}</TableCell>
                  <TableCell>{calculateAge(e.dateNaissance)} ans</TableCell>
                  <TableCell>{e.sexe === 'M' ? 'M' : 'F'}</TableCell>
                  <TableCell><span className={`text-xs font-medium px-2 py-0.5 rounded-md ${getStatutBadge(e.statut)}`}>{e.statut}</span></TableCell>
                  <TableCell><span className="text-xs font-medium px-2 py-0.5 rounded-md bg-muted text-muted-foreground">{getListeLabel(e.liste)}</span></TableCell>
                  {isDesistes && <TableCell className="text-sm">{e.dateDesistement ? new Date(e.dateDesistement).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'}</TableCell>}
                  <TableCell>
                    <div className="flex gap-1 flex-wrap">
                      {showDesistAction && e.desistement === 'demandé' && (
                        <Button size="sm" onClick={() => { setDesistTarget(e); setConfirmDesistOpen(true); }} className="gap-1 text-xs rounded-lg bg-accent hover:bg-accent/90 text-white h-7 px-2">
                          <CheckCircle2 className="w-3 h-3" />Valider désist.
                        </Button>
                      )}
                      {showDesistAction && e.desistement === 'validé' && (
                        <span className="text-xs font-medium px-2 py-0.5 rounded-md bg-destructive/10 text-destructive">Désisté ✓</span>
                      )}
                      <Button size="sm" variant="outline" onClick={() => setDetailEnfant(e)} className="gap-1 text-xs rounded-lg h-7">
                        <Eye className="w-3 h-3" />Voir détails
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center"><Award className="w-5 h-5 text-emerald-600" /></div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Liste finale des enfants retenus</h1>
            <p className="text-muted-foreground mt-1">
              {inscriptionsCloturees ? (
                <><strong>{enfantsRetenus.length}</strong>/{capaciteLabel} enfant(s) retenu(s) pour la colonie</>
              ) : (
                <>La liste des retenus n&apos;est pas encore établie — elle le sera <strong>automatiquement après la clôture des inscriptions</strong>.</>
              )}
            </p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            onClick={() => void handleGenererListe()}
            disabled={!inscriptionsCloturees || listeFinaleGeneree || listeFinaleValideeDefinitive}
            className="gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50 disabled:pointer-events-none"
          >
              <Sparkles className="w-4 h-4" />Générer la liste finale
          </Button>
          <Button
            type="button"
            onClick={() => setConfirmValidationDefinitiveOpen(true)}
            disabled={!inscriptionsCloturees || listeFinaleValideeDefinitive || validerDefinitifLoading}
            className="gap-2 rounded-lg bg-slate-800 hover:bg-slate-900 text-white disabled:opacity-50 disabled:pointer-events-none"
          >
            <ShieldCheck className="w-4 h-4" />
            {listeFinaleValideeDefinitive ? 'Liste validée définitivement' : 'Validation de la liste finale'}
          </Button>
          <Button onClick={() => handleHeaderExport('csv')} variant="outline" className="gap-2 rounded-lg" disabled={!inscriptionsCloturees}><FileDown className="w-4 h-4" />Export Excel</Button>
          <Button onClick={() => handleHeaderExport('pdf')} variant="outline" className="gap-2 rounded-lg" disabled={!inscriptionsCloturees}><FileDown className="w-4 h-4" />Export PDF</Button>
        </div>
      </motion.div>

      {/* Info about auto-generation */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
        <strong>ℹ️ Liste automatique :</strong> Après la <strong>clôture des inscriptions</strong>, l&apos;ordre est : <strong>Liste Principale</strong> (tous les rangs 1, 2…), puis <strong>Liste N°1</strong>, puis <strong>Liste N°2</strong>, en suivant le <strong>rang dans chaque liste</strong> (comme à l&apos;écran « Gestion des listes »), pas la seule date d&apos;inscription — celle-ci peut changer après transfert ou réinscription. Les désistements validés sont exclus ; les places libres sont comblées selon cet ordre jusqu&apos;à la capacité.
      </motion.div>

      {listeFinaleValideeDefinitive && (
        <div className="bg-slate-100 border border-slate-300 rounded-lg p-3 text-sm text-slate-800">
          <strong>Liste finale figée :</strong> la validation définitive est enregistrée. Les transferts, échanges de rangs, désistements et validations de conformité sont désactivés côté gestionnaire.
        </div>
      )}

      {!inscriptionsCloturees && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
          Aucun enfant n&apos;apparaît ici tant que les inscriptions sont ouvertes. Après la date de fin configurée, la liste des retenus est calculée automatiquement (priorité Principale, puis N°1, puis N°2, dans la limite des places). Vous pouvez <strong>valider définitivement</strong> dès la clôture. Le bouton <strong>Générer la liste finale</strong> est optionnel (confirmation d&apos;étape).
        </div>
      )}

      {/* Progress */}
      {inscriptionsCloturees && settings.capaciteMax !== null && (
        <div className="bg-card rounded-xl border border-border p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-foreground">Taux de remplissage</span>
            <span className="text-sm font-bold text-foreground">{enfantsRetenus.length}/{settings.capaciteMax}</span>
          </div>
          <div className="h-3 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${Math.min((enfantsRetenus.length / settings.capaciteMax) * 100, 100)}%` }} />
          </div>
          {isComplete ? (
            <p className="text-xs font-medium text-emerald-700 mt-2 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
              ✅ La liste finale est complète ({settings.capaciteMax}/{settings.capaciteMax} enfants).
            </p>
          ) : (
            <p className="text-xs text-muted-foreground mt-2">Il reste {settings.capaciteMax - enfantsRetenus.length} place(s) disponible(s).</p>
          )}
        </div>
      )}

      {/* Filters */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Rechercher..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-9 rounded-lg" />
        </div>
        <Select value={filterSexe} onValueChange={setFilterSexe}>
          <SelectTrigger className="w-[140px] rounded-lg"><Filter className="w-3 h-3 mr-2" /><SelectValue placeholder="Sexe" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous</SelectItem>
            <SelectItem value="M">Masculin</SelectItem>
            <SelectItem value="F">Féminin</SelectItem>
          </SelectContent>
        </Select>
      </motion.div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'retenus' | 'desistes')}>
        <TabsList className="rounded-lg">
          <TabsTrigger value="retenus" className="gap-2 rounded-lg"><Award className="w-4 h-4" />Enfants retenus ({enfantsRetenus.length})</TabsTrigger>
          <TabsTrigger value="desistes" className="gap-2 rounded-lg"><AlertTriangle className="w-4 h-4" />Enfants désistés ({enfantsDesistes.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="retenus" className="mt-4">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-xl shadow-card border border-border">
            {renderTable(filteredRetenus, false, false)}
          </motion.div>
        </TabsContent>

        <TabsContent value="desistes" className="mt-4">
          <div className="flex gap-2 mb-4">
            <Button onClick={() => exportList(filteredDesistes, 'enfants_desistes', 'csv', true)} variant="outline" className="gap-2 rounded-lg" disabled={!inscriptionsCloturees}><FileDown className="w-4 h-4" />Export Excel</Button>
            <Button onClick={() => exportList(filteredDesistes, 'enfants_desistes', 'pdf', true)} variant="outline" className="gap-2 rounded-lg" disabled={!inscriptionsCloturees}><FileDown className="w-4 h-4" />Export PDF</Button>
          </div>
          {enfantsDesistes.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
              <p className="text-xs text-amber-800">
                <strong>⚠️ Attention :</strong> Ces enfants étaient dans la liste finale mais leurs parents ont demandé un désistement. Validez le désistement pour retirer l'enfant. La liste se complétera automatiquement avec l'enfant suivant.
              </p>
            </div>
          )}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-xl shadow-card border border-border">
            {renderTable(filteredDesistes, !listeFinaleValideeDefinitive, true)}
          </motion.div>
        </TabsContent>
      </Tabs>

      {/* Detail Dialog */}
      <Dialog open={!!detailEnfant} onOpenChange={() => setDetailEnfant(null)}>
        <DialogContent className="sm:max-w-lg rounded-xl">
          <DialogHeader><DialogTitle className="text-foreground">Détails de l'enfant</DialogTitle></DialogHeader>
          {detailEnfant && (() => {
            const p = { nom: detailEnfant.parentNom, prenom: detailEnfant.parentPrenom, service: detailEnfant.parentService };
            return (
              <div className="space-y-4">
                <div className="flex items-center gap-2 flex-wrap">
                  {detailEnfant.desistement === 'validé' && <span className="text-xs font-semibold px-3 py-1 rounded-full bg-destructive/10 text-destructive">Désistement validé</span>}
                  {detailEnfant.desistement === 'demandé' && <span className="text-xs font-semibold px-3 py-1 rounded-full bg-amber-50 text-amber-700">⏳ Désistement demandé</span>}
                  {!detailEnfant.desistement && <span className="text-xs font-semibold px-3 py-1 rounded-full bg-emerald-50 text-emerald-700">✅ Retenu</span>}
                  {detailEnfant.reinscrit && <span className="text-xs font-semibold px-3 py-1 rounded-full bg-primary/10 text-primary">Réinscrit</span>}
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="space-y-3">
                    <h3 className="font-semibold text-foreground border-b border-border pb-1">Parent</h3>
                    <div><span className="text-muted-foreground">Matricule :</span> <span className="font-mono">{detailEnfant.parentMatricule}</span></div>
                    <div><span className="text-muted-foreground">Nom :</span> {p?.nom}</div>
                    <div><span className="text-muted-foreground">Prénom :</span> {p?.prenom}</div>
                    <div><span className="text-muted-foreground">Service :</span> {p?.service}</div>
                  </div>
                  <div className="space-y-3">
                    <h3 className="font-semibold text-foreground border-b border-border pb-1">Enfant</h3>
                    <div><span className="text-muted-foreground">Nom :</span> {detailEnfant.nom}</div>
                    <div><span className="text-muted-foreground">Prénom :</span> {detailEnfant.prenom}</div>
                    <div><span className="text-muted-foreground">Âge :</span> {calculateAge(detailEnfant.dateNaissance)} ans</div>
                    <div><span className="text-muted-foreground">Sexe :</span> {detailEnfant.sexe === 'M' ? 'Masculin' : 'Féminin'}</div>
                    <div><span className="text-muted-foreground">Lien :</span> {detailEnfant.lienParente}</div>
                    <div><span className="text-muted-foreground">Liste :</span> {getListeLabel(detailEnfant.liste)}</div>
                  </div>
                </div>
                <div className="text-xs text-muted-foreground pt-2 border-t border-border">Inscrit le {new Date(detailEnfant.dateInscription).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Confirmation validation définitive de la liste finale */}
      <Dialog open={confirmValidationDefinitiveOpen} onOpenChange={(open) => !validerDefinitifLoading && setConfirmValidationDefinitiveOpen(open)}>
        <DialogContent className="sm:max-w-lg rounded-xl p-0 gap-0 overflow-hidden border-border shadow-lg">
          <DialogHeader className="px-6 pt-6 pb-2 space-y-0">
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 shrink-0 rounded-xl bg-primary/10 flex items-center justify-center">
                <ShieldCheck className="w-6 h-6 text-primary" />
              </div>
              <div className="flex-1 min-w-0 pt-0.5">
                <DialogTitle className="text-lg font-semibold text-foreground text-left">Validation définitive</DialogTitle>
              </div>
            </div>
          </DialogHeader>
          <div className="px-6 pb-2 space-y-4 text-sm text-muted-foreground">
            <p className="text-foreground/90">
              Vous êtes sur le point de <strong className="text-foreground font-semibold">valider définitivement</strong> la liste finale.
            </p>
            <div className="rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-3">
              <p className="flex items-center gap-2 text-destructive font-semibold text-sm mb-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                Cette action est irréversible :
              </p>
              <ul className="list-disc pl-5 space-y-1.5 text-foreground/85 text-sm">
                <li>Aucune modification ne sera plus possible sur la liste finale</li>
                <li>Les parents pourront consulter la liste finale</li>
                <li>Les désistements ne seront plus possibles par les parents</li>
              </ul>
            </div>
          </div>
          <DialogFooter className="px-6 py-4 bg-muted/30 border-t border-border flex-row justify-end gap-2 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              className="rounded-lg"
              disabled={validerDefinitifLoading}
              onClick={() => setConfirmValidationDefinitiveOpen(false)}
            >
              Annuler
            </Button>
            <Button
              type="button"
              className="rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 min-w-[180px]"
              disabled={validerDefinitifLoading}
              onClick={() => void handleValiderListeDefinitive()}
            >
              {validerDefinitifLoading ? 'Validation…' : 'Valider définitivement'}
            </Button>
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
            <DialogDescription className="pt-2">Confirmez-vous la validation du désistement de <strong>{desistTarget?.prenom} {desistTarget?.nom}</strong> ?<br /><br />Cet enfant sera retiré de la liste finale. La place sera automatiquement attribuée à l'enfant suivant selon l'ordre de priorité (Principale → N1 → N2).</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDesistOpen(false)} disabled={validerDesistLoading} className="rounded-lg">Annuler</Button>
            <Button onClick={() => void handleValiderDesistement()} disabled={validerDesistLoading} className="rounded-lg bg-accent text-white hover:bg-accent/90">
              {validerDesistLoading ? 'Validation…' : 'Valider le désistement'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
