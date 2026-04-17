import React, { useEffect, useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { AdminUser, Parent } from '@/data/mockData';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { UserPlus, Pencil, Trash2, Shield, Users, Upload, KeyRound, FileSpreadsheet, Loader2 } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/hooks/use-toast';
import ImportExcel from './ImportExcel';
import { useAuth } from '@/contexts/AuthContext';
import { apiRequest } from '@/lib/api';
import type { ImportResult } from './ImportExcel';

export default function GestionUtilisateurs() {
  const { token } = useAuth();
  type ParentRow = Parent & { userId: string; actif: boolean };
  const [parents, setParents] = useState<ParentRow[]>([]);
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [sites, setSites] = useState<Array<{ id: number; nom: string; code: string }>>([]);
  const [services, setServices] = useState<Array<{ id: number; nom: string }>>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingAdmin, setEditingAdmin] = useState<AdminUser | null>(null);
  const [newEmail, setNewEmail] = useState('');
  const [newNom, setNewNom] = useState('');
  const [newPrenom, setNewPrenom] = useState('');
  const [newRole, setNewRole] = useState<'gestionnaire' | 'super_admin'>('gestionnaire');
  const [newTelephone, setNewTelephone] = useState('');
  const [createAdminSubmitting, setCreateAdminSubmitting] = useState(false);
  const [editAdminSubmitting, setEditAdminSubmitting] = useState(false);

  // Parent creation
  const [createParentOpen, setCreateParentOpen] = useState(false);
  const [newParentMatricule, setNewParentMatricule] = useState('');
  const [newParentPrenom, setNewParentPrenom] = useState('');
  const [newParentNom, setNewParentNom] = useState('');
  const [newParentService, setNewParentService] = useState('');
  const [newParentEmail, setNewParentEmail] = useState('');
  const [newParentTelephone, setNewParentTelephone] = useState('');
  const [newParentSite, setNewParentSite] = useState('');

  // Edit parent
  const [editParentOpen, setEditParentOpen] = useState(false);
  const [editingParent, setEditingParent] = useState<ParentRow | null>(null);

  // Reset password
  const [resetPwdOpen, setResetPwdOpen] = useState(false);
  const [resetPwdTarget, setResetPwdTarget] = useState<{ type: 'admin' | 'parent'; id: string; name: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importExcelOpen, setImportExcelOpen] = useState(false);

  const splitName = (fullName: string | null | undefined) => {
    const s = (fullName || '').trim();
    if (!s) return { prenom: '', nom: '' };
    const parts = s.split(/\s+/);
    if (parts.length === 1) return { prenom: parts[0], nom: '' };
    return { prenom: parts.slice(0, -1).join(' '), nom: parts[parts.length - 1] };
  };

  const refreshUsers = async () => {
    if (!token) return;
    const rows = await apiRequest<any[]>('/admin/users', { token });
    const mappedAdmins: AdminUser[] = rows
      .filter((u) => u.role !== 'PARENT')
      .map((u) => ({
        ...splitName(u.name),
        id: String(u.id),
        email: u.email || '',
        nom: splitName(u.name).nom,
        prenom: splitName(u.name).prenom,
        role: u.role === 'SUPER_ADMIN' ? 'super_admin' : 'gestionnaire',
        actif: !!u.is_active,
        dateCreation: (u.created_at || '').slice(0, 10),
        motDePasse: '',
        telephone: '',
      }));
    const mappedParents: ParentRow[] = rows
      .filter((u) => u.role === 'PARENT')
      .map((u) => ({
        userId: String(u.id),
        matricule: u.matricule || '',
        prenom: u.parent_prenom || '',
        nom: u.parent_nom || '',
        service: u.parent_service || '',
        site: u.parent_site_code || '',
        site_code: u.parent_site_code || '',
        motDePasse: '',
        email: u.email || '',
        telephone: u.parent_telephone || '',
        premiereConnexion: false,
        actif: !!u.is_active,
      }));
    setAdmins(mappedAdmins);
    setParents(mappedParents);
  };

  const handleDeleteParent = async (userId: string) => {
    if (!token) return;
    try {
      await apiRequest(`/admin/users/${userId}`, { method: 'DELETE', token });
      await refreshUsers();
      toast({ title: 'Parent supprimé', variant: 'destructive' });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Suppression impossible.';
      toast({
        title: 'Suppression impossible',
        description: msg,
        variant: 'destructive',
      });
    }
  };

  const refreshSites = async () => {
    if (!token) return;
    const rows = await apiRequest<any[]>('/admin/sites', { token });
    setSites(rows.map((s) => ({ id: s.id, nom: s.nom, code: String(s.code) })));
  };

  const refreshServices = async () => {
    if (!token) return;
    const rows = await apiRequest<any[]>('/admin/services', { token });
    setServices(rows.map((s) => ({ id: s.id, nom: s.nom })));
  };

  useEffect(() => {
    if (!token) return;
    Promise.all([refreshUsers(), refreshSites(), refreshServices()]).catch(() => undefined);
  }, [token]);

  const handleImportParents = async (data: any[]): Promise<ImportResult> => {
    const results = await Promise.all(
      data.map(async (row, i) => {
        const ligne = i + 2;
        if (!row.matricule || !row.prenom || !row.nom || !row.service) {
          return { ok: false as const, ligne, message: 'Champs obligatoires manquants (matricule, prenom, nom, service)' };
        }
        try {
          await apiRequest('/admin/users', {
            method: 'POST',
            token,
            body: JSON.stringify({
              matricule: row.matricule,
              name: `${row.prenom} ${row.nom}`.trim(),
              prenom: row.prenom,
              nom: row.nom,
              role: 'PARENT',
              service: row.service,
              site_code: row.site || null,
              email: row.email || null,
              telephone: row.telephone || null,
            }),
          });
          return { ok: true as const, ligne };
        } catch (e) {
          return { ok: false as const, ligne, message: e instanceof Error ? e.message : 'Erreur API' };
        }
      }),
    );
    let success = 0;
    const errors: { ligne: number; message: string }[] = [];
    for (const r of results) {
      if (r.ok) success++;
      else errors.push({ ligne: r.ligne, message: r.message });
    }
    void refreshUsers();
    return { success, errors };
  };

  const handleImportAdmins = async (data: any[]): Promise<ImportResult> => {
    const results = await Promise.all(
      data.map(async (row, i) => {
        const ligne = i + 2;
        if (!row.email || !row.prenom || !row.nom || !row.role) {
          return { ok: false as const, ligne, message: 'Champs obligatoires manquants (email, prenom, nom, role)' };
        }
        const role = row.role.toLowerCase().trim();
        if (role !== 'gestionnaire' && role !== 'super_admin') {
          return { ok: false as const, ligne, message: `Rôle invalide "${row.role}" (gestionnaire ou super_admin)` };
        }
        try {
          await apiRequest('/admin/users', {
            method: 'POST',
            token,
            body: JSON.stringify({
              email: row.email,
              name: `${row.prenom} ${row.nom}`.trim(),
              role: role === 'super_admin' ? 'SUPER_ADMIN' : 'GESTIONNAIRE',
            }),
          });
          return { ok: true as const, ligne };
        } catch (e) {
          return { ok: false as const, ligne, message: e instanceof Error ? e.message : 'Erreur API' };
        }
      }),
    );
    let success = 0;
    const errors: { ligne: number; message: string }[] = [];
    for (const r of results) {
      if (r.ok) success++;
      else errors.push({ ligne: r.ligne, message: r.message });
    }
    void refreshUsers();
    return { success, errors };
  };


  const handleCreate = async () => {
    const email = newEmail.trim();
    const prenom = newPrenom.trim();
    const nom = newNom.trim();
    if (!email || !nom || !prenom) {
      toast({
        title: 'Formulaire incomplet',
        description: 'Renseignez le prénom, le nom et l\'adresse e-mail.',
        variant: 'destructive',
      });
      return;
    }
    setCreateAdminSubmitting(true);
    try {
      await apiRequest('/admin/users', {
        method: 'POST',
        token,
        body: JSON.stringify({
          email,
          name: `${prenom} ${nom}`.trim(),
          role: newRole === 'super_admin' ? 'SUPER_ADMIN' : 'GESTIONNAIRE',
        }),
      });
      await refreshUsers();
      setCreateOpen(false);
      setNewEmail(''); setNewNom(''); setNewPrenom(''); setNewTelephone('');
      toast({
        title: 'Administrateur créé',
        description: 'Le compte est enregistré. Le mot de passe temporaire est envoyé par e-mail si le serveur mail est configuré.',
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Une erreur est survenue.';
      toast({ title: 'Création impossible', description: msg, variant: 'destructive' });
    } finally {
      setCreateAdminSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    await apiRequest(`/admin/users/${id}`, { method: 'DELETE', token });
    await refreshUsers();
    toast({ title: '🗑️ Utilisateur supprimé', variant: 'destructive' });
  };

  const handleToggleActif = async (id: string) => {
    const admin = admins.find((a) => a.id === id);
    if (!admin) return;
    await apiRequest(`/admin/users/${id}`, {
      method: 'PATCH',
      token,
      body: JSON.stringify({ is_active: !admin.actif }),
    });
    await refreshUsers();
    toast({ title: !admin.actif ? '✅ Activé' : '⚠️ Désactivé' });
  };

  const handleToggleParentActif = async (userId: string) => {
    const row = parents.find((p) => p.userId === userId);
    if (!row) return;
    await apiRequest(`/admin/users/${userId}`, {
      method: 'PATCH',
      token,
      body: JSON.stringify({ is_active: !row.actif }),
    });
    await refreshUsers();
    toast({ title: !row.actif ? '✅ Activé' : '⚠️ Désactivé' });
  };

  const openEdit = (admin: AdminUser) => { setEditingAdmin({ ...admin }); setEditOpen(true); };

  const handleEdit = async () => {
    if (!editingAdmin) return;
    const email = editingAdmin.email.trim();
    const prenom = editingAdmin.prenom.trim();
    const nom = editingAdmin.nom.trim();
    if (!email || !nom || !prenom) {
      toast({
        title: 'Formulaire incomplet',
        description: 'Renseignez le prénom, le nom et l\'adresse e-mail.',
        variant: 'destructive',
      });
      return;
    }
    setEditAdminSubmitting(true);
    try {
      await apiRequest(`/admin/users/${editingAdmin.id}`, {
        method: 'PATCH',
        token,
        body: JSON.stringify({
          email,
          name: `${prenom} ${nom}`.trim(),
          role: editingAdmin.role === 'super_admin' ? 'SUPER_ADMIN' : 'GESTIONNAIRE',
        }),
      });
      await refreshUsers();
      setEditOpen(false);
      setEditingAdmin(null);
      toast({
        title: 'Modifications enregistrées',
        description:
          'Les informations ont été mises à jour. Si vous avez rétrogradé votre propre compte (super admin → gestionnaire), certaines pages admin afficheront une erreur d’accès.',
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Une erreur est survenue.';
      toast({ title: 'Enregistrement impossible', description: msg, variant: 'destructive' });
    } finally {
      setEditAdminSubmitting(false);
    }
  };

  const handleCreateParent = async () => {
    if (!newParentMatricule || !newParentPrenom || !newParentNom || !newParentService) return;
    await apiRequest('/admin/users', {
      method: 'POST',
      token,
      body: JSON.stringify({
        matricule: newParentMatricule,
        name: `${newParentPrenom} ${newParentNom}`.trim(),
        prenom: newParentPrenom,
        nom: newParentNom,
        role: 'PARENT',
        service: newParentService,
        site_code: newParentSite || null,
        email: newParentEmail || null,
        telephone: newParentTelephone || null,
      }),
    });
    await refreshUsers();
    setCreateParentOpen(false);
    setNewParentMatricule(''); setNewParentPrenom(''); setNewParentNom(''); setNewParentService(''); setNewParentEmail(''); setNewParentTelephone(''); setNewParentSite('');
    toast({ title: '✅ Parent créé' });
  };

  const handleEditParent = async () => {
    if (!editingParent) return;
    const mat = editingParent.matricule.trim();
    if (!mat) {
      toast({ title: 'Matricule requis', variant: 'destructive' });
      return;
    }
    try {
      await apiRequest(`/admin/users/${editingParent.userId}`, {
        method: 'PATCH',
        token,
        body: JSON.stringify({
          name: `${editingParent.prenom} ${editingParent.nom}`.trim(),
          matricule: mat,
          parent_prenom: editingParent.prenom,
          parent_nom: editingParent.nom,
          parent_service: editingParent.service,
          parent_site_code: editingParent.site || null,
          email: editingParent.email || null,
          parent_telephone: editingParent.telephone || null,
        }),
      });
      await refreshUsers();
      setEditParentOpen(false);
      setEditingParent(null);
      toast({ title: 'Parent modifié' });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Une erreur est survenue.';
      toast({ title: 'Enregistrement impossible', description: msg, variant: 'destructive' });
    }
  };

  const handleCSVUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      const lines = text.split('\n').slice(1);
      let count = 0;
      const tasks: Promise<any>[] = [];
      lines.forEach(line => {
        const [matricule, prenom, nom, service] = line.split(',').map(s => s.trim());
        if (matricule && prenom && nom && service) {
          tasks.push(apiRequest('/admin/users', {
            method: 'POST',
            token,
            body: JSON.stringify({
              matricule,
              name: `${prenom} ${nom}`.trim(),
              prenom,
              nom,
              role: 'PARENT',
              service,
            }),
          }).then(() => {
            count++;
          }));
        }
      });
      Promise.allSettled(tasks).then(async () => {
        await refreshUsers();
        toast({ title: `✅ ${count} parent(s) importé(s)` });
      });
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleResetPassword = async () => {
    if (!resetPwdTarget) return;
    if (resetPwdTarget.type === 'admin') {
      await apiRequest(`/admin/users/${resetPwdTarget.id}/reset-password-auto`, {
        method: 'POST',
        token,
      });
    } else {
      const target = parents.find((p) => p.matricule === resetPwdTarget.id);
      if (!target) return;
      await apiRequest(`/admin/users/${target.userId}/reset-password-parent-default`, {
        method: 'POST',
        token,
      });
    }
    setResetPwdOpen(false);
    toast({
      title: '✅ Mot de passe réinitialisé',
      description:
        resetPwdTarget.type === 'parent'
          ? 'Le parent se connecte avec Passer123 puis doit choisir un nouveau mot de passe.'
          : undefined,
    });
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Gestion des utilisateurs</h1>
          <p className="text-muted-foreground mt-1">Gérez les administrateurs et les agents CSS</p>
        </div>
        <Button onClick={() => setImportExcelOpen(true)} variant="outline" className="gap-2 rounded-lg">
          <FileSpreadsheet className="w-4 h-4" />Import Excel
        </Button>
      </motion.div>

      <Tabs defaultValue="admins">
        <TabsList className="rounded-lg">
          <TabsTrigger value="admins" className="gap-2 rounded-lg"><Shield className="w-4 h-4" />Administrateurs</TabsTrigger>
          <TabsTrigger value="parents" className="gap-2 rounded-lg"><Users className="w-4 h-4" />Agents CSS / Parents</TabsTrigger>
        </TabsList>

        <TabsContent value="admins" className="mt-6 space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setCreateOpen(true)} className="gap-2 rounded-lg bg-primary text-primary-foreground">
              <UserPlus className="w-4 h-4" />Nouvel administrateur
            </Button>
          </div>
          <div className="bg-card rounded-xl shadow-card border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="font-semibold">Nom</TableHead>
                  <TableHead className="font-semibold">Prénom</TableHead>
                  <TableHead className="font-semibold">Email</TableHead>
                  <TableHead className="font-semibold">Rôle</TableHead>
                  <TableHead className="font-semibold">Statut</TableHead>
                  <TableHead className="font-semibold">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {admins.map(a => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">{a.nom}</TableCell>
                    <TableCell>{a.prenom}</TableCell>
                    <TableCell className="text-sm">{a.email}</TableCell>
                    <TableCell>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-md ${a.role === 'super_admin' ? 'bg-primary/10 text-primary' : 'bg-accent/10 text-accent'}`}>
                        {a.role === 'super_admin' ? 'Super Admin' : 'Gestionnaire'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch checked={a.actif} onCheckedChange={() => handleToggleActif(a.id)} className="data-[state=checked]:bg-emerald-500" />
                        <span className={`text-xs font-medium ${a.actif ? 'text-emerald-600' : 'text-muted-foreground'}`}>{a.actif ? 'Actif' : 'Inactif'}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => openEdit(a)} className="h-8 w-8 p-0"><Pencil className="w-3 h-3" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => { setResetPwdTarget({ type: 'admin', id: a.id, name: `${a.prenom} ${a.nom}` }); setResetPwdOpen(true); }} className="h-8 w-8 p-0"><KeyRound className="w-3 h-3" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => handleDelete(a.id)} className="h-8 w-8 p-0 text-destructive hover:text-destructive"><Trash2 className="w-3 h-3" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="parents" className="mt-6 space-y-4">
          <div className="flex justify-end gap-2">
            <input ref={fileInputRef} type="file" accept=".csv" onChange={handleCSVUpload} className="hidden" />
            <Button variant="outline" onClick={() => fileInputRef.current?.click()} className="gap-2 rounded-lg">
              <Upload className="w-4 h-4" />Importer CSV
            </Button>
            <Button onClick={() => setCreateParentOpen(true)} className="gap-2 rounded-lg bg-primary text-primary-foreground">
              <UserPlus className="w-4 h-4" />Nouveau parent
            </Button>
          </div>
          <div className="bg-card rounded-xl shadow-card border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="font-semibold">Matricule</TableHead>
                  <TableHead className="font-semibold">Nom</TableHead>
                  <TableHead className="font-semibold">Prénom</TableHead>
                  <TableHead className="font-semibold">Service</TableHead>
                  <TableHead className="font-semibold">Statut</TableHead>
                  <TableHead className="font-semibold">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {parents.map(p => (
                  <TableRow key={p.matricule}>
                    <TableCell className="font-mono tabular-nums text-sm">{p.matricule}</TableCell>
                    <TableCell className="font-medium">{p.nom}</TableCell>
                    <TableCell>{p.prenom}</TableCell>
                    <TableCell className="text-sm">{p.service}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={p.actif}
                          onCheckedChange={() => void handleToggleParentActif(p.userId)}
                          className="data-[state=checked]:bg-emerald-500"
                        />
                        <span className={`text-xs font-medium ${p.actif ? 'text-emerald-600' : 'text-muted-foreground'}`}>
                          {p.actif ? 'Actif' : 'Inactif'}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => { setEditingParent({ ...p }); setEditParentOpen(true); }} className="h-8 w-8 p-0"><Pencil className="w-3 h-3" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => { setResetPwdTarget({ type: 'parent', id: p.matricule, name: `${p.prenom} ${p.nom}` }); setResetPwdOpen(true); }} className="h-8 w-8 p-0"><KeyRound className="w-3 h-3" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => void handleDeleteParent(p.userId)} className="h-8 w-8 p-0 text-destructive hover:text-destructive"><Trash2 className="w-3 h-3" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="bg-accent/5 border border-accent/20 rounded-lg p-3">
            <p className="text-xs text-muted-foreground">
              <strong className="text-accent">📄 Format CSV :</strong> matricule, prenom, nom, service (une ligne par parent, avec en-tête).
            </p>
          </div>
        </TabsContent>
      </Tabs>

      {/* Create Admin */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md rounded-xl">
          <DialogHeader><DialogTitle>Nouvel administrateur</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Prénom</Label><Input value={newPrenom} onChange={e => setNewPrenom(e.target.value)} className="rounded-lg" /></div>
              <div className="space-y-2"><Label>Nom</Label><Input value={newNom} onChange={e => setNewNom(e.target.value)} className="rounded-lg" /></div>
            </div>
            <div className="space-y-2"><Label>Email</Label><Input value={newEmail} onChange={e => setNewEmail(e.target.value)} type="email" className="rounded-lg" /></div>
            <div className="space-y-2"><Label>Téléphone</Label><Input value={newTelephone} onChange={e => setNewTelephone(e.target.value)} placeholder="77 123 45 67" className="rounded-lg" /></div>
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
              <p className="text-xs text-muted-foreground">Le mot de passe administrateur est généré automatiquement et envoyé par e-mail.</p>
            </div>
            <div className="space-y-2">
              <Label>Rôle</Label>
              <Select value={newRole} onValueChange={(v: any) => setNewRole(v)}>
                <SelectTrigger className="rounded-lg"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="gestionnaire">Gestionnaire</SelectItem>
                  <SelectItem value="super_admin">Super Administrateur</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} className="rounded-lg" disabled={createAdminSubmitting}>Annuler</Button>
            <Button onClick={() => void handleCreate()} disabled={createAdminSubmitting} className="rounded-lg bg-primary text-primary-foreground gap-2">
              {createAdminSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {createAdminSubmitting ? 'Création…' : 'Créer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Admin */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md rounded-xl">
          <DialogHeader><DialogTitle>Modifier l'administrateur</DialogTitle></DialogHeader>
          {editingAdmin && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Prénom</Label><Input value={editingAdmin.prenom} onChange={e => setEditingAdmin({ ...editingAdmin, prenom: e.target.value })} className="rounded-lg" /></div>
                <div className="space-y-2"><Label>Nom</Label><Input value={editingAdmin.nom} onChange={e => setEditingAdmin({ ...editingAdmin, nom: e.target.value })} className="rounded-lg" /></div>
              </div>
              <div className="space-y-2"><Label>Email</Label><Input value={editingAdmin.email} onChange={e => setEditingAdmin({ ...editingAdmin, email: e.target.value })} className="rounded-lg" /></div>
              <div className="space-y-2"><Label>Téléphone</Label><Input value={editingAdmin.telephone || ''} onChange={e => setEditingAdmin({ ...editingAdmin, telephone: e.target.value })} className="rounded-lg" /></div>
              <div className="space-y-2">
                <Label>Rôle</Label>
                <Select value={editingAdmin.role} onValueChange={(v: any) => setEditingAdmin({ ...editingAdmin, role: v })}>
                  <SelectTrigger className="rounded-lg"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gestionnaire">Gestionnaire</SelectItem>
                    <SelectItem value="super_admin">Super Administrateur</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)} className="rounded-lg" disabled={editAdminSubmitting}>Annuler</Button>
            <Button onClick={() => void handleEdit()} disabled={editAdminSubmitting} className="rounded-lg bg-primary text-primary-foreground gap-2">
              {editAdminSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {editAdminSubmitting ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Parent */}
      <Dialog open={createParentOpen} onOpenChange={setCreateParentOpen}>
        <DialogContent className="sm:max-w-md rounded-xl">
          <DialogHeader><DialogTitle>Nouveau parent / Agent CSS</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Matricule</Label><Input value={newParentMatricule} onChange={e => setNewParentMatricule(e.target.value)} placeholder="CSS-2024-XXX" className="rounded-lg" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Prénom</Label><Input value={newParentPrenom} onChange={e => setNewParentPrenom(e.target.value)} className="rounded-lg" /></div>
              <div className="space-y-2"><Label>Nom</Label><Input value={newParentNom} onChange={e => setNewParentNom(e.target.value)} className="rounded-lg" /></div>
            </div>
            <div className="space-y-2">
              <Label>Service</Label>
              <Select value={newParentService} onValueChange={setNewParentService}>
                <SelectTrigger className="rounded-lg"><SelectValue placeholder="Sélectionner un service" /></SelectTrigger>
                <SelectContent className="max-h-56 overflow-y-auto">
                  {services.map(s => (
                    <SelectItem key={s.id} value={s.nom}>{s.nom}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Site</Label>
              <Select value={newParentSite} onValueChange={setNewParentSite}>
                <SelectTrigger className="rounded-lg"><SelectValue placeholder="Sélectionner un site" /></SelectTrigger>
                <SelectContent className="max-h-56 overflow-y-auto">
                  {sites.map(s => (
                    <SelectItem key={s.id} value={s.code}>{s.nom}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Email</Label><Input value={newParentEmail} onChange={e => setNewParentEmail(e.target.value)} type="email" className="rounded-lg" /></div>
              <div className="space-y-2"><Label>Téléphone</Label><Input value={newParentTelephone} onChange={e => setNewParentTelephone(e.target.value)} className="rounded-lg" /></div>
            </div>
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
              <p className="text-xs text-muted-foreground">Le mot de passe parent par défaut est `Passer123` (changement conseillé à la première connexion).</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateParentOpen(false)} className="rounded-lg">Annuler</Button>
            <Button onClick={handleCreateParent} className="rounded-lg bg-primary text-primary-foreground">Créer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Parent */}
      <Dialog open={editParentOpen} onOpenChange={setEditParentOpen}>
        <DialogContent className="sm:max-w-md rounded-xl">
          <DialogHeader><DialogTitle>Modifier le parent</DialogTitle></DialogHeader>
          {editingParent && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Matricule</Label>
                <Input
                  value={editingParent.matricule}
                  onChange={(e) => setEditingParent({ ...editingParent, matricule: e.target.value })}
                  className="rounded-lg font-mono tabular-nums"
                  placeholder="Identifiant de connexion parent"
                />
                <p className="text-xs text-muted-foreground">
                  Même valeur en base sur le compte utilisateur et le profil parent : c&apos;est ce matricule qui sert à la connexion.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Prénom</Label><Input value={editingParent.prenom} onChange={e => setEditingParent({ ...editingParent, prenom: e.target.value })} className="rounded-lg" /></div>
                <div className="space-y-2"><Label>Nom</Label><Input value={editingParent.nom} onChange={e => setEditingParent({ ...editingParent, nom: e.target.value })} className="rounded-lg" /></div>
              </div>
              <div className="space-y-2">
                <Label>Service</Label>
                <Select value={editingParent.service} onValueChange={v => setEditingParent({ ...editingParent, service: v })}>
                  <SelectTrigger className="rounded-lg"><SelectValue placeholder="Sélectionner un service" /></SelectTrigger>
                  <SelectContent className="max-h-56 overflow-y-auto">
                    {services.map(s => (
                      <SelectItem key={s.id} value={s.nom}>{s.nom}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Site</Label>
                <Select value={editingParent.site || ''} onValueChange={v => setEditingParent({ ...editingParent, site: v })}>
                  <SelectTrigger className="rounded-lg"><SelectValue placeholder="Sélectionner un site" /></SelectTrigger>
                  <SelectContent className="max-h-56 overflow-y-auto">
                    {sites.map(s => (
                      <SelectItem key={s.id} value={s.code}>{s.nom}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Email</Label><Input value={editingParent.email || ''} onChange={e => setEditingParent({ ...editingParent, email: e.target.value })} className="rounded-lg" /></div>
                <div className="space-y-2"><Label>Téléphone</Label><Input value={editingParent.telephone || ''} onChange={e => setEditingParent({ ...editingParent, telephone: e.target.value })} className="rounded-lg" /></div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditParentOpen(false)} className="rounded-lg">Annuler</Button>
            <Button onClick={handleEditParent} className="rounded-lg bg-primary text-primary-foreground">Enregistrer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Password */}
      <Dialog open={resetPwdOpen} onOpenChange={setResetPwdOpen}>
        <DialogContent className="sm:max-w-md rounded-xl">
          <DialogHeader>
            <DialogTitle>Réinitialiser le mot de passe</DialogTitle>
          </DialogHeader>
          {resetPwdTarget?.type === 'admin' ? (
            <p className="text-sm text-muted-foreground">
              Un mot de passe temporaire sera généré automatiquement puis envoyé par e-mail à <strong>{resetPwdTarget?.name}</strong>.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Le mot de passe de <strong>{resetPwdTarget?.name}</strong> sera réinitialisé à <strong>Passer123</strong>. À la
              prochaine connexion avec le matricule et ce mot de passe, le parent devra obligatoirement en définir un nouveau.
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetPwdOpen(false)} className="rounded-lg">Annuler</Button>
            <Button onClick={handleResetPassword} className="rounded-lg bg-primary text-primary-foreground">Réinitialiser</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ImportExcel
        open={importExcelOpen}
        onOpenChange={setImportExcelOpen}
        entities={[
          { value: 'parents', config: { label: 'Parents / Agents CSS', colonnes: ['matricule', 'prenom', 'nom', 'service', 'site', 'email', 'telephone'], description: 'Colonnes requises : matricule, prenom, nom, service. Optionnelles : site, email, telephone.' }, onImport: handleImportParents },
          { value: 'admins', config: { label: 'Administrateurs', colonnes: ['email', 'prenom', 'nom', 'role', 'telephone'], description: 'Colonnes requises : email, prenom, nom, role (gestionnaire ou super_admin). Optionnelle : telephone.' }, onImport: handleImportAdmins },
        ]}
      />
    </div>
  );
}
