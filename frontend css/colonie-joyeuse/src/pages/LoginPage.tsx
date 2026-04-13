import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { useInscription } from '@/contexts/InscriptionContext';
import { apiRequest } from '@/lib/api';
import type { AppSettings } from '@/data/mockData';
import logo from '@/assets/logo.png';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { KeyRound, AlertTriangle, Lock, Eye, EyeOff, Info } from 'lucide-react';

export default function LoginPage() {
  const { loginAsParent, loginAsAdmin } = useAuth();
  const { settings, updateSettings } = useInscription();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [errorOpen, setErrorOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [errorTitle, setErrorTitle] = useState('');

  useEffect(() => {
    let cancelled = false;
    apiRequest<Partial<AppSettings>>('/auth/public-settings')
      .then((cfg) => {
        if (!cancelled && cfg && typeof cfg === 'object') updateSettings(cfg);
      })
      .catch(() => {
        /* garder DEFAULT_SETTINGS du contexte */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const today = new Date().toISOString().split('T')[0];
  const inscriptionsClosed = !settings.inscriptionsOuvertes || today > settings.dateFinInscriptions;
  const inscriptionsNotStarted = today < settings.dateDebutInscriptions;

  const isEmail = (val: string) => val.includes('@');

  const handleLogin = async () => {
    const trimmed = identifier.trim();
    if (!trimmed || !password) {
      setErrorTitle("Champs requis");
      setErrorMessage("Veuillez saisir votre matricule (ou e-mail) et votre mot de passe.");
      setErrorOpen(true);
      return;
    }

    if (isEmail(trimmed)) {
      try {
        await loginAsAdmin(trimmed, password);
      } catch (e) {
        setErrorTitle("Erreur d'authentification");
        setErrorMessage(e instanceof Error ? e.message : "Les identifiants saisis sont incorrects.");
        setErrorOpen(true);
      }
    } else {
      // Parent login by matricule
      if (!settings.accesParentsActif) {
        setErrorTitle("Accès désactivé");
        setErrorMessage("L'accès à la plateforme parents est actuellement désactivé par l'administration. Veuillez réessayer ultérieurement.");
        setErrorOpen(true);
        return;
      }
      if (inscriptionsNotStarted) {
        setErrorTitle("Inscriptions pas encore ouvertes");
        setErrorMessage(`La période d'inscription pour la Colonie de Vacances 2026 n'a pas encore commencé. Les inscriptions ouvriront le ${new Date(settings.dateDebutInscriptions).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}. Veuillez patienter jusqu'à cette date.`);
        setErrorOpen(true);
        return;
      }

      try {
        await loginAsParent(trimmed, password);
      } catch (e) {
        setErrorTitle("Erreur d'authentification");
        setErrorMessage(e instanceof Error ? e.message : "Les identifiants saisis sont incorrects.");
        setErrorOpen(true);
      }
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-accent/10 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full bg-primary/5 blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md relative z-10"
      >
        <div className="bg-card rounded-xl shadow-elevated p-8 space-y-6">
          <div className="text-center space-y-3">
            <motion.img
              src={logo}
              alt="Logo CSS"
              className="w-20 h-20 mx-auto object-contain"
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.1, type: "spring", stiffness: 200 }}
            />
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">Colonie de Vacances 2026</h1>
              <p className="text-muted-foreground mt-1 text-sm">Connectez-vous avec votre matricule ou e-mail</p>
            </div>
          </div>

          {inscriptionsNotStarted && (
            <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 text-center">
              <Info className="w-4 h-4 text-primary mx-auto mb-1" />
              <p className="text-xs font-medium text-primary">Les inscriptions ouvriront le {new Date(settings.dateDebutInscriptions).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}.</p>
            </div>
          )}

          {inscriptionsClosed && !inscriptionsNotStarted && (
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 text-center">
              <p className="text-xs font-medium text-destructive">⚠️ Les inscriptions sont fermées depuis le {new Date(settings.dateFinInscriptions).toLocaleDateString('fr-FR')}.</p>
            </div>
          )}

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: 0.15 }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="identifier" className="text-foreground font-medium">N° Matricule ou E-mail</Label>
              <div className="relative">
                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input id="identifier" placeholder="Saisissez votre numéro matricule ou Email" value={identifier} onChange={e => setIdentifier(e.target.value)} className="pl-10 h-11 rounded-lg" />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-foreground font-medium">Mot de passe</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input id="password" type={showPwd ? 'text' : 'password'} placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleLogin()} className="pl-10 pr-10 h-11 rounded-lg" />
                <button type="button" onClick={() => setShowPwd(!showPwd)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <Button onClick={handleLogin} className="w-full h-11 rounded-lg bg-brand-navy text-primary-foreground hover:bg-brand-navy/90 font-semibold">
              Se connecter
            </Button>

            {/* <button onClick={() => setAuthStep('forgot_password')} className="w-full text-sm text-brand-navy hover:text-brand-navy/80 transition-colors font-medium">
              🔑 Mot de passe oublié ?
            </button> */}

            <div className="bg-primary/5 rounded-lg p-3 border border-primary/20">
              <p className="text-xs text-muted-foreground">
                <strong className="text-primary">📌 Note :</strong> Parent : matricule + mot de passe (par défaut <strong>Passer123</strong>). Administration : e-mail + mot de passe.
              </p>
            </div>

            
          </motion.div>
        </div>
      </motion.div>

      <Dialog open={errorOpen} onOpenChange={setErrorOpen}>
        <DialogContent className="sm:max-w-md rounded-xl">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-destructive/10 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-destructive" />
              </div>
              <DialogTitle className="text-foreground">{errorTitle}</DialogTitle>
            </div>
            <DialogDescription className="text-muted-foreground pt-2">{errorMessage}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setErrorOpen(false)} className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg">Compris</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
