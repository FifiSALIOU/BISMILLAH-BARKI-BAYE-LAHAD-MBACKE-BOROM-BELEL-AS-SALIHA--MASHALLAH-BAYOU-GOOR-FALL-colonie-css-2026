import React, { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Search, RotateCcw, Ban, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { apiRequest } from '@/lib/api';
import { listeApiToUi, statutLabelFromListeUi, type ListeUi } from '@/lib/listeCodes';
import { toast } from '@/hooks/use-toast';
import type { Enfant } from '@/data/mockData';

type ApiEnfant = {
  id: number;
  prenom: string;
  nom: string;
  date_naissance: string | null;
  sexe: string;
  lien_parente: string;
  is_titulaire: boolean;
};

export type RejetApiRow = {
  demande_id: number;
  liste: string;
  rang: number;
  date_inscription: string;
  updated_at?: string | null;
  statut: string;
  rejet_definitif: boolean;
  non_validation_reason?: string | null;
  parent_matricule: string;
  parent_prenom: string;
  parent_nom: string;
  parent_service: string;
  parent_telephone?: string;
  parent_site?: string | null;
  enfant: ApiEnfant;
};

type RejetsResponse = {
  en_attente_correction: RejetApiRow[];
  refus_definitifs: RejetApiRow[];
};

const LIEN_FR_TO_API: Record<Enfant['lienParente'], string> = {
  Père: 'PERE',
  Mère: 'MERE',
  'Tuteur légal': 'TUTEUR_LEGAL',
  Autre: 'AUTRE',
};

const LIEN_API_TO_FR: Record<string, Enfant['lienParente']> = {
  PERE: 'Père',
  MERE: 'Mère',
  TUTEUR_LEGAL: 'Tuteur légal',
  AUTRE: 'Autre',
};

function getListeLabelFromApi(code: string): string {
  const lu = listeApiToUi(code);
  switch (lu) {
    case 'principale':
      return 'Liste Principale';
    case 'attente_n1':
      return "Liste d'Attente N°1";
    case 'attente_n2':
      return "Liste d'Attente N°2";
    default:
      return code;
  }
}

/** Passage vers Autre depuis Père / Mère / Tuteur légal : transfert liste N2 (aligné backend). */
function correctionAfficheTransfertN2(formLien: Enfant['lienParente'], lienParenteApiOrigine: string): boolean {
  if (formLien !== 'Autre') return false;
  return ['PERE', 'MERE', 'TUTEUR_LEGAL'].includes(lienParenteApiOrigine);
}

const calculateAge = (dateNaissance: string): number => {
  const birth = new Date(dateNaissance);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
};

export default function ListeDemandesRejetees() {
  const { token } = useAuth();
  const [enAttente, setEnAttente] = useState<RejetApiRow[]>([]);
  const [definitifs, setDefinitifs] = useState<RejetApiRow[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const res = await apiRequest<RejetsResponse>('/admin/demandes/rejets', { token });
      setEnAttente(res?.en_attente_correction ?? []);
      setDefinitifs(res?.refus_definitifs ?? []);
    } catch {
      toast({ title: 'Erreur', description: 'Impossible de charger les demandes rejetées.', variant: 'destructive' });
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const st = searchTerm.trim().toLowerCase();
  const rowMatch = (r: RejetApiRow) => {
    if (!st) return true;
    const motif = (r.non_validation_reason || '').toLowerCase();
    return (
      r.parent_matricule.toLowerCase().includes(st) ||
      r.enfant.nom.toLowerCase().includes(st) ||
      r.enfant.prenom.toLowerCase().includes(st) ||
      `${r.parent_prenom} ${r.parent_nom}`.toLowerCase().includes(st) ||
      motif.includes(st)
    );
  };
  const attF = enAttente.filter(rowMatch);
  const defF = definitifs.filter(rowMatch);

  const [corrigerRow, setCorrigerRow] = useState<RejetApiRow | null>(null);
  const [refusDefRow, setRefusDefRow] = useState<RejetApiRow | null>(null);
  const [saving, setSaving] = useState(false);

  const [formPrenom, setFormPrenom] = useState('');
  const [formNom, setFormNom] = useState('');
  const [formDn, setFormDn] = useState('');
  const [formSexe, setFormSexe] = useState<'M' | 'F'>('M');
  const [formLien, setFormLien] = useState<Enfant['lienParente']>('Père');

  const openCorriger = (r: RejetApiRow) => {
    setCorrigerRow(r);
    const e = r.enfant;
    setFormPrenom(e.prenom);
    setFormNom(e.nom);
    const dn = (e.date_naissance || '').includes('T') ? e.date_naissance!.split('T')[0] : e.date_naissance || '';
    setFormDn(dn);
    setFormSexe(e.sexe === 'F' ? 'F' : 'M');
    setFormLien(LIEN_API_TO_FR[e.lien_parente] || 'Autre');
  };

  const submitCorriger = async () => {
    if (!token || !corrigerRow || !formPrenom.trim() || !formNom.trim() || !formDn) return;
    setSaving(true);
    try {
      await apiRequest(`/admin/demandes/${corrigerRow.demande_id}/corriger-rejet`, {
        method: 'POST',
        token,
        body: JSON.stringify({
          enfant_prenom: formPrenom.trim(),
          enfant_nom: formNom.trim(),
          enfant_date_naissance: formDn,
          enfant_sexe: formSexe,
          enfant_lien_parente: LIEN_FR_TO_API[formLien],
        }),
      });
      const transfertN2 = correctionAfficheTransfertN2(formLien, corrigerRow.enfant.lien_parente);
      toast({
        title: 'Correction enregistrée',
        description: transfertN2
          ? `La demande a été transférée en ${getListeLabelFromApi('ATTENTE_N2')}, en dernière position.`
          : `La demande a été remise en liste (${getListeLabelFromApi(corrigerRow.liste)}), en dernière position.`,
      });
      setCorrigerRow(null);
      await load();
    } catch {
      toast({ title: 'Erreur', description: 'La correction n’a pas pu être enregistrée.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const submitRefusDef = async () => {
    if (!token || !refusDefRow) return;
    setSaving(true);
    try {
      await apiRequest(`/admin/demandes/${refusDefRow.demande_id}/refus-definitif`, {
        method: 'POST',
        token,
      });
      toast({
        title: 'Refus définitif',
        description: `La demande de ${refusDefRow.enfant.prenom} ${refusDefRow.enfant.nom} est close définitivement.`,
      });
      setRefusDefRow(null);
      await load();
    } catch {
      toast({ title: 'Erreur', description: 'Action impossible.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const renderTableAttenteCorrection = (rows: RejetApiRow[]) => (
    <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-card">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead className="font-semibold">Matricule</TableHead>
            <TableHead className="font-semibold">Nom Parent</TableHead>
            <TableHead className="font-semibold">Prénom Enfant</TableHead>
            <TableHead className="font-semibold">Nom Enfant</TableHead>
            <TableHead className="font-semibold">Âge</TableHead>
            <TableHead className="font-semibold">Lien parenté</TableHead>
            <TableHead className="font-semibold">Liste d&apos;origine</TableHead>
            <TableHead className="font-semibold">Motif du refus</TableHead>
            <TableHead className="font-semibold">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={9} className="text-center py-10 text-muted-foreground">
                Aucune entrée
              </TableCell>
            </TableRow>
          ) : (
            rows.map((r) => {
              const dn = r.enfant.date_naissance?.includes('T')
                ? r.enfant.date_naissance.split('T')[0]
                : r.enfant.date_naissance || '';
              const lien =
                LIEN_API_TO_FR[r.enfant.lien_parente] || r.enfant.lien_parente || '—';
              return (
                <TableRow key={r.demande_id}>
                  <TableCell className="font-mono text-sm">{r.parent_matricule}</TableCell>
                  <TableCell className="text-sm">
                    {[r.parent_nom, r.parent_prenom].filter(Boolean).join(' ') || '—'}
                  </TableCell>
                  <TableCell className="text-sm font-medium">{r.enfant.prenom}</TableCell>
                  <TableCell className="text-sm">{r.enfant.nom}</TableCell>
                  <TableCell>{dn ? `${calculateAge(dn)} ans` : '—'}</TableCell>
                  <TableCell className="text-sm">{lien}</TableCell>
                  <TableCell>
                    <span className="text-xs font-medium px-2.5 py-1 rounded-md bg-muted text-muted-foreground">
                      {getListeLabelFromApi(r.liste)}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-destructive max-w-[220px]">
                    {(r.non_validation_reason || '').trim() || '—'}
                  </TableCell>
                  <TableCell className="align-middle whitespace-nowrap">
                    <div className="flex flex-row flex-nowrap items-center justify-end gap-2 sm:justify-start">
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="h-7 shrink-0 gap-1 rounded-full border-0 bg-[#00875A] px-2.5 text-[11px] leading-none font-medium !text-white shadow-none hover:bg-[#006b4a] focus-visible:ring-2 focus-visible:ring-[#00875A] focus-visible:ring-offset-1 [&_svg]:!size-3 [&_svg]:!text-white"
                        onClick={() => openCorriger(r)}
                      >
                        <RotateCcw className="size-3 shrink-0" aria-hidden />
                        Corriger
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="h-7 shrink-0 gap-1 rounded-full border-0 bg-[#C92A2A] px-2.5 text-[11px] leading-none font-medium !text-white shadow-none hover:bg-[#A82222] focus-visible:ring-2 focus-visible:ring-[#C92A2A] focus-visible:ring-offset-1 [&_svg]:!size-3 [&_svg]:!text-white"
                        onClick={() => setRefusDefRow(r)}
                      >
                        <Ban className="size-3 shrink-0" aria-hidden />
                        Refus définitif
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

  const renderTableDefinitifs = (rows: RejetApiRow[]) => (
    <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-card">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead className="font-semibold">Liste d&apos;origine</TableHead>
            <TableHead className="font-semibold">Matricule</TableHead>
            <TableHead className="font-semibold">Parent</TableHead>
            <TableHead className="font-semibold">Enfant</TableHead>
            <TableHead className="font-semibold">Âge</TableHead>
            <TableHead className="font-semibold">Motif du refus</TableHead>
            <TableHead className="font-semibold">Statut liste</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                Aucune entrée
              </TableCell>
            </TableRow>
          ) : (
            rows.map((r) => {
              const lu = listeApiToUi(r.liste) as ListeUi;
              const dn = r.enfant.date_naissance?.includes('T')
                ? r.enfant.date_naissance.split('T')[0]
                : r.enfant.date_naissance || '';
              return (
                <TableRow key={r.demande_id}>
                  <TableCell className="text-sm">{getListeLabelFromApi(r.liste)}</TableCell>
                  <TableCell className="font-mono text-sm">{r.parent_matricule}</TableCell>
                  <TableCell className="text-sm">
                    {r.parent_prenom} {r.parent_nom}
                  </TableCell>
                  <TableCell className="text-sm font-medium">
                    {r.enfant.prenom} {r.enfant.nom}
                  </TableCell>
                  <TableCell>{dn ? `${calculateAge(dn)} ans` : '—'}</TableCell>
                  <TableCell className="text-sm text-destructive max-w-[220px]">
                    {(r.non_validation_reason || '').trim() || '—'}
                  </TableCell>
                  <TableCell>
                    <span className="text-xs font-medium px-2 py-0.5 rounded-md bg-muted text-muted-foreground">
                      {statutLabelFromListeUi(lu)}
                    </span>
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
    <div className="max-w-7xl mx-auto space-y-8">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-destructive/10 flex items-center justify-center">
          <Ban className="w-5 h-5 text-destructive" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Demandes rejetées</h1>
          <p className="text-muted-foreground mt-1">
            {enAttente.length} demande(s) en attente de correction — {definitifs.length} refus définitif(s)
          </p>
        </div>
      </motion.div>

      <div className="relative flex-1 min-w-[200px] max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Rechercher..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-9 rounded-lg"
        />
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">Demandes en attente de correction</h2>
        <p className="text-sm text-muted-foreground">
          Corrections possibles par le gestionnaire ; réintégration dans la liste d&apos;origine en dernière position.
        </p>
        {renderTableAttenteCorrection(attF)}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">Refus définitifs</h2>
        <p className="text-sm text-muted-foreground">Demandes closes — plus aucune action pour le parent ni pour l&apos;administration.</p>
        {renderTableDefinitifs(defF)}
      </section>

      <Dialog open={!!corrigerRow} onOpenChange={(o) => !o && setCorrigerRow(null)}>
        <DialogContent className="sm:max-w-lg rounded-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="w-5 h-5 text-emerald-600" />
              Corriger la demande
            </DialogTitle>
            <DialogDescription>
              Corrigez les informations de la demande de{' '}
              <strong>
                {corrigerRow?.enfant.prenom} {corrigerRow?.enfant.nom}
              </strong>
              , puis confirmez pour remettre dans{' '}
              <strong>{corrigerRow ? getListeLabelFromApi(corrigerRow.liste) : '—'}</strong>.
            </DialogDescription>
          </DialogHeader>
          {corrigerRow && (
            <div className="space-y-4">
              <div className="rounded-lg border bg-muted/30 p-3 text-sm space-y-1">
                <div>
                  <span className="text-muted-foreground">Matricule :</span>{' '}
                  <span className="font-mono">{corrigerRow.parent_matricule}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Nom du parent :</span>{' '}
                  {corrigerRow.parent_prenom} {corrigerRow.parent_nom}
                </div>
              </div>
              <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
                Motif du refus : {corrigerRow.non_validation_reason?.trim() || '—'}
              </div>
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Informations de l&apos;enfant (modifiable)
                </p>
                <div className="grid gap-3">
                  <div>
                    <Label htmlFor="cj-prenom">Prénom *</Label>
                    <Input id="cj-prenom" value={formPrenom} onChange={(e) => setFormPrenom(e.target.value)} className="rounded-lg mt-1" />
                  </div>
                  <div>
                    <Label htmlFor="cj-nom">Nom *</Label>
                    <Input id="cj-nom" value={formNom} onChange={(e) => setFormNom(e.target.value)} className="rounded-lg mt-1" />
                  </div>
                  <div>
                    <Label htmlFor="cj-dn">Date de naissance *</Label>
                    <Input id="cj-dn" type="date" value={formDn} onChange={(e) => setFormDn(e.target.value)} className="rounded-lg mt-1" />
                  </div>
                  <div>
                    <Label>Sexe *</Label>
                    <Select value={formSexe} onValueChange={(v) => setFormSexe(v as 'M' | 'F')}>
                      <SelectTrigger className="rounded-lg mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="M">Masculin</SelectItem>
                        <SelectItem value="F">Féminin</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Lien de parenté *</Label>
                    <Select value={formLien} onValueChange={(v) => setFormLien(v as Enfant['lienParente'])}>
                      <SelectTrigger className="rounded-lg mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Père">Père</SelectItem>
                        <SelectItem value="Mère">Mère</SelectItem>
                        <SelectItem value="Tuteur légal">Tuteur légal</SelectItem>
                        <SelectItem value="Autre">Autre</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
              {correctionAfficheTransfertN2(formLien, corrigerRow.enfant.lien_parente) && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950 flex gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" aria-hidden />
                  <div>
                    <p className="font-semibold text-amber-900">Changement de liste</p>
                    <p className="mt-1 text-amber-800">
                      L&apos;enfant sera transféré dans la Liste d&apos;Attente N°2 en dernière position.
                    </p>
                  </div>
                </div>
              )}
              {!correctionAfficheTransfertN2(formLien, corrigerRow.enfant.lien_parente) && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 text-sm text-emerald-900">
                  Destination : <strong>{getListeLabelFromApi(corrigerRow.liste)}</strong> — l&apos;enfant sera placé en{' '}
                  <strong>dernière position</strong> (dernier arrivé), selon l&apos;ordre des rangs en vigueur.
                </div>
              )}
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setCorrigerRow(null)} disabled={saving}>
              Annuler
            </Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => void submitCorriger()} disabled={saving}>
              Confirmer la correction
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!refusDefRow} onOpenChange={(o) => !o && setRefusDefRow(null)}>
        <DialogContent className="sm:max-w-md rounded-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Ban className="w-5 h-5" />
              Refus définitif
            </DialogTitle>
            <DialogDescription className="text-left space-y-2 pt-2">
              <p>
                Vous êtes sur le point de <strong>refuser définitivement</strong> la demande de{' '}
                <strong>
                  {refusDefRow?.enfant.prenom} {refusDefRow?.enfant.nom}
                </strong>
                .
              </p>
              <p className="text-destructive font-medium text-sm">
                Cette action est irréversible. Le parent ne pourra plus rien faire pour cette demande.
              </p>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setRefusDefRow(null)} disabled={saving}>
              Annuler
            </Button>
            <Button variant="destructive" onClick={() => void submitRefusDef()} disabled={saving}>
              Confirmer le refus définitif
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
