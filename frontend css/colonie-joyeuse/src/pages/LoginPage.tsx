import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
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

  const now = new Date();
  const heureDebut = settings.heureDebutInscriptions || '00:00';
  const heureFin = settings.heureFinInscriptions || '23:59';
  const debutInscriptions = settings.dateDebutInscriptions ? new Date(`${settings.dateDebutInscriptions}T${heureDebut}:00`) : null;
  const finInscriptions = settings.dateFinInscriptions ? new Date(`${settings.dateFinInscriptions}T${heureFin}:00`) : null;
  const inscriptionsClosed = !settings.inscriptionsOuvertes || (finInscriptions ? now >= finInscriptions : false);
  const inscriptionsNotStarted = debutInscriptions ? now < debutInscriptions : false;

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
        setErrorMessage(`La période d'inscription pour la Colonie de Vacances 2026 n'a pas encore commencé. Les inscriptions ouvriront le ${new Date(settings.dateDebutInscriptions).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })} à ${heureDebut}. Veuillez patienter jusqu'à ce créneau.`);
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
    <div className="grid min-h-screen w-full lg:grid-cols-2">
      {/* Panneau gauche : visuel uniquement (aucune logique métier) */}
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
        <div className="absolute left-6 top-6 z-10">
          <Link
            to="/"
            className="inline-flex items-center gap-2 rounded-lg border border-white/40 bg-white/10 px-4 py-2 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/20"
          >
            Retour à l’accueil
          </Link>
        </div>
        <div className="relative flex h-full min-h-screen flex-col justify-end p-10 xl:p-14">
          <span className="mb-6 inline-flex w-fit items-center gap-2 rounded-md bg-[#F38A00] px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-white">
            Édition 2026
          </span>
          <h2 className="max-w-lg text-4xl font-extrabold leading-[1.1] tracking-tight text-white xl:text-5xl">
            Offrez à vos enfants un été{" "}
            <span className="text-[#F38A00]">inoubliable.</span>
          </h2>
          <p className="mt-4 max-w-md text-base leading-relaxed text-white/90">
            La Colonie de Vacances propose un séjour encadré, sécurisé et riche en souvenirs pour les enfants de nos collaborateurs.
          </p>
          <ul className="mt-8 space-y-2 text-sm font-medium text-white/95">
            <li className="flex items-center gap-2">
              <span className="text-[#F38A00]">•</span>
              Encadrement professionnel
            </li>
            <li className="flex items-center gap-2">
              <span className="text-[#F38A00]">•</span>
              Accès sécurisé au portail
            </li>
          </ul>
        </div>
      </div>

      {/* Panneau droit : formulaire (comportement inchangé) */}
      <div className="flex min-h-screen items-center justify-center bg-white p-4 sm:p-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="relative z-10 w-full max-w-md"
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
              <h1 className="text-2xl font-bold tracking-tight text-foreground">Bienvenue 👋</h1>
              <p className="text-muted-foreground mt-1 text-sm">Connectez-vous pour inscrire vos enfants</p>
            </div>
          </div>

          {inscriptionsNotStarted && (
            <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 text-center">
              <Info className="w-4 h-4 text-primary mx-auto mb-1" />
              <p className="text-xs font-medium text-primary">Les inscriptions ouvriront le {new Date(settings.dateDebutInscriptions).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })} à {heureDebut}.</p>
            </div>
          )}

          {inscriptionsClosed && !inscriptionsNotStarted && (
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 text-center">
              <p className="text-xs font-medium text-destructive">⚠️ Les inscriptions sont fermées depuis le {new Date(settings.dateFinInscriptions).toLocaleDateString('fr-FR')} à {heureFin}.</p>
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
    </div>
  );
}
