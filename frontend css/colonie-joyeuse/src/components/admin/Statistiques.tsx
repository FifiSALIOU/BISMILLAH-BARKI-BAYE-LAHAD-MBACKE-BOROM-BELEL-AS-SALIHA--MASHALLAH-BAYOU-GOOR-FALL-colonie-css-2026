import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useInscription } from '@/contexts/InscriptionContext';
import { Users, UserCheck, BarChart3, TrendingUp } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { apiRequest } from '@/lib/api';
import { listeUiToApi } from '@/lib/listeCodes';

export default function Statistiques() {
  const { enfants } = useInscription();
  const { token } = useAuth();
  const [statsApi, setStatsApi] = useState<any>(null);
  const [serviceStats, setServiceStats] = useState<Record<string, number>>({});
  const [garcons, setGarcons] = useState(0);
  const [filles, setFilles] = useState(0);

  useEffect(() => {
    if (!token) return;
    // `/admin/users` est réservé au super admin : ne pas l’inclure ici (sinon échec total pour le gestionnaire).
    Promise.all([
      apiRequest('/admin/stats', { token }),
      apiRequest<any[]>(`/admin/listes/${listeUiToApi('principale')}/demandes`, { token }),
      apiRequest<any[]>(`/admin/listes/${listeUiToApi('attente_n1')}/demandes`, { token }),
      apiRequest<any[]>(`/admin/listes/${listeUiToApi('attente_n2')}/demandes`, { token }),
    ])
      .then(([stats, principaleRows, n1Rows, n2Rows]) => {
        setStatsApi(stats);
        const all = [...principaleRows, ...n1Rows, ...n2Rows];
        const byService: Record<string, number> = {};
        all.forEach((r) => {
          const s = (r?.parent_service as string | undefined)?.trim() || 'Non défini';
          byService[s] = (byService[s] || 0) + 1;
        });
        setServiceStats(byService);
        const isM = (sexe: unknown) => sexe === 'M' || sexe === 'MASCULIN';
        const isF = (sexe: unknown) => sexe === 'F' || sexe === 'FEMININ';
        setGarcons(all.filter((r) => isM(r?.enfant?.sexe)).length);
        setFilles(all.filter((r) => isF(r?.enfant?.sexe)).length);
      })
      .catch(() => undefined);
  }, [token]);

  const principale = useMemo(() => {
    if (!statsApi) return enfants.filter(e => e.liste === 'principale').length;
    const ibl = statsApi.inscriptions_by_liste;
    const sbl = statsApi.selected_by_liste;
    return ibl?.principale ?? sbl?.PRINCIPALE ?? sbl?.principale ?? 0;
  }, [statsApi, enfants]);
  const n1 = useMemo(() => {
    if (!statsApi) return enfants.filter(e => e.liste === 'attente_n1').length;
    const ibl = statsApi.inscriptions_by_liste;
    const sbl = statsApi.selected_by_liste;
    return ibl?.attente_n1 ?? sbl?.ATTENTE_N1 ?? sbl?.attente_n1 ?? 0;
  }, [statsApi, enfants]);
  const n2 = useMemo(() => {
    if (!statsApi) return enfants.filter(e => e.liste === 'attente_n2').length;
    const ibl = statsApi.inscriptions_by_liste;
    const sbl = statsApi.selected_by_liste;
    return ibl?.attente_n2 ?? sbl?.ATTENTE_N2 ?? sbl?.attente_n2 ?? 0;
  }, [statsApi, enfants]);
  const totalParents = statsApi?.total_parents ?? new Set(enfants.map(e => e.parentMatricule)).size;
  const totalEnfants = statsApi?.total_enfants ?? enfants.length;

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-bold text-foreground">Statistiques</h1>
        <p className="text-muted-foreground mt-1">Données analytiques de la Colonie de Vacances 2026</p>
      </motion.div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total enfants', value: totalEnfants, icon: Users, color: 'text-primary', bg: 'bg-primary/10' },
          { label: 'Parents inscrits', value: totalParents, icon: UserCheck, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Garçons', value: garcons, icon: BarChart3, color: 'text-primary', bg: 'bg-primary/10' },
          { label: 'Filles', value: filles, icon: TrendingUp, color: 'text-accent', bg: 'bg-accent/10' },
        ].map((s, i) => (
          <motion.div key={s.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * i }}
            className="bg-card rounded-2xl shadow-card border border-border p-5">
            <div className="flex items-start justify-between mb-4">
              <p className="text-sm font-medium text-muted-foreground leading-tight max-w-[60%]">{s.label}</p>
              <div className={`w-10 h-10 rounded-full ${s.bg} flex items-center justify-center shrink-0`}>
                <s.icon className={`w-5 h-5 ${s.color}`} />
              </div>
            </div>
            <span className="text-xl font-bold text-foreground">{s.value}</span>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Gender breakdown */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
          className="bg-card rounded-xl shadow-card border border-border p-6">
          <h3 className="text-lg font-semibold text-foreground mb-4">Répartition par sexe</h3>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between mb-1">
                <span className="text-sm text-muted-foreground">Garçons</span>
                <span className="text-sm font-medium text-foreground">{garcons} ({totalEnfants > 0 ? Math.round((garcons / totalEnfants) * 100) : 0}%)</span>
              </div>
              <div className="h-3 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${totalEnfants > 0 ? (garcons / totalEnfants) * 100 : 0}%` }} />
              </div>
            </div>
            <div>
              <div className="flex justify-between mb-1">
                <span className="text-sm text-muted-foreground">Filles</span>
                <span className="text-sm font-medium text-foreground">{filles} ({totalEnfants > 0 ? Math.round((filles / totalEnfants) * 100) : 0}%)</span>
              </div>
              <div className="h-3 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-accent rounded-full transition-all" style={{ width: `${totalEnfants > 0 ? (filles / totalEnfants) * 100 : 0}%` }} />
              </div>
            </div>
          </div>
        </motion.div>

        {/* By service */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
          className="bg-card rounded-xl shadow-card border border-border p-6">
          <h3 className="text-lg font-semibold text-foreground mb-4">Inscriptions par service</h3>
          <div className="space-y-3">
            {Object.entries(serviceStats).map(([service, count]) => (
              <div key={service} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                <span className="text-sm text-foreground">{service}</span>
                <span className="text-sm font-bold text-foreground tabular-nums">{count}</span>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Lists breakdown */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
          className="bg-card rounded-xl shadow-card border border-border p-6 lg:col-span-2">
          <h3 className="text-lg font-semibold text-foreground mb-4">Répartition par liste</h3>
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Principale', value: principale, color: 'bg-emerald-500', bg: 'bg-emerald-50', text: 'text-emerald-700' },
              { label: "Liste d'attente N°1", value: n1, color: 'bg-accent', bg: 'bg-accent/10', text: 'text-accent' },
              { label: "Liste d'attente N°2", value: n2, color: 'bg-primary', bg: 'bg-primary/10', text: 'text-primary' },
            ].map(l => (
              <div key={l.label} className={`${l.bg} rounded-xl p-5 text-center`}>
                <span className={`text-3xl font-bold ${l.text}`}>{l.value}</span>
                <p className={`text-sm mt-1 ${l.text} opacity-80`}>{l.label}</p>
                <div className={`w-8 h-1 ${l.color} rounded-full mx-auto mt-3`} />
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
