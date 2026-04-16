import React, { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Baby, FileDown, Loader2, Upload } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { API_BASE_URL, parseApiError } from '@/lib/api';

type ImportDetail = { ligne: number; ok: boolean; message: string; matricule?: string };

type ImportResult = {
  ok: boolean;
  lignes_traitees?: number;
  creees?: number;
  erreurs?: number;
  details?: ImportDetail[];
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
    <div className="max-w-3xl mx-auto space-y-8">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Baby className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Enfants codifiés</h1>
            <p className="text-muted-foreground mt-1">
              Charger en base les enfants rattachés aux comptes parents (données RH). Les règles existantes
              s’appliquent : plage de naissance 2012–2019, nombre max. d’enfants par parent, création des demandes
              comme après synchronisation côté parent.
            </p>
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="bg-card rounded-xl shadow-card border border-border p-6 space-y-5"
      >
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>
            Fichier <strong className="text-foreground">Excel .xlsx</strong> (première feuille) ou <strong className="text-foreground">CSV UTF-8</strong>{' '}
            (virgule ou point-virgule). En-têtes obligatoires (noms acceptés entre parenthèses) :{' '}
            <span className="font-mono text-xs text-foreground">matricule_parent</span> (ou matricule),{' '}
            <span className="font-mono text-xs text-foreground">prenom</span>, <span className="font-mono text-xs text-foreground">nom</span>,{' '}
            <span className="font-mono text-xs text-foreground">date_naissance</span> (AAAA-MM-JJ ou JJ/MM/AAAA),{' '}
            <span className="font-mono text-xs text-foreground">sexe</span> (M/F),{' '}
            <span className="font-mono text-xs text-foreground">lien_parente</span> (PERE, MERE, TUTEUR_LEGAL, AUTRE).
          </p>
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
    </div>
  );
}
