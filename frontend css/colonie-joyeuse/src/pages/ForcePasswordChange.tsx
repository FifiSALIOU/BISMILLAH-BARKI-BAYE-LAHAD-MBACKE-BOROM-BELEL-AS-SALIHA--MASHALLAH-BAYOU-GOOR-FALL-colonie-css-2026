import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { AlertTriangle, Lock, CheckCircle2 } from 'lucide-react';
import logo from '@/assets/logo.png';
import { apiRequest } from '@/lib/api';

export default function ForcePasswordChange() {
  const { pendingParent, pendingAdminFirstLogin, setAuthStep, setPendingParent, setPendingAdminFirstLogin, token } = useAuth();
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [errorOpen, setErrorOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successOpen, setSuccessOpen] = useState(false);

  const handleSubmit = async () => {
    if (!newPwd || !confirmPwd) {
      setErrorMessage('Veuillez remplir tous les champs.');
      setErrorOpen(true);
      return;
    }
    if (newPwd.length < 8) {
      setErrorMessage('Le mot de passe doit contenir au moins 8 caractères.');
      setErrorOpen(true);
      return;
    }
    if (newPwd !== confirmPwd) {
      setErrorMessage('Les mots de passe ne correspondent pas.');
      setErrorOpen(true);
      return;
    }
    try {
      if (pendingAdminFirstLogin && token) {
        await apiRequest('/auth/change-password-first-login', {
          method: 'POST',
          token,
          body: JSON.stringify({ new_password: newPwd }),
        });
      } else if (pendingParent && token) {
        await apiRequest('/auth/change-password', {
          method: 'POST',
          token,
          body: JSON.stringify({ old_password: 'Passer123', new_password: newPwd }),
        });
      }
      setSuccessOpen(true);
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : 'Erreur lors du changement de mot de passe.');
      setErrorOpen(true);
    }
  };

  const handleSuccessClose = () => {
    setSuccessOpen(false);
    setPendingParent(null);
    setPendingAdminFirstLogin(null);
    setAuthStep('logged_out');
  };

  return (
    <div className="grid min-h-screen w-full lg:grid-cols-2">
      <div className="relative hidden min-h-[320px] overflow-hidden lg:block">
        <img
          src="/images/home/hero-1.jpeg"
          alt="Colonie de vacances CSS"
          className="absolute inset-0 h-full w-full object-cover"
          width={1280}
          height={896}
        />
        <div
          className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(6,25,45,0.55)_0%,rgba(6,25,45,0.4)_40%,rgba(6,25,45,0.92)_100%)]"
          aria-hidden
        />
        <div className="relative flex h-full min-h-screen flex-col justify-end p-10 xl:p-14">
          <span className="mb-6 inline-flex w-fit items-center gap-2 rounded-md bg-[#F38A00] px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-white">
            Sécurité renforcée
          </span>
          <h2 className="max-w-lg text-4xl font-extrabold leading-[1.1] tracking-tight text-white xl:text-5xl">
            Sécurisez votre <span className="text-[#F38A00]">accès.</span>
          </h2>
          <p className="mt-4 max-w-md text-base leading-relaxed text-white/90">
            Pour protéger les données de vos enfants, choisissez un mot de passe personnel, fort et confidentiel.
          </p>
        </div>
      </div>

      <div className="flex min-h-screen items-center justify-center bg-white p-4 sm:p-8">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
          <div className="bg-card rounded-xl shadow-elevated p-8 space-y-6">
          <div className="text-center space-y-3">
            <img src={logo} alt="Logo CSS" className="w-16 h-16 mx-auto object-contain" />
            <div>
              <h2 className="text-xl font-bold text-foreground">Changement de mot de passe obligatoire</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Bienvenue <strong>{pendingParent ? `${pendingParent.prenom} ${pendingParent.nom}`.trim() : pendingAdminFirstLogin?.name}</strong> ! Pour des raisons de sécurité, veuillez définir votre propre mot de passe.
              </p>
            </div>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <p className="text-xs text-amber-800">
              <strong>🔒 Première connexion :</strong> Le mot de passe que vous aviez reçu était temporaire. Définissez un mot de passe personnel et sécurisé.
            </p>
          </div>

            <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-foreground font-medium">Nouveau mot de passe</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input type="password" placeholder="Minimum 8 caractères" value={newPwd} onChange={e => setNewPwd(e.target.value)} className="pl-10 h-12 rounded-lg" />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-foreground font-medium">Confirmer votre mot de passe</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input type="password" placeholder="Confirmez le mot de passe" value={confirmPwd} onChange={e => setConfirmPwd(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSubmit()} className="pl-10 h-12 rounded-lg" />
              </div>
            </div>
            <Button onClick={handleSubmit} className="w-full h-12 rounded-lg bg-brand-navy text-primary-foreground hover:bg-brand-navy/90 font-semibold">
              Définir mon mot de passe
            </Button>
            </div>
          </div>
        </motion.div>
      </div>

      <Dialog open={errorOpen} onOpenChange={setErrorOpen}>
        <DialogContent className="sm:max-w-md rounded-xl">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-destructive/10 flex items-center justify-center"><AlertTriangle className="w-5 h-5 text-destructive" /></div>
              <DialogTitle className="text-foreground">Erreur</DialogTitle>
            </div>
            <DialogDescription className="pt-2">{errorMessage}</DialogDescription>
          </DialogHeader>
          <DialogFooter><Button onClick={() => setErrorOpen(false)} className="bg-primary text-primary-foreground rounded-lg">Compris</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={successOpen} onOpenChange={handleSuccessClose}>
        <DialogContent className="sm:max-w-md rounded-xl">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center"><CheckCircle2 className="w-5 h-5 text-emerald-600" /></div>
              <DialogTitle className="text-foreground">Mot de passe défini avec succès</DialogTitle>
            </div>
            <DialogDescription className="pt-2">
              Votre nouveau mot de passe a été enregistré. Vous allez être redirigé vers la page de connexion pour vous connecter avec vos nouveaux identifiants.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter><Button onClick={handleSuccessClose} className="bg-emerald-600 text-white hover:bg-emerald-700 rounded-lg">Retour à la connexion</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
