import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { apiRequest } from '@/lib/api';

interface ServiceRow {
  id: string;
  nom: string;
  description: string;
}

export default function GestionServices() {
  const { token } = useAuth();
  const [rows, setRows] = useState<ServiceRow[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ServiceRow | null>(null);
  const [form, setForm] = useState({ nom: '', description: '' });
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await apiRequest<Array<{ id: number; nom: string; description?: string | null }>>('/admin/services', { token });
      setRows(
        data.map((r) => ({
          id: String(r.id),
          nom: r.nom,
          description: (r.description && r.description !== '-') ? r.description : '',
        })),
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [token]);

  const openAdd = () => {
    setEditing(null);
    setForm({ nom: '', description: '' });
    setDialogOpen(true);
  };

  const openEdit = (r: ServiceRow) => {
    setEditing(r);
    setForm({ nom: r.nom, description: r.description });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    const nom = form.nom.trim();
    if (!nom) {
      toast.error('Le nom du service est obligatoire');
      return;
    }
    if (!token) return;
    const body = JSON.stringify({
      nom,
      description: form.description.trim() || undefined,
    });
    try {
      if (editing) {
        await apiRequest(`/admin/services/${editing.id}`, { method: 'PATCH', token, body });
        toast.success('Service modifié');
      } else {
        await apiRequest('/admin/services', { method: 'POST', token, body });
        toast.success('Service ajouté');
      }
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur API');
      return;
    }
    setDialogOpen(false);
  };

  const handleDelete = async (id: string) => {
    if (!token) return;
    try {
      await apiRequest(`/admin/services/${id}`, { method: 'DELETE', token });
      toast.success('Service supprimé');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur API');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Services</h1>
          <p className="text-muted-foreground text-sm">
            {rows.length === 1 ? '1 service' : `${rows.length} services`}
          </p>
          {/* <p className="text-muted-foreground">
            Référentiel des services (ex. D.E.S.I.F.) utilisés lors de la création des comptes parents.
          </p> */}
        </div>
        <Button onClick={openAdd}>
          <Plus className="w-4 h-4 mr-2" />
          Ajouter un service
        </Button>
      </div>

      <Card>
        <CardHeader>
          {/* <CardTitle className="flex items-center gap-2">
            <Briefcase className="w-5 h-5" />
            Services configurés
          </CardTitle> */}
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nom</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-semibold">{r.nom}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{r.description || '—'}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => openEdit(r)}>
                        <Pencil className="w-3 h-3" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => handleDelete(r.id)}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {!loading && rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                    Aucun service configuré
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Modifier le service' : 'Ajouter un service'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>
                Nom <span className="text-destructive">*</span>
              </Label>
              <Input
                value={form.nom}
                onChange={(e) => setForm((f) => ({ ...f, nom: e.target.value }))}
                placeholder="Ex : D.E.S.I.F."
              />
            </div>
            <div>
              <Label>
                Description <span className="text-muted-foreground text-xs">(optionnel)</span>
              </Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Courte description du service"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Annuler
            </Button>
            <Button onClick={handleSave}>{editing ? 'Modifier' : 'Ajouter'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
