import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { useInscription } from '@/contexts/InscriptionContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { AlertTriangle, CheckCircle2, UserPlus, Star, Clock, PartyPopper } from 'lucide-react';
import { apiRequest } from '@/lib/api';

/** Valeurs attendues par l'API (`LienParente`) — libellés FR pour l'affichage */
type LienParenteApi = 'PERE' | 'MERE' | 'TUTEUR_LEGAL' | 'AUTRE';
const LIEN_PARENTE_LABELS: Record<LienParenteApi, string> = {
  PERE: 'Père',
  MERE: 'Mère',
  TUTEUR_LEGAL: 'Tuteur légal',
  AUTRE: 'Autre',
};

interface InscrireEnfantProps {
  onClose?: () => void;
  /** Nombre d’enfants déjà inscrits (API) — sinon repli sur le contexte local */
  nbEnfantsInscrits?: number;
  onInscriptionSuccess?: () => void;
}

export default function InscrireEnfant({ onClose, nbEnfantsInscrits, onInscriptionSuccess }: InscrireEnfantProps = {}) {
  const { parent, token, refreshParentProfile } = useAuth();
  const { getEnfantsByParent, settings, addHistorique } = useInscription();

  const [prenom, setPrenom] = useState('');
  const [nom, setNom] = useState('');
  const [dateNaissance, setDateNaissance] = useState('');
  const [dateNaissanceError, setDateNaissanceError] = useState('');
  const [sexe, setSexe] = useState('');
  const [lienParente, setLienParente] = useState<LienParenteApi | ''>('');
  const [email, setEmail] = useState(parent?.email || '');
  const [telephone, setTelephone] = useState('');
  const [errorOpen, setErrorOpen] = useState(false);
  const [errorTitle, setErrorTitle] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [successOpen, setSuccessOpen] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [showNextPrompt, setShowNextPrompt] = useState(false);
  const [showMaxReachedPopup, setShowMaxReachedPopup] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  if (!parent) return null;

  const MAX_ENFANTS = settings.maxEnfantsParParent;
  const enfants = getEnfantsByParent(parent.matricule);
  const nbInscrits = nbEnfantsInscrits !== undefined ? nbEnfantsInscrits : enfants.length;

  const handleDateNaissanceChange = (value: string) => {
    setDateNaissance(value);
    if (value) {
      const annee = new Date(value).getFullYear();
      if (annee < settings.ageMin || annee > settings.ageMax) {
        setDateNaissanceError(`L'année de naissance doit être comprise entre ${settings.ageMin} et ${settings.ageMax}.`);
      } else {
        setDateNaissanceError('');
      }
    } else {
      setDateNaissanceError('');
    }
  };

  const isDateInvalid = dateNaissance !== '' && dateNaissanceError !== '';

  const resetForm = () => {
    setPrenom(''); setNom(''); setDateNaissance(''); setDateNaissanceError(''); setSexe(''); setLienParente('');
  };

  const handleSubmit = () => {
    if (MAX_ENFANTS !== null && nbInscrits >= MAX_ENFANTS) {
      setErrorTitle("Limite d'inscription atteinte");
      setErrorMessage(`Vous avez atteint le maximum autorisé de ${MAX_ENFANTS} inscriptions par agent.`);
      setErrorOpen(true);
      return;
    }
    if (!prenom.trim() || !nom.trim() || !dateNaissance || !sexe || !lienParente || !telephone.trim()) {
      setErrorTitle("Champs requis");
      setErrorMessage("Veuillez remplir tous les champs obligatoires du formulaire.");
      setErrorOpen(true);
      return;
    }
    const annee = new Date(dateNaissance).getFullYear();
    if (annee < settings.ageMin || annee > settings.ageMax) {
      setErrorTitle("Inscription rejetée");
      setErrorMessage(`L'enfant doit être né entre ${settings.ageMin} et ${settings.ageMax}. (Année saisie : ${annee})`);
      setErrorOpen(true);
      return;
    }
    setConfirmOpen(true);
  };

  const confirmInscription = async () => {
    setConfirmOpen(false);

    let liste: 'principale' | 'attente_n1' | 'attente_n2';
    let statut: 'Titulaire' | 'Suppléant N1' | 'Suppléant N2';

    if (nbInscrits === 0) {
      liste = 'principale'; statut = 'Titulaire';
    } else if (nbInscrits === 1) {
      if (lienParente === 'AUTRE') {
        liste = 'attente_n2'; statut = 'Suppléant N2';
      } else {
        liste = 'attente_n1'; statut = 'Suppléant N1';
      }
    } else {
      liste = 'attente_n2'; statut = 'Suppléant N2';
    }

    try {
      if (!token) throw new Error('Session expirée');
      await apiRequest('/parent/inscriptions', {
        method: 'POST',
        token,
        body: JSON.stringify({
          parent: {
            prenom: parent.prenom,
            nom: parent.nom,
            matricule: parent.matricule,
            service: parent.service,
            email: email.trim() || null,
            telephone: telephone.trim(),
            site_code: parent.site_code || parent.site || null,
          },
          enfant: {
            prenom: prenom.trim(),
            nom: nom.trim(),
            date_naissance: dateNaissance,
            sexe: sexe as 'M' | 'F',
            lien_parente: lienParente,
          },
        }),
      });
      await refreshParentProfile();
      onInscriptionSuccess?.();
      addHistorique({
        utilisateur: `${parent.prenom} ${parent.nom}`,
        role: 'Parent',
        action: 'Inscription',
        details: `A inscrit ${prenom.trim()} ${nom.trim()} en ${liste === 'principale' ? 'Liste Principale' : liste === 'attente_n1' ? "Liste N°1" : "Liste N°2"}`,
        cible: `${prenom.trim()} ${nom.trim()}`,
      });
    } catch (e) {
      setErrorTitle('Inscription rejetée');
      setErrorMessage(e instanceof Error ? e.message : "Erreur lors de l'inscription.");
      setErrorOpen(true);
      return;
    }

    const listeLabel = liste === 'principale' ? 'Liste Principale (Titulaire)' : liste === 'attente_n1' ? "Liste d'Attente N°1 (Suppléant)" : "Liste d'Attente N°2";
    const isLastChild = MAX_ENFANTS !== null && nbInscrits + 1 >= MAX_ENFANTS;

    if (isLastChild) {
      setShowMaxReachedPopup(true);
    } else {
      setSuccessMessage(`${prenom} ${nom} a été inscrit(e) avec succès dans la ${listeLabel}.`);
      setSuccessOpen(true);
      setShowNextPrompt(true);
    }
    resetForm();
  };

  const getChildLabel = () => {
    if (nbInscrits === 0) {
      return { title: '1er Enfant — Titulaire', badge: 'Titulaire', icon: Star, color: 'text-emerald-600 bg-emerald-50' };
    } else if (nbInscrits === 1) {
      if (lienParente === 'AUTRE') {
        return { title: '2ème Enfant — Suppléant', badge: "Liste d'attente N2", icon: Clock, color: 'text-orange-600 bg-orange-50' };
      }
      return { title: '2ème Enfant — Suppléant', badge: "Liste d'attente N1", icon: Clock, color: 'text-accent bg-accent/10' };
    } else {
      return { title: `${nbInscrits + 1}ème Enfant — Suppléant`, badge: "Liste d'attente N2", icon: Clock, color: 'text-orange-600 bg-orange-50' };
    }
  };
  const currentChildLabel = getChildLabel();

  if (MAX_ENFANTS !== null && nbInscrits >= MAX_ENFANTS) {
    return (
      <div className="max-w-2xl mx-auto">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-xl shadow-card border border-border p-8 text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-accent/10 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-8 h-8 text-accent" />
          </div>
          <h2 className="text-xl font-bold text-foreground">Inscriptions complètes</h2>
          <p className="text-muted-foreground">Vous avez inscrit le maximum de {MAX_ENFANTS} enfants pour la saison 2026. Consultez la section "Mes enfants" pour gérer vos inscriptions.</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-bold text-foreground">Inscrire un enfant</h1>
        <p className="text-muted-foreground mt-1">Inscription {nbInscrits + 1}/{MAX_ENFANTS ?? '∞'} — Colonie de Vacances 2026</p>
      </motion.div>

      {MAX_ENFANTS !== null && (
        <div className="flex gap-2">
          {Array.from({ length: MAX_ENFANTS }).map((_, i) => (
            <div key={i} className={`h-1.5 flex-1 rounded-full transition-colors ${i < nbInscrits ? 'bg-emerald-500' : i === nbInscrits ? 'bg-accent' : 'bg-muted'}`} />
          ))}
        </div>
      )}

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-card rounded-xl shadow-card border border-border overflow-hidden">
        <div className="bg-muted/50 px-6 py-3 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <currentChildLabel.icon className="w-4 h-4 text-foreground" />
            <span className="font-semibold text-sm text-foreground">{currentChildLabel.title}</span>
          </div>
          <span className={`text-xs font-medium px-2 py-0.5 rounded-md ${currentChildLabel.color}`}>{currentChildLabel.badge}</span>
        </div>

        <div className="p-6 space-y-8">
          <div>
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">Informations du parent</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-foreground">Matricule</Label>
                <Input value={parent.matricule} disabled className="bg-muted/50 font-mono tabular-nums" />
              </div>
              <div className="space-y-2">
                <Label className="text-foreground">Service</Label>
                <Input value={parent.service} disabled className="bg-muted/50" />
              </div>
              <div className="space-y-2">
                <Label className="text-foreground">Prénom</Label>
                <Input value={parent.prenom} disabled className="bg-muted/50" />
              </div>
              <div className="space-y-2">
                <Label className="text-foreground">Nom</Label>
                <Input value={parent.nom} disabled className="bg-muted/50" />
              </div>
              <div className="space-y-2">
                <Label className="text-foreground">Email</Label>
                <Input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" className="h-11 rounded-lg" />
              </div>
              <div className="space-y-2">
                <Label className="text-foreground">Téléphone *</Label>
                <Input value={telephone} onChange={e => setTelephone(e.target.value)} placeholder="Saisissez votre numéro de téléphone" className="h-11 rounded-lg" />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label className="text-foreground">Agence</Label>
                <Input value={parent.site_nom || parent.site_code || parent.site || ''} disabled className="bg-muted/50" />
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
              Informations de l'enfant
              {nbInscrits === 0 && <span className="ml-2 text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md normal-case">Enfant Titulaire</span>}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-foreground">Prénom de l'enfant *</Label>
                <Input value={prenom} onChange={e => setPrenom(e.target.value)} placeholder="Prénom" className="h-11 rounded-lg" />
              </div>
              <div className="space-y-2">
                <Label className="text-foreground">Nom de l'enfant *</Label>
                <Input value={nom} onChange={e => setNom(e.target.value)} placeholder="Nom" className="h-11 rounded-lg" />
              </div>
              <div className="space-y-2">
                <Label className="text-foreground">Date de naissance *</Label>
                <Input type="date" value={dateNaissance} onChange={e => handleDateNaissanceChange(e.target.value)} className={`h-11 rounded-lg ${isDateInvalid ? 'border-destructive' : ''}`} min={`${settings.ageMin}-01-01`} max={`${settings.ageMax}-12-31`} />
                {isDateInvalid && <p className="text-xs text-destructive mt-1">{dateNaissanceError}</p>}
              </div>
              <div className="space-y-2">
                <Label className="text-foreground">Sexe *</Label>
                <Select value={sexe} onValueChange={setSexe}>
                  <SelectTrigger className="h-11 rounded-lg"><SelectValue placeholder="Sélectionner" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="M">Masculin</SelectItem>
                    <SelectItem value="F">Féminin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label className="text-foreground">Lien de parenté *</Label>
                <Select value={lienParente} onValueChange={(value) => setLienParente(value as LienParenteApi)}>
                  <SelectTrigger className="h-11 rounded-lg"><SelectValue placeholder="Sélectionner le lien" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PERE">Père</SelectItem>
                    <SelectItem value="MERE">Mère</SelectItem>
                    <SelectItem value="TUTEUR_LEGAL">Tuteur légal</SelectItem>
                    <SelectItem value="AUTRE">Autre</SelectItem>
                  </SelectContent>
                </Select>
            {nbInscrits >= 2 ? (
                  <p className="text-xs text-orange-600 mt-1">⚠ Cet enfant sera automatiquement placé en Liste d'Attente N°2.</p>
                ) : lienParente === 'AUTRE' ? (
                  <p className="text-xs text-accent mt-1">⚠ Cet enfant sera placé en Liste d'Attente N°2.</p>
                ) : null}
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-border">
            <Button variant="outline" onClick={resetForm} className="rounded-lg">Annuler</Button>
            <Button onClick={handleSubmit} disabled={isDateInvalid} className="rounded-lg bg-accent text-white hover:bg-accent/90 gap-2 disabled:opacity-50">
              <UserPlus className="w-4 h-4" />
              Enregistrer l'inscription
            </Button>
          </div>
        </div>
      </motion.div>

      <Dialog open={errorOpen} onOpenChange={setErrorOpen}>
        <DialogContent className="sm:max-w-md rounded-xl">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-destructive/10 flex items-center justify-center"><AlertTriangle className="w-5 h-5 text-destructive" /></div>
              <DialogTitle className="text-foreground">{errorTitle}</DialogTitle>
            </div>
            <DialogDescription className="pt-2">{errorMessage}</DialogDescription>
          </DialogHeader>
          <DialogFooter><Button onClick={() => setErrorOpen(false)} className="bg-primary text-primary-foreground rounded-lg">Compris</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={successOpen} onOpenChange={open => { setSuccessOpen(open); if (!open) setShowNextPrompt(false); }}>
        <DialogContent className="sm:max-w-md rounded-xl">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center"><CheckCircle2 className="w-5 h-5 text-emerald-600" /></div>
              <DialogTitle className="text-foreground">Inscription réussie</DialogTitle>
            </div>
            <DialogDescription className="pt-2">{successMessage}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => { setSuccessOpen(false); setShowNextPrompt(false); }} className="rounded-lg">Terminer</Button>
            {showNextPrompt && (
              <Button onClick={() => { setSuccessOpen(false); setShowNextPrompt(false); }} className="rounded-lg bg-accent text-accent-foreground hover:bg-accent/90 gap-2">
                <UserPlus className="w-4 h-4" />+ Inscrire le {nbInscrits + 1}ème enfant
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-md rounded-xl">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center"><AlertTriangle className="w-5 h-5 text-accent" /></div>
              <DialogTitle className="text-foreground">Confirmer l'inscription</DialogTitle>
            </div>
            <DialogDescription className="pt-2">
              Veuillez vérifier attentivement les informations saisies avant de confirmer :
              <br /><br />
              <strong>Enfant :</strong> {prenom} {nom}<br />
              <strong>Date de naissance :</strong> {dateNaissance ? new Date(dateNaissance).toLocaleDateString('fr-FR') : ''}<br />
              <strong>Sexe :</strong> {sexe === 'M' ? 'Masculin' : sexe === 'F' ? 'Féminin' : ''}<br />
              <strong>Lien de parenté :</strong> {LIEN_PARENTE_LABELS[lienParente as LienParenteApi] ?? lienParente}
              <br /><br />
              <span className="text-destructive font-medium">⚠ Attention : une fois l'inscription enregistrée, vous pourrez corriger les informations depuis votre demande, sans changer votre rang.</span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} className="rounded-lg">Vérifier à nouveau</Button>
            <Button onClick={confirmInscription} className="rounded-lg bg-accent text-white hover:bg-accent/90">Confirmer l'inscription</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showMaxReachedPopup} onOpenChange={setShowMaxReachedPopup}>
        <DialogContent className="sm:max-w-lg rounded-xl">
          <DialogHeader>
            <div className="flex flex-col items-center text-center gap-4 pt-4">
              <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center"><PartyPopper className="w-10 h-10 text-emerald-600" /></div>
              <DialogTitle className="text-xl text-foreground">🎉 Félicitations !</DialogTitle>
            </div>
            <DialogDescription className="text-center pt-4 text-base leading-relaxed">
              Vous avez inscrit avec succès vos <strong className="text-foreground">{MAX_ENFANTS} enfants</strong> pour la Colonie de Vacances 2026.
              <br /><br /><span className="text-foreground font-medium">Vos inscriptions sont désormais complètes.</span>
              <br /><br />Vous pouvez suivre le statut de vos enfants dans la section <strong>"Mes enfants"</strong> et consulter toutes les inscriptions dans la section dédiée.
              <br /><br /><span className="text-muted-foreground text-sm">Nous vous souhaitons de belles vacances en famille ! 🌴</span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="justify-center pt-2">
            <Button onClick={() => setShowMaxReachedPopup(false)} className="rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 px-8">C'est compris !</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
