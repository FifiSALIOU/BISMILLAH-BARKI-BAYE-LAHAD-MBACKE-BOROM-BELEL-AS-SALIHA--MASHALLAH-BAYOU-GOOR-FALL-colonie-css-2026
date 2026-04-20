import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Filter, History } from 'lucide-react';
import { useState } from 'react';
import { apiRequest } from '@/lib/api';

export default function Historique() {
  const { token } = useAuth();
  const [historique, setHistorique] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRole, setFilterRole] = useState('all');

  useEffect(() => {
    if (!token) return;
    apiRequest<any[]>('/admin/historique', { token }).then(setHistorique).catch(() => undefined);
  }, [token]);

  const filtered = historique.filter(h => {
    const matchSearch = searchTerm === '' ||
      h.utilisateur.toLowerCase().includes(searchTerm.toLowerCase()) ||
      h.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
      h.details.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (h.cible || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchRole = filterRole === 'all' || h.role.toLowerCase() === filterRole.toLowerCase();
    return matchSearch && matchRole;
  });

  return (
    <TooltipProvider delayDuration={300}>
    <div className="max-w-7xl mx-auto space-y-6">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center"><History className="w-5 h-5 text-primary" /></div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Historique</h1>
            <p className="text-muted-foreground mt-1">{historique.length} action(s) enregistrée(s) — Toutes les activités entre parents, gestionnaire et super admin</p>
          </div>
        </div>
      </motion.div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Rechercher par utilisateur, action, cible..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-9 rounded-lg" />
        </div>
        <Select value={filterRole} onValueChange={setFilterRole}>
          <SelectTrigger className="w-[160px] rounded-lg"><Filter className="w-3 h-3 mr-2" /><SelectValue placeholder="Rôle" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous</SelectItem>
            <SelectItem value="parent">Parent</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-card rounded-xl shadow-card border border-border">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="font-semibold">Utilisateur</TableHead>
                <TableHead className="font-semibold">Rôle</TableHead>
                <TableHead className="font-semibold">Action</TableHead>
                <TableHead className="font-semibold">Détails</TableHead>
                <TableHead className="font-semibold">Cible</TableHead>
                <TableHead className="font-semibold">Date</TableHead>
                <TableHead className="font-semibold">Heure</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Aucun historique</TableCell></TableRow>
              ) : (
                filtered.map(h => (
                  <TableRow key={h.id}>
                    <TableCell className="font-medium text-foreground">{h.utilisateur}</TableCell>
                    <TableCell>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-md ${h.role === 'Parent' ? 'bg-accent/10 text-accent' : 'bg-primary/10 text-primary'}`}>{h.role}</span>
                    </TableCell>
                    <TableCell className="text-sm">{h.action}</TableCell>
                    <TableCell className="text-sm text-muted-foreground min-w-[200px] max-w-md align-top">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="block cursor-help whitespace-normal break-words underline decoration-dotted decoration-muted-foreground/50 underline-offset-2">
                            {h.details}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-md whitespace-pre-wrap text-left">
                          {h.details}
                        </TooltipContent>
                      </Tooltip>
                    </TableCell>
                    <TableCell className="text-sm font-medium">{h.cible || '—'}</TableCell>
                    <TableCell className="tabular-nums text-sm">{new Date(h.date).toLocaleDateString('fr-FR')}</TableCell>
                    <TableCell className="tabular-nums text-sm">{h.heure}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </motion.div>
    </div>
    </TooltipProvider>
  );
}
