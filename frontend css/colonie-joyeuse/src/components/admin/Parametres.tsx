import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Calendar, Settings2, Shield, Mail } from 'lucide-react';
import { useInscription } from '@/contexts/InscriptionContext';
import { toast } from '@/hooks/use-toast';
import { Checkbox } from '@/components/ui/checkbox';
import { useAuth } from '@/contexts/AuthContext';
import { apiRequest } from '@/lib/api';
import type { AppSettings } from '@/data/mockData';

function isAbortError(e: unknown): boolean {
  if (e instanceof DOMException && e.name === 'AbortError') return true;
  if (e instanceof Error && e.name === 'AbortError') return true;
  return false;
}

export default function Parametres() {
  const { settings, updateSettings } = useInscription();
  const { token } = useAuth();
  const dirtyRef = useRef(false);
  const [capaciteNonDefini, setCapaciteNonDefini] = useState(settings.capaciteMax === null);
  const [maxEnfantsNonDefini, setMaxEnfantsNonDefini] = useState(settings.maxEnfantsParParent === null);

  const patchSettings = (p: Partial<AppSettings>) => {
    dirtyRef.current = true;
    updateSettings(p);
  };

  useEffect(() => {
    if (!token) return;
    const ac = new AbortController();
    dirtyRef.current = false;
    apiRequest<any>('/admin/settings', { token, signal: ac.signal })
      .then((cfg) => {
        if (!dirtyRef.current) {
          updateSettings(cfg);
          setCapaciteNonDefini(cfg.capaciteMax === null);
          setMaxEnfantsNonDefini(cfg.maxEnfantsParParent === null);
        }
      })
      .catch((e: unknown) => {
        if (isAbortError(e)) return;
      });
    return () => ac.abort();
  }, [token]);

  const handleSave = async () => {
    if (!token) return;
    try {
      await apiRequest('/admin/settings', {
        method: 'PUT',
        token,
        body: JSON.stringify(settings),
      });
      const cfg = await apiRequest<any>('/admin/settings', { token });
      dirtyRef.current = false;
      updateSettings(cfg);
      setCapaciteNonDefini(cfg.capaciteMax === null);
      setMaxEnfantsNonDefini(cfg.maxEnfantsParParent === null);
      toast({ title: '✅ Paramètres enregistrés', description: 'Les paramètres ont été mis à jour avec succès.' });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erreur lors de l\'enregistrement.';
      toast({ title: 'Enregistrement impossible', description: msg, variant: 'destructive' });
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-bold text-foreground">Paramètres</h1>
        <p className="text-muted-foreground mt-1">Configuration de la Colonie de Vacances</p>
      </motion.div>

      <div className="space-y-6">
        {/* General */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-card rounded-xl shadow-card border border-border p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center"><Settings2 className="w-5 h-5 text-primary" /></div>
            <h3 className="text-lg font-semibold text-foreground">Général</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2 sm:col-span-2">
              <Label className="text-foreground">Nom de la colonie</Label>
              <Input value={settings.colonieNom} onChange={e => patchSettings({ colonieNom: e.target.value })} className="rounded-lg" />
            </div>
            <div className="space-y-2">
              <Label className="text-foreground">Capacité maximale (liste finale)</Label>
              <div className="flex items-center gap-3">
                <Input
                  type="number"
                  value={capaciteNonDefini ? '' : (settings.capaciteMax ?? '')}
                  onChange={e => patchSettings({ capaciteMax: parseInt(e.target.value) || 100 })}
                  disabled={capaciteNonDefini}
                  placeholder={capaciteNonDefini ? 'Non défini' : '100'}
                  className="rounded-lg"
                />
              </div>
              <div className="flex items-center gap-2 mt-1">
                <Checkbox
                  checked={capaciteNonDefini}
                  onCheckedChange={(checked) => {
                    setCapaciteNonDefini(!!checked);
                    patchSettings({ capaciteMax: checked ? null : 100 });
                  }}
                />
                <span className="text-xs text-muted-foreground">Non défini (pas de limite)</span>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-foreground">Max enfants par parent</Label>
              <div className="flex items-center gap-3">
                <Input
                  type="number"
                  value={maxEnfantsNonDefini ? '' : (settings.maxEnfantsParParent ?? '')}
                  onChange={e => patchSettings({ maxEnfantsParParent: parseInt(e.target.value) || 2 })}
                  disabled={maxEnfantsNonDefini}
                  placeholder={maxEnfantsNonDefini ? 'Non défini' : '2'}
                  className="rounded-lg"
                />
              </div>
              <div className="flex items-center gap-2 mt-1">
                <Checkbox
                  checked={maxEnfantsNonDefini}
                  onCheckedChange={(checked) => {
                    setMaxEnfantsNonDefini(!!checked);
                    patchSettings({ maxEnfantsParParent: checked ? null : 2 });
                  }}
                />
                <span className="text-xs text-muted-foreground">Non défini (pas de limite)</span>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Dates inscriptions */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="bg-card rounded-xl shadow-card border border-border p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center"><Calendar className="w-5 h-5 text-accent" /></div>
            <h3 className="text-lg font-semibold text-foreground">Période d'inscription</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-foreground">Date de début des inscriptions</Label>
              <Input type="date" value={settings.dateDebutInscriptions} onChange={e => patchSettings({ dateDebutInscriptions: e.target.value })} className="rounded-lg" />
            </div>
            <div className="space-y-2">
              <Label className="text-foreground">Heure d'ouverture</Label>
              <Input type="time" value={settings.heureDebutInscriptions || '00:00'} onChange={e => patchSettings({ heureDebutInscriptions: e.target.value || '00:00' })} className="rounded-lg" />
            </div>
            <div className="space-y-2">
              <Label className="text-foreground">Date de fin des inscriptions</Label>
              <Input type="date" value={settings.dateFinInscriptions} onChange={e => patchSettings({ dateFinInscriptions: e.target.value })} className="rounded-lg" />
            </div>
            <div className="space-y-2">
              <Label className="text-foreground">Heure de clôture</Label>
              <Input type="time" value={settings.heureFinInscriptions || '23:59'} onChange={e => patchSettings({ heureFinInscriptions: e.target.value || '23:59' })} className="rounded-lg" />
            </div>
          </div>
          <div className="mt-4 bg-accent/5 border border-accent/20 rounded-lg p-3">
            <p className="text-xs text-muted-foreground"><strong className="text-accent">💡 Astuce :</strong> Pour prolonger la période d'inscription, modifiez la date de fin. Les parents pourront continuer à s'inscrire jusqu'à cette nouvelle date.</p>
          </div>
        </motion.div>

        {/* Dates colonie */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-card rounded-xl shadow-card border border-border p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center"><Calendar className="w-5 h-5 text-emerald-600" /></div>
            <h3 className="text-lg font-semibold text-foreground">Dates & Tranches d'âge de la colonie</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-foreground">Date de début de la colonie</Label>
              <Input type="date" value={settings.dateDebutColonie} onChange={e => patchSettings({ dateDebutColonie: e.target.value })} className="rounded-lg" />
            </div>
            <div className="space-y-2">
              <Label className="text-foreground">Date de fin de la colonie</Label>
              <Input type="date" value={settings.dateFinColonie} onChange={e => patchSettings({ dateFinColonie: e.target.value })} className="rounded-lg" />
            </div>
            <div className="space-y-2">
              <Label className="text-foreground">Année de naissance min</Label>
              <Input type="number" value={settings.ageMin} onChange={e => patchSettings({ ageMin: parseInt(e.target.value) || 2012 })} className="rounded-lg" />
            </div>
            <div className="space-y-2">
              <Label className="text-foreground">Année de naissance max</Label>
              <Input type="number" value={settings.ageMax} onChange={e => patchSettings({ ageMax: parseInt(e.target.value) || 2019 })} className="rounded-lg" />
            </div>
          </div>
        </motion.div>

        {/* Status */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="bg-card rounded-xl shadow-card border border-border p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center"><Shield className="w-5 h-5 text-emerald-600" /></div>
            <h3 className="text-lg font-semibold text-foreground">Statut des inscriptions</h3>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-4 rounded-lg bg-muted/30">
              <div>
                <p className="font-medium text-foreground">Inscriptions ouvertes</p>
                <p className="text-sm text-muted-foreground">Les parents peuvent actuellement inscrire leurs enfants</p>
              </div>
              <Switch checked={settings.inscriptionsOuvertes} onCheckedChange={v => patchSettings({ inscriptionsOuvertes: v })} />
            </div>
            <div className="flex items-center justify-between p-4 rounded-lg bg-muted/30">
              <div>
                <p className="font-medium text-foreground">Accès plateforme parents</p>
                <p className="text-sm text-muted-foreground">Autoriser les parents à se connecter à leur espace. Si désactivé, aucun parent ne pourra accéder à la plateforme.</p>
              </div>
              <Switch checked={settings.accesParentsActif} onCheckedChange={v => patchSettings({ accesParentsActif: v })} />
            </div>
          </div>
        </motion.div>

        {/* Email config */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="bg-card rounded-xl shadow-card border border-border p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center"><Mail className="w-5 h-5 text-primary" /></div>
            <h3 className="text-lg font-semibold text-foreground">Notifications e-mail</h3>
          </div>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Les notifications e-mail suivantes sont configurées :</p>
            <div className="space-y-2">
              {[
                { label: 'Confirmation d\'inscription', desc: 'Envoyé au parent et aux admins à chaque nouvelle inscription' },
                { label: 'Changement de titulaire', desc: 'Envoyé quand le parent modifie l\'enfant titulaire' },
                { label: 'Désistement demandé', desc: 'Envoyé aux admins quand un parent demande un désistement' },
                { label: 'Désistement validé', desc: 'Envoyé au parent quand l\'admin valide le désistement' },
                { label: 'Sélection finale', desc: 'Envoyé au parent quand son enfant est retenu ou non' },
                { label: 'Transfert de liste', desc: 'Envoyé au parent quand sa demande est transférée' },
              ].map(n => (
                <div key={n.label} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                  <div>
                    <p className="text-sm font-medium text-foreground">{n.label}</p>
                    <p className="text-xs text-muted-foreground">{n.desc}</p>
                  </div>
                  <Switch defaultChecked className="data-[state=checked]:bg-emerald-500" />
                </div>
              ))}
            </div>
            <div className="bg-primary/5 border border-primary/10 rounded-lg p-3 mt-4">
              <p className="text-xs text-muted-foreground">
                <strong className="text-primary">ℹ️ Note :</strong> Pour activer l'envoi réel des e-mails, connectez Lovable Cloud pour configurer le service de messagerie.
              </p>
            </div>
          </div>
        </motion.div>

        <div className="flex justify-end">
          <Button onClick={handleSave} className="rounded-lg bg-primary text-primary-foreground hover:bg-primary/90">Enregistrer les paramètres</Button>
        </div>
      </div>
    </div>
  );
}
