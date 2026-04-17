import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FileDown, Loader2, Pencil, Search, Trash2, Upload } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { API_BASE_URL, apiRequest, parseApiError } from '@/lib/api';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

type ImportDetail = { ligne: number; ok: boolean; message: string; matricule?: string };

type ImportResult = {
  ok: boolean;
  lignes_traitees?: number;
  creees?: number;
  erreurs?: number;
  details?: ImportDetail[];
};

type EnfantCharge = {
  id: number;
  parent_id: number;
  parent_matricule: string;
  parent_prenom: string;
  parent_nom: string;
  prenom: string;
  nom: string;
  date_naissance: string;
  sexe: 'M' | 'F';
  lien_parente: 'PERE' | 'MERE' | 'TUTEUR_LEGAL' | 'AUTRE';
  is_titulaire: boolean;
  superadmin_suppression_autorisee: boolean;
};

type EnfantsChargesPage = {
  enfants: EnfantCharge[];
  filter_active: boolean;
  parent_found: boolean | null;
  parent: { id: number; matricule: string; prenom: string; nom: string } | null;
  filter_message: string | null;
};

const CSV_MODELE = `matricule_parent;prenom;nom;date_naissance;sexe;lien_parente
12345;Amadou;SALL;15/03/2015;M;PERE
12345;Fatou;SALL;10/08/2017;F;MERE`;

/**
 * Page super admin : import CSV des enfants codifiés (même principe métier qu’un chargement RH + sync demandes).
 */
export default function ChargementEnfantsSuperAdmin() {
  const { token } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [enfants, setEnfants] = useState<EnfantCharge[]>([]);
  const [loadingEnfants, setLoadingEnfants] = useState(false);
  const [filterMatricule, setFilterMatricule] = useState('');
  const [filterPrenom, setFilterPrenom] = useState('');
  const [filterNom, setFilterNom] = useState('');
  const [listMeta, setListMeta] = useState<Omit<EnfantsChargesPage, 'enfants'> | null>(null);

  const [editOpen, setEditOpen] = useState(false);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editPrenom, setEditPrenom] = useState('');
  const [editNom, setEditNom] = useState('');
  const [editDdn, setEditDdn] = useState('');
  const [editSexe, setEditSexe] = useState<'M' | 'F'>('M');
  const [editLien, setEditLien] = useState<'PERE' | 'MERE' | 'TUTEUR_LEGAL' | 'AUTRE'>('PERE');

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletingEnfant, setDeletingEnfant] = useState<EnfantCharge | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [deleteBlockedOpen, setDeleteBlockedOpen] = useState(false);
  const [deleteBlockedMessage, setDeleteBlockedMessage] = useState('');
  const [listeFinaleVerrouillee, setListeFinaleVerrouillee] = useState(false);

  const openEdit = (e: EnfantCharge) => {
    setEditingId(e.id);
    setEditPrenom(e.prenom);
    setEditNom(e.nom);
    setEditDdn(typeof e.date_naissance === 'string' ? e.date_naissance.slice(0, 10) : String(e.date_naissance).slice(0, 10));
    setEditSexe(e.sexe);
    setEditLien(e.lien_parente);
    setEditOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!token || editingId == null) return;
    const prenom = editPrenom.trim();
    const nom = editNom.trim();
    if (!prenom || !nom || !editDdn) {
      toast({ title: 'Formulaire incomplet', variant: 'destructive' });
      return;
    }
    setEditSubmitting(true);
    try {
      await apiRequest(`/admin/parents/enfants/${editingId}`, {
        method: 'PATCH',
        token,
        body: JSON.stringify({
          prenom,
          nom,
          date_naissance: editDdn,
          sexe: editSexe,
          lien_parente: editLien,
        }),
      });
      toast({ title: 'Enfant mis à jour' });
      setEditOpen(false);
      setEditingId(null);
      await fetchEnfantsList(filterMatricule.trim(), filterPrenom.trim(), filterNom.trim());
    } catch (err) {
      toast({
        title: 'Enregistrement impossible',
        description: err instanceof Error ? err.message : 'Erreur',
        variant: 'destructive',
      });
    } finally {
      setEditSubmitting(false);
    }
  };

  const refreshListeFinaleLock = useCallback(async () => {
    if (!token) return;
    try {
      const s = await apiRequest<Record<string, unknown>>('/admin/settings', { token });
      setListeFinaleVerrouillee(!!s.listeFinaleValideeDefinitive);
    } catch {
      /* silencieux : le serveur appliquera la même règle au DELETE */
    }
  }, [token]);

  const openDelete = (e: EnfantCharge) => {
    if (listeFinaleVerrouillee) {
      setDeleteBlockedMessage(
        "Impossible pour toute information veuillez contacter l'administrateur",
      );
      setDeleteBlockedOpen(true);
      return;
    }
    if (e.superadmin_suppression_autorisee === false) {
      setDeleteBlockedMessage(
        'Suppression impossible : le parent a déjà une inscription positionnée sur une liste ' +
          '(définition titulaire / suppléants ou parcours d’inscription standard). ' +
          'Aucune suppression n’est autorisée tant que ce parent est engagé dans ce flux.',
      );
      setDeleteBlockedOpen(true);
      return;
    }
    setDeletingEnfant(e);
    setDeleteOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!token || !deletingEnfant) return;
    setDeleteSubmitting(true);
    try {
      await apiRequest(`/admin/parents/enfants/${deletingEnfant.id}`, { method: 'DELETE', token });
      toast({ title: 'Enfant supprimé' });
      setDeleteOpen(false);
      setDeletingEnfant(null);
      await fetchEnfantsList(filterMatricule.trim(), filterPrenom.trim(), filterNom.trim());
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erreur';
      if (
        msg.includes('Impossible pour toute information') ||
        msg.includes('Suppression impossible')
      ) {
        setDeleteBlockedMessage(msg);
        setDeleteBlockedOpen(true);
        setDeleteOpen(false);
        setDeletingEnfant(null);
      } else {
        toast({
          title: 'Suppression impossible',
          description: msg,
          variant: 'destructive',
        });
      }
    } finally {
      setDeleteSubmitting(false);
    }
  };

  const fetchEnfantsList = useCallback(
    async (m: string, p: string, n: string) => {
      if (!token) return;
      setLoadingEnfants(true);
      try {
        const params = new URLSearchParams();
        if (m) params.set('matricule', m);
        if (p) params.set('parent_prenom', p);
        if (n) params.set('parent_nom', n);
        const qs = params.toString();
        const res = await fetch(`${API_BASE_URL}/admin/parents/enfants${qs ? `?${qs}` : ''}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const text = await res.text();
        const data = (text ? JSON.parse(text) : null) as EnfantsChargesPage | null;
        if (!res.ok) {
          let msg = 'Impossible de charger la liste des enfants';
          try {
            msg = parseApiError(JSON.parse(text));
          } catch {
            /* ignore */
          }
          toast({ title: 'Erreur', description: msg, variant: 'destructive' });
          return;
        }
        if (data && Array.isArray(data.enfants)) {
          setEnfants(data.enfants);
          setListMeta({
            filter_active: data.filter_active,
            parent_found: data.parent_found,
            parent: data.parent,
            filter_message: data.filter_message,
          });
        } else {
          setEnfants([]);
          setListMeta(null);
        }
      } catch (e) {
        toast({
          title: 'Erreur',
          description: e instanceof Error ? e.message : 'Impossible de charger la liste des enfants',
          variant: 'destructive',
        });
      } finally {
        setLoadingEnfants(false);
      }
    },
    [token],
  );

  const loadEnfants = () => {
    void refreshListeFinaleLock();
    void fetchEnfantsList(filterMatricule.trim(), filterPrenom.trim(), filterNom.trim());
  };

  const clearFiltersAndReload = () => {
    setFilterMatricule('');
    setFilterPrenom('');
    setFilterNom('');
    void fetchEnfantsList('', '', '');
  };

  const applyFilters = () => {
    const m = filterMatricule.trim();
    const p = filterPrenom.trim();
    const n = filterNom.trim();
    const partialName = (p || n) && !(p && n);
    if (partialName && !m) {
      toast({
        title: 'Filtre incomplet',
        description: 'Renseignez le matricule, ou bien le prénom et le nom du parent ensemble.',
        variant: 'destructive',
      });
      return;
    }
    if (!m && !p && !n) {
      void fetchEnfantsList('', '', '');
      return;
    }
    void fetchEnfantsList(m, p, n);
  };

  useEffect(() => {
    void fetchEnfantsList('', '', '');
  }, [fetchEnfantsList]);

  useEffect(() => {
    void refreshListeFinaleLock();
  }, [refreshListeFinaleLock]);

  const telechargerModeleCsv = () => {
    const blob = new Blob([`\ufeff${CSV_MODELE}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'modele_import_enfants.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportEnfants = async () => {
    const input = fileInputRef.current;
    const file = input?.files?.[0];
    if (!file) {
      toast({ title: 'Aucun fichier', description: 'Choisissez un fichier CSV.', variant: 'destructive' });
      return;
    }
    if (!token) return;
    setImportLoading(true);
    setImportResult(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`${API_BASE_URL}/admin/parents/enfants/import-csv`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const text = await res.text();
      const data = (text ? JSON.parse(text) : {}) as ImportResult;
      if (!res.ok) {
        let msg = 'Import impossible';
        try {
          msg = parseApiError(JSON.parse(text));
        } catch {
          /* ignore */
        }
        toast({ title: 'Erreur', description: msg, variant: 'destructive' });
        setImportResult(null);
        return;
      }
      setImportResult(data);
      toast({
        title: 'Import terminé',
        description: `${data.creees ?? 0} enfant(s) créé(s), ${data.erreurs ?? 0} ligne(s) en erreur.`,
      });
      await fetchEnfantsList(filterMatricule.trim(), filterPrenom.trim(), filterNom.trim());
      if (input) input.value = '';
    } catch (e) {
      toast({
        title: 'Erreur',
        description: e instanceof Error ? e.message : 'Échec de l’import',
        variant: 'destructive',
      });
    } finally {
      setImportLoading(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto w-full space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between"
      >
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-foreground">Enfants codifiés</h1>
          <p className="text-muted-foreground mt-1 max-w-3xl">
            Charger en base les enfants rattachés aux comptes parents (données RH). Les règles existantes
            s’appliquent : plage de naissance 2012–2019, nombre max. d’enfants par parent, création des demandes
            comme après synchronisation côté parent.
          </p>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="bg-card rounded-xl shadow-card border border-border p-6 space-y-5"
      >
        <div className="space-y-2 text-sm text-muted-foreground">
          {/*
 <p>
            Fichier <strong className="text-foreground">Excel .xlsx</strong> (première feuille) ou <strong className="text-foreground">CSV UTF-8</strong>{' '}
            (virgule ou point-virgule). En-têtes obligatoires (noms acceptés entre parenthèses) :{' '}
            <span className="font-mono text-xs text-foreground">matricule_parent</span> (ou matricule),{' '}
            <span className="font-mono text-xs text-foreground">prenom</span>, <span className="font-mono text-xs text-foreground">nom</span>,{' '}
            <span className="font-mono text-xs text-foreground">date_naissance</span> (AAAA-MM-JJ ou JJ/MM/AAAA),{' '}
            <span className="font-mono text-xs text-foreground">sexe</span> (M/F),{' '}
            <span className="font-mono text-xs text-foreground">lien_parente</span> (PERE, MERE, TUTEUR_LEGAL, AUTRE).
          </p>
          */}
          <p>
            Le <strong className="text-foreground">matricule</strong> doit correspondre au compte utilisateur{' '}
            <strong className="text-foreground">parent</strong> déjà créé dans l’application.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xlsm,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="text-sm max-w-full"
          />
          <Button type="button" variant="outline" className="gap-2 rounded-lg" onClick={telechargerModeleCsv}>
            <FileDown className="w-4 h-4" />
            Télécharger un modèle
          </Button>
          <Button
            type="button"
            className="gap-2 rounded-lg bg-primary text-primary-foreground"
            onClick={() => void handleImportEnfants()}
            disabled={importLoading}
          >
            {importLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            Importer
          </Button>
        </div>

        {importResult?.ok && importResult.details && importResult.details.length > 0 && (
          <Alert className="border-border">
            <AlertTitle>Résultat ligne par ligne</AlertTitle>
            <AlertDescription>
              <p className="text-sm mb-2">
                {importResult.creees ?? 0} création(s), {importResult.erreurs ?? 0} erreur(s) sur{' '}
                {importResult.lignes_traitees ?? 0} ligne(s).
              </p>
              <ul className="max-h-56 overflow-y-auto text-xs space-y-1 font-mono">
                {importResult.details.map((d, i) => (
                  <li key={`${d.ligne}-${i}`} className={d.ok ? 'text-emerald-700' : 'text-destructive'}>
                    L{d.ligne}: {d.message}
                  </li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08 }}
        className="space-y-4"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold text-foreground">Enfants chargés</h2>
          <Button type="button" variant="outline" className="rounded-lg shrink-0" onClick={() => loadEnfants()} disabled={loadingEnfants}>
            {loadingEnfants ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Actualiser'}
          </Button>
        </div>

        <div className="bg-card rounded-xl shadow-card border border-border p-4 sm:p-6 space-y-4">
          <p className="text-sm text-muted-foreground">
            Filtrer par <strong className="text-foreground">matricule</strong> du parent, ou par{' '}
            <strong className="text-foreground">prénom et nom</strong> (les deux champs). Les résultats viennent de la base.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:items-end">
            <div className="space-y-2">
              <Label htmlFor="filtre-matricule">Matricule parent</Label>
              <Input
                id="filtre-matricule"
                className="rounded-lg font-mono text-sm"
                placeholder="Ex. CSS-2024-001"
                value={filterMatricule}
                onChange={(e) => setFilterMatricule(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="filtre-prenom">Prénom parent</Label>
              <Input
                id="filtre-prenom"
                className="rounded-lg"
                placeholder="Prénom"
                value={filterPrenom}
                onChange={(e) => setFilterPrenom(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="filtre-nom">Nom parent</Label>
              <Input
                id="filtre-nom"
                className="rounded-lg"
                placeholder="Nom"
                value={filterNom}
                onChange={(e) => setFilterNom(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap gap-2 lg:justify-end">
              <Button type="button" variant="outline" className="rounded-lg gap-2" onClick={() => clearFiltersAndReload()} disabled={loadingEnfants}>
                Réinitialiser
              </Button>
              <Button type="button" className="rounded-lg gap-2 bg-primary text-primary-foreground" onClick={() => applyFilters()} disabled={loadingEnfants}>
                {loadingEnfants ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                Filtrer
              </Button>
            </div>
          </div>
        </div>

        {listMeta?.filter_message ? (
          <Alert className={listMeta.parent_found === false ? 'border-destructive/50 bg-destructive/5' : 'border-border'}>
            <AlertTitle>{listMeta.parent_found === false ? 'Parent introuvable' : 'Information'}</AlertTitle>
            <AlertDescription className="text-sm">{listMeta.filter_message}</AlertDescription>
          </Alert>
        ) : null}

        {listMeta?.filter_active && listMeta.parent_found && listMeta.parent && enfants.length > 0 ? (
          <p className="text-sm text-muted-foreground">
            Parent :{' '}
            <span className="font-medium text-foreground">
              {listMeta.parent.prenom} {listMeta.parent.nom}
            </span>{' '}
            — matricule <span className="font-mono text-xs">{listMeta.parent.matricule}</span>
          </p>
        ) : null}

        <div className="bg-card rounded-xl shadow-card border border-border overflow-hidden overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="font-semibold">Matricule parent</TableHead>
                <TableHead className="font-semibold">Parent</TableHead>
                <TableHead className="font-semibold">Enfant</TableHead>
                <TableHead className="font-semibold">Date naissance</TableHead>
                <TableHead className="font-semibold">Sexe</TableHead>
                <TableHead className="font-semibold">Lien</TableHead>
                <TableHead className="font-semibold text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {enfants.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-6">
                    {loadingEnfants
                      ? 'Chargement...'
                      : listMeta?.filter_active
                        ? 'Aucune ligne à afficher pour ce filtre.'
                        : 'Aucun enfant chargé pour le moment.'}
                  </TableCell>
                </TableRow>
              ) : (
                enfants.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="font-mono text-xs">{e.parent_matricule}</TableCell>
                    <TableCell>{e.parent_prenom} {e.parent_nom}</TableCell>
                    <TableCell>{e.prenom} {e.nom}</TableCell>
                    <TableCell>{e.date_naissance}</TableCell>
                    <TableCell>{e.sexe}</TableCell>
                    <TableCell>{e.lien_parente}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button type="button" size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => openEdit(e)}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                          onClick={() => openDelete(e)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </motion.div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md rounded-xl">
          <DialogHeader>
            <DialogTitle>Modifier l’enfant</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-xs text-muted-foreground">
              Si cet enfant a une demande d’inscription, le <strong>lien de parenté</strong> ne peut pas être modifié ici (utilisez le flux de correction des rejets).
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="edit-prenom">Prénom</Label>
                <Input id="edit-prenom" className="rounded-lg" value={editPrenom} onChange={(ev) => setEditPrenom(ev.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-nom">Nom</Label>
                <Input id="edit-nom" className="rounded-lg" value={editNom} onChange={(ev) => setEditNom(ev.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-ddn">Date de naissance</Label>
              <Input id="edit-ddn" type="date" className="rounded-lg" value={editDdn} onChange={(ev) => setEditDdn(ev.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Sexe</Label>
                <Select value={editSexe} onValueChange={(v) => setEditSexe(v as 'M' | 'F')}>
                  <SelectTrigger className="rounded-lg">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="M">M</SelectItem>
                    <SelectItem value="F">F</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Lien de parenté</Label>
                <Select value={editLien} onValueChange={(v) => setEditLien(v as typeof editLien)}>
                  <SelectTrigger className="rounded-lg">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PERE">Père</SelectItem>
                    <SelectItem value="MERE">Mère</SelectItem>
                    <SelectItem value="TUTEUR_LEGAL">Tuteur légal</SelectItem>
                    <SelectItem value="AUTRE">Autre</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" className="rounded-lg" onClick={() => setEditOpen(false)} disabled={editSubmitting}>
              Annuler
            </Button>
            <Button type="button" className="rounded-lg bg-primary text-primary-foreground" onClick={() => void handleSaveEdit()} disabled={editSubmitting}>
              {editSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Enregistrer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent className="rounded-xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cet enfant ?</AlertDialogTitle>
            <AlertDialogDescription>
              {deletingEnfant ? (
                <>
                  {deletingEnfant.prenom} {deletingEnfant.nom} — parent {deletingEnfant.parent_prenom} {deletingEnfant.parent_nom} (
                  <span className="font-mono text-xs">{deletingEnfant.parent_matricule}</span>). La ligne enfant et, le cas échéant, sa demande
                  d’inscription seront retirées de la base. Si la demande avait un rang sur une liste, la renumérotation existante est appliquée.
                </>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-lg" disabled={deleteSubmitting}>
              Annuler
            </AlertDialogCancel>
            <AlertDialogAction
              className="rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteSubmitting}
              onClick={(ev) => {
                ev.preventDefault();
                void handleConfirmDelete();
              }}
            >
              {deleteSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Supprimer'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteBlockedOpen} onOpenChange={setDeleteBlockedOpen}>
        <AlertDialogContent className="rounded-xl max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Suppression impossible</AlertDialogTitle>
            <AlertDialogDescription className="text-foreground/90 whitespace-pre-wrap">
              {deleteBlockedMessage}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction className="rounded-lg">Fermer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
