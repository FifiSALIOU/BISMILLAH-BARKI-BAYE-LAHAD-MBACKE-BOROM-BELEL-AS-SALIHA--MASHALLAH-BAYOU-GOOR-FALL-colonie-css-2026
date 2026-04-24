import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Search, Eye, HandMetal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { apiRequest } from '@/lib/api';
import { listeApiToUi, statutLabelFromListeUi, type ListeUi } from '@/lib/listeCodes';

type Row = {
  id: string;
  demandeId: number;
  parentMatricule: string;
  prenom: string;
  nom: string;
  dateNaissance: string;
  sexe: 'M' | 'F';
  lienParente: string;
  liste: ListeUi;
  statut: 'Titulaire' | 'Suppléant N1' | 'Suppléant N2';
  dateInscription: string;
  createdAt?: string | null;
  updatedAt?: string | null;
  parentNom?: string;
  parentPrenom?: string;
  parentService?: string;
  parentAgence?: string;
  parentEmail?: string;
  parentTelephone?: string;
  rang: number;
  reinscrit?: boolean;
};

const priorityListe: Record<ListeUi, number> = {
  principale: 0,
  attente_n1: 1,
  attente_n2: 2,
};

function getListeLabel(liste: ListeUi): string {
  switch (liste) {
    case 'principale':
      return 'Liste Principale';
    case 'attente_n1':
      return "Liste d'Attente N°1";
    case 'attente_n2':
      return "Liste d'Attente N°2";
    default:
      return liste;
  }
}

const calculateAge = (dateNaissance: string): number => {
  const birth = new Date(dateNaissance);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
};

function mapApiRow(d: any): Row | null {
  const apiDemandeStatut = String(d.statut || '');
  if (apiDemandeStatut !== 'DESISTEE') return null;
  const lu = listeApiToUi(d.liste);
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
    createdAt: d.created_at ?? d.createdAt ?? null,
    updatedAt: d.updated_at ?? null,
    parentNom: d.parent_nom,
    parentPrenom: d.parent_prenom,
    parentService: d.parent_service,
    parentTelephone: d.parent_telephone || undefined,
    parentAgence: d.parent_site || '',
    parentEmail: undefined,
    rang: d.rang || 0,
    reinscrit: !!d.is_reinscrit,
  };
}

export default function ListeDemandesDesistees() {
  const { token } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [detail, setDetail] = useState<Row | null>(null);
  useEffect(() => {
    if (!token) return;
    apiRequest<any[]>('/admin/demandes/desistees', { token })
      .then((all) => {
        const out: Row[] = [];
        for (const d of all || []) {
          const r = mapApiRow(d);
          if (r) out.push(r);
        }
        setRows(out);
      })
      .catch(() => undefined);
  }, [token]);

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      const pa = priorityListe[a.liste];
      const pb = priorityListe[b.liste];
      if (pa !== pb) return pa - pb;
      if (a.rang !== b.rang) return a.rang - b.rang;
      return a.demandeId - b.demandeId;
    });
  }, [rows]);

  const filtered = sorted.filter((e) => {
    if (!searchTerm.trim()) return true;
    const s = searchTerm.toLowerCase();
    return (
      e.parentMatricule.toLowerCase().includes(s) ||
      e.nom.toLowerCase().includes(s) ||
      e.prenom.toLowerCase().includes(s) ||
      (e.parentNom || '').toLowerCase().includes(s) ||
      (e.parentPrenom || '').toLowerCase().includes(s)
    );
  });

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-destructive/10 flex items-center justify-center">
          <HandMetal className="w-5 h-5 text-destructive" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Demandes désistées</h1>
          <p className="text-muted-foreground mt-1">
            Liste des demandes au statut désistement validé (consultation), groupées depuis les trois listes.
          </p>
        </div>
      </motion.div>

      <div className="relative flex-1 min-w-[200px] max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Rechercher par matricule, nom..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-9 rounded-lg"
        />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="rounded-xl border border-border bg-card shadow-card overflow-hidden"
      >
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="font-semibold">Matricule</TableHead>
                <TableHead className="font-semibold">Nom Parent</TableHead>
                <TableHead className="font-semibold">Prénom Parent</TableHead>
                <TableHead className="font-semibold">Nom Enfant</TableHead>
                <TableHead className="font-semibold">Prénom Enfant</TableHead>
                <TableHead className="font-semibold">Âge</TableHead>
                <TableHead className="font-semibold">Liste d&apos;origine</TableHead>
                <TableHead className="font-semibold">Statut</TableHead>
                <TableHead className="font-semibold">Date désistement</TableHead>
                <TableHead className="font-semibold">Heure du désistement</TableHead>
                <TableHead className="font-semibold">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11} className="text-center py-12 text-muted-foreground">
                    Aucune demande désistée
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((e) => (
                  <TableRow key={e.demandeId}>
                    <TableCell className="font-mono text-sm">{e.parentMatricule}</TableCell>
                    <TableCell className="text-sm">{e.parentNom || '—'}</TableCell>
                    <TableCell className="text-sm">{e.parentPrenom || '—'}</TableCell>
                    <TableCell className="text-sm font-medium">{e.nom}</TableCell>
                    <TableCell className="text-sm font-medium">{e.prenom}</TableCell>
                    <TableCell>{calculateAge(e.dateNaissance)} ans</TableCell>
                    <TableCell className="text-sm">{getListeLabel(e.liste)}</TableCell>
                    <TableCell>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-md whitespace-nowrap ${e.statut === 'Titulaire' ? 'bg-emerald-50 text-emerald-700' : e.statut === 'Suppléant N1' ? 'bg-accent/10 text-accent border border-accent/20' : 'bg-primary/10 text-primary'}`}>{e.statut}</span>
                    </TableCell>
                    <TableCell className="text-sm">
                      {e.updatedAt
                        ? new Date(e.updatedAt).toLocaleDateString('fr-FR', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                          })
                        : '—'}
                    </TableCell>
                    <TableCell className="text-sm">
                      {e.updatedAt
                        ? new Date(e.updatedAt).toLocaleTimeString('fr-FR', {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          })
                        : '—'}
                    </TableCell>
                    <TableCell>
                      <Button size="sm" variant="ghost" onClick={() => setDetail(e)} className="gap-1 text-xs rounded-lg h-7 px-2">
                        <Eye className="w-3 h-3" />
                        Voir détails
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </motion.div>

      <Dialog open={!!detail} onOpenChange={() => setDetail(null)}>
        <DialogContent className="sm:max-w-lg rounded-xl">
          <DialogHeader>
            <DialogTitle className="text-foreground">Détails — demande désistée</DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="space-y-4 text-sm">
              <span className="text-xs font-semibold px-3 py-1 rounded-full bg-destructive/10 text-destructive">Désistement validé</span>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <h3 className="font-semibold border-b pb-1">Parent</h3>
                  <div>
                    <span className="text-muted-foreground">Matricule :</span>{' '}
                    <span className="font-mono">{detail.parentMatricule}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Nom :</span> {detail.parentNom}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Prénom :</span> {detail.parentPrenom}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Service :</span> {detail.parentService}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Agence :</span> {detail.parentAgence || '—'}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Tél. :</span> {detail.parentTelephone || '—'}
                  </div>
                </div>
                <div className="space-y-2">
                  <h3 className="font-semibold border-b pb-1">Enfant</h3>
                  <div>
                    <span className="text-muted-foreground">Nom :</span> {detail.nom}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Prénom :</span> {detail.prenom}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Âge :</span> {calculateAge(detail.dateNaissance)} ans
                  </div>
                  <div>
                    <span className="text-muted-foreground">Liste d&apos;origine :</span> {getListeLabel(detail.liste)}
                  </div>
                </div>
              </div>
              <p className="text-xs text-muted-foreground pt-2 border-t">
                {(() => {
                  const rawDate = detail.createdAt || detail.dateInscription;
                  const dt = new Date(rawDate);
                  const isValid = !Number.isNaN(dt.getTime());
                  if (!isValid) return 'Inscription : —';
                  const datePart = dt.toLocaleDateString('fr-FR', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  });
                  return `Inscription : ${datePart}`;
                })()}
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
