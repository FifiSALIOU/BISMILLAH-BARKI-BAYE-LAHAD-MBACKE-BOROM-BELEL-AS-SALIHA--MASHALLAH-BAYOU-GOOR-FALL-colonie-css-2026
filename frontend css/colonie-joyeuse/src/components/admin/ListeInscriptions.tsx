import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { FileDown, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { exportStyledExcel } from '@/lib/excelExport';
import { apiRequest } from '@/lib/api';
import { listeApiToUi, listeUiToApi, statutLabelFromListeUi } from '@/lib/listeCodes';

type Row = {
  id: string;
  demandeId: number;
  /** `rang_dans_liste` côté API — même règle que la gestion des listes */
  rang: number;
  inscriptionAt?: string | null;
  updatedAt?: string | null;
  reinscrit?: boolean;
  // desistementValide: boolean;
  parentMatricule: string;
  parentNom: string;
  parentPrenom: string;
  parentService: string;
  parentAgence: string;
  enfantNom: string;
  enfantPrenom: string;
  dateNaissance: string;
  sexe: 'M' | 'F';
  statut: string;
  liste: 'principale' | 'attente_n1' | 'attente_n2';
  dateInscription: string;
};

const age = (d: string) => {
  const birth = new Date(d);
  const today = new Date();
  let a = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) a--;
  return a;
};

export default function ListeInscriptions() {
  const { token } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    if (!token) return;
    Promise.all([
      apiRequest<any[]>(`/admin/listes/${listeUiToApi('principale')}/demandes`, { token }),
      apiRequest<any[]>(`/admin/listes/${listeUiToApi('attente_n1')}/demandes`, { token }),
      apiRequest<any[]>(`/admin/listes/${listeUiToApi('attente_n2')}/demandes`, { token }),
    ]).then(([p, n1, n2]) => {
      /** Désistements validés : comme en Gestion des listes — non affichés ici (voir « Demandes désistées »). */
      const mapRows = (list: any[]): Row[] =>
        list
          .filter((d) => String(d.statut || '') !== 'DESISTEE')
          .map((d) => {
          const lu = listeApiToUi(d.liste);
          return {
            id: String(d.demande_id),
            demandeId: d.demande_id,
            rang: Number(d.rang) || 0,
            inscriptionAt: d.inscription_at ?? null,
            updatedAt: d.updated_at ?? null,
            reinscrit: !!d.is_reinscrit,
            // desistementValide: String(d.statut || '') === 'DESISTEE',
            parentMatricule: d.parent_matricule,
            parentNom: d.parent_nom,
            parentPrenom: d.parent_prenom,
            parentService: d.parent_service || '',
            parentAgence: d.parent_site || '',
            enfantNom: d.enfant?.nom || '',
            enfantPrenom: d.enfant?.prenom || '',
            dateNaissance: d.enfant?.date_naissance || '',
            sexe: d.enfant?.sexe === 'F' ? 'F' : 'M',
            statut: statutLabelFromListeUi(lu),
            liste: lu,
            dateInscription: d.date_inscription,
          };
        });
      setRows([...mapRows(p), ...mapRows(n1), ...mapRows(n2)]);
    }).catch(() => undefined);
  }, [token]);

  const sortedEnfants = useMemo(() => {
    const prio = { principale: 0, attente_n1: 1, attente_n2: 2 } as const;
    return [...rows].sort((a, b) => {
      const pa = prio[a.liste];
      const pb = prio[b.liste];
      if (pa !== pb) return pa - pb;
      const dr = a.rang - b.rang;
      if (dr !== 0) return dr;
      return a.demandeId - b.demandeId;
    });
  }, [rows]);

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
      case 'principale': return 'Principale';
      case 'attente_n1': return "N°1";
      case 'attente_n2': return "N°2";
      default: return liste;
    }
  };

  const filtered = sortedEnfants.filter(e => {
    if (!searchTerm) return true;
    const s = searchTerm.toLowerCase();
    return e.parentMatricule.toLowerCase().includes(s) || e.enfantNom.toLowerCase().includes(s) || e.enfantPrenom.toLowerCase().includes(s) || e.parentNom.toLowerCase().includes(s);
  });

  const generateData = () => {
    const headers = ['Rang', 'Matricule', 'Nom Parent', 'Prénom Parent', 'Service', 'Agence', 'Nom Enfant', 'Prénom Enfant', 'Âge', 'Sexe', 'Statut', 'Liste', 'Inscrit le', 'Heure inscription'];
    const dataRows = filtered.map((e) => {
      const when = e.inscriptionAt ?? e.dateInscription;
      return [
        e.rang,
        e.parentMatricule,
        e.parentNom || '',
        e.parentPrenom || '',
        e.parentService || '',
        e.parentAgence || '',
        e.enfantNom,
        e.enfantPrenom,
        `${age(e.dateNaissance)} ans`,
        e.sexe === 'M' ? 'M' : 'F',
        e.statut,
        getListeLabel(e.liste),
        new Date(when).toLocaleDateString('fr-FR'),
        new Date(when).toLocaleTimeString('fr-FR', { hour12: false }),
      ];
    });
    return { headers, rows: dataRows };
  };

  const exportExcel = () => {
    const { headers, rows } = generateData();
    exportStyledExcel(headers, rows, 'Inscriptions', 'inscriptions.xlsx');
  };

  const exportPDF = () => {
    const { headers, rows } = generateData();
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.setFontSize(16);
    doc.text('Toutes les inscriptions', 14, 15);
    doc.setFontSize(10);
    doc.text(`${filtered.length} inscription(s)`, 14, 22);
    autoTable(doc, {
      head: [headers],
      body: rows.map(r => r.map(c => String(c))),
      startY: 28,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [59, 130, 246] },
    });
    doc.save('inscriptions.pdf');
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Toutes les inscriptions</h1>
          <p className="text-muted-foreground mt-1">{rows.length} inscription(s){/* — rang = position dans chaque liste (aligné sur la base de données) */}</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={exportExcel} variant="outline" className="gap-2 rounded-lg">
            <FileDown className="w-4 h-4" />Export Excel
          </Button>
          <Button onClick={exportPDF} variant="outline" className="gap-2 rounded-lg">
            <FileDown className="w-4 h-4" />Export PDF
          </Button>
        </div>
      </motion.div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Rechercher..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-9 rounded-lg" />
      </div>

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
                <TableHead className="font-semibold text-center">Sexe</TableHead>
                <TableHead className="font-semibold text-center">Liste</TableHead>
                <TableHead className="font-semibold text-center">Statut</TableHead>
                <TableHead className="font-semibold">Inscrit le</TableHead>
                <TableHead className="font-semibold">Heure inscription</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((e) => (
                  (() => {
                    const when = e.inscriptionAt ?? e.dateInscription;
                    return (
                  <TableRow key={e.id}>
                    <TableCell className="font-bold text-foreground text-center">{e.rang || '—'}</TableCell>
                    <TableCell className="font-mono tabular-nums text-sm">{e.parentMatricule}</TableCell>
                    <TableCell>{e.parentNom || '—'}</TableCell>
                    <TableCell>{e.parentPrenom || '—'}</TableCell>
                    <TableCell className="text-sm">{e.parentService || '—'}</TableCell>
                    <TableCell className="text-sm">{e.parentAgence || '—'}</TableCell>
                    <TableCell>{e.enfantPrenom}</TableCell>
                    <TableCell className="font-medium">{e.enfantNom}</TableCell>
                    <TableCell className="whitespace-nowrap">{age(e.dateNaissance)} ans</TableCell>
                    <TableCell className="text-center">{e.sexe === 'M' ? 'M' : 'F'}</TableCell>
                    <TableCell className="text-center">
                      <span className="text-xs font-medium px-2 py-0.5 rounded-md bg-muted text-muted-foreground whitespace-nowrap">{getListeLabel(e.liste)}</span>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-md whitespace-nowrap ${getStatutBadge(e.statut)}`}>{e.statut}</span>
                    </TableCell>
                    <TableCell className="tabular-nums text-sm text-muted-foreground">{new Date(when).toLocaleDateString('fr-FR')}</TableCell>
                    <TableCell className="tabular-nums text-sm text-muted-foreground">{new Date(when).toLocaleTimeString('fr-FR', { hour12: false })}</TableCell>
                  </TableRow>
                    );
                  })()
              ))}
            </TableBody>
          </Table>
        </div>
      </motion.div>
    </div>
  );
}
