import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { useInscription } from '@/contexts/InscriptionContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { AlertTriangle, CheckCircle2, UserPlus, Star, Clock, X, Upload } from 'lucide-react';
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
  nonBiologiqueMode?: boolean;
  replacementMode?: boolean;
  replaceDemandeId?: number | null;
  initialEnfant?: {
    prenom: string;
    nom: string;
    dateNaissance: string;
    sexe: 'M' | 'F';
  } | null;
}

export default function InscrireEnfant({
  onClose,
  nbEnfantsInscrits,
  onInscriptionSuccess,
  nonBiologiqueMode = false,
  replacementMode = false,
  replaceDemandeId = null,
  initialEnfant = null,
}: InscrireEnfantProps = {}) {
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
  /** Parents sans enfant codifié : après la 1re inscription non biologique, dialogue dédié à la limite (sans mélanger avec le flux standard). */
  const [nonBioLimiteDialogOpen, setNonBioLimiteDialogOpen] = useState(false);
  const [nonBioLimiteEnfantLabel, setNonBioLimiteEnfantLabel] = useState('');
  const [showNextPrompt, setShowNextPrompt] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [justificatifFiles, setJustificatifFiles] = useState<File[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewName, setPreviewName] = useState('');
  const [previewMime, setPreviewMime] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!parent) return null;

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
    setJustificatifFiles([]);
  };

  const previewLocalFile = (file: File) => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    setPreviewName(file.name);
    setPreviewMime(file.type || '');
    setPreviewOpen(true);
  };

  useEffect(() => {
    if (!previewOpen && previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
  }, [previewOpen, previewUrl]);

  useEffect(() => {
    if (!replacementMode || !initialEnfant) return;
    setPrenom(initialEnfant.prenom || '');
    setNom(initialEnfant.nom || '');
    setDateNaissance(initialEnfant.dateNaissance || '');
    setSexe(initialEnfant.sexe || '');
    setLienParente('AUTRE');
    setDateNaissanceError('');
    setJustificatifFiles([]);
  }, [replacementMode, initialEnfant]);

  const handleSubmit = () => {
    if (!prenom.trim() || !nom.trim() || !dateNaissance || !sexe || (!nonBiologiqueMode && !lienParente) || (!nonBiologiqueMode && !telephone.trim())) {
      setErrorTitle("Champs requis");
      setErrorMessage("Veuillez remplir tous les champs obligatoires du formulaire.");
      setErrorOpen(true);
      return;
    }
    if (nonBiologiqueMode && justificatifFiles.length === 0) {
      setErrorTitle("Document requis");
      setErrorMessage("Veuillez joindre un document justificatif (extrait de naissance ou certificat de scolarité).");
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

    if (nonBiologiqueMode) {
      liste = 'attente_n2'; statut = 'Suppléant N2';
    } else if (nbInscrits === 0) {
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
      if (replacementMode) {
        if (!replaceDemandeId) throw new Error('Demande introuvable pour le remplacement.');
        const formData = new FormData();
        formData.append('demande_id', String(replaceDemandeId));
        formData.append('enfant_prenom', prenom.trim());
        formData.append('enfant_nom', nom.trim());
        formData.append('enfant_date_naissance', dateNaissance);
        formData.append('enfant_sexe', sexe as 'M' | 'F');
        justificatifFiles.forEach((file) => formData.append('justificatif', file));
        await apiRequest('/parent/remplacer-enfant-n2', {
          method: 'POST',
          token,
          body: formData,
        });
      } else if (nonBiologiqueMode) {
        const formData = new FormData();
        formData.append('enfant_prenom', prenom.trim());
        formData.append('enfant_nom', nom.trim());
        formData.append('enfant_date_naissance', dateNaissance);
        formData.append('enfant_sexe', sexe as 'M' | 'F');
        justificatifFiles.forEach((file) => formData.append('justificatif', file));
        await apiRequest('/parent/inscriptions-n2', {
          method: 'POST',
          token,
          body: formData,
        });
      } else {
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
      }
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

    if (replacementMode) {
      setSuccessMessage(`Le remplacement de ${prenom} ${nom} a été enregistré avec succès. Le rang, le slot, la date et l'heure d'inscription sont conservés.`);
      setSuccessOpen(true);
      setShowNextPrompt(false);
    } else if (nonBiologiqueMode) {
      setNonBioLimiteEnfantLabel(`${prenom.trim()} ${nom.trim()}`);
      setNonBioLimiteDialogOpen(true);
    } else {
      const listeLabel =
        liste === 'principale' ? 'Liste Principale (Titulaire)' : liste === 'attente_n1' ? "Liste d'Attente N°1 (Suppléant)" : "Liste d'Attente N°2";
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

  return (
    <div className={`mx-auto space-y-6 ${nonBiologiqueMode ? 'max-w-xl' : 'max-w-3xl'}`}>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-bold text-foreground">{replacementMode ? "Remplacement d'enfant" : 'Inscrire un enfant'}</h1>
        {replacementMode && (
          <p className="text-sm text-muted-foreground mt-1">
            Les champs sont pre-remplis. Modifiez-les puis ajoutez le nouveau justificatif.
          </p>
        )}
        {!nonBiologiqueMode && (
          <p className="text-muted-foreground mt-1">
            Nouvelle inscription — {settings.colonieNom}. La limite sur les rôles Titulaire et Suppléant N°1 est gérée
            depuis l&apos;accueil (Mes enfants), selon les paramètres de la saison.
          </p>
        )}
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-card rounded-xl shadow-card border border-border overflow-hidden">
        {!nonBiologiqueMode && (
          <div className="bg-muted/50 px-6 py-3 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <currentChildLabel.icon className="w-4 h-4 text-foreground" />
              <span className="font-semibold text-sm text-foreground">{currentChildLabel.title}</span>
            </div>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-md ${currentChildLabel.color}`}>{currentChildLabel.badge}</span>
          </div>
        )}

        <div className={`p-6 ${nonBiologiqueMode ? 'space-y-4' : 'space-y-8'}`}>
          {!nonBiologiqueMode && (
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
          )}

          <div>
            {!nonBiologiqueMode && (
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
                Informations de l'enfant
                {nbInscrits === 0 && <span className="ml-2 text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md normal-case">Enfant Titulaire</span>}
              </h3>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-foreground">{nonBiologiqueMode ? 'Prénom' : "Prénom de l'enfant"} *</Label>
                <Input value={prenom} onChange={e => setPrenom(e.target.value)} placeholder="Prénom" className="h-11 rounded-lg" />
              </div>
              <div className="space-y-2">
                <Label className="text-foreground">{nonBiologiqueMode ? 'Nom' : "Nom de l'enfant"} *</Label>
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
              {!nonBiologiqueMode && (
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
              )}
              {nonBiologiqueMode && (
                <div className="space-y-2 sm:col-span-2">
                  <Label className="text-foreground">Lien de parenté</Label>
                  <Input value="Autre" disabled className="h-11 rounded-lg bg-muted/50" />
                </div>
              )}
              {nonBiologiqueMode && (
                <div className="space-y-2 sm:col-span-2">
                  <Label className="text-foreground">Document justificatif (Extrait de naissance) *</Label>
                  {/* <p className="text-xs text-muted-foreground">Téléverser / Uploader un ou plusieurs fichiers (exemple : recto et verso).</p> */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    required
                    aria-required="true"
                    onChange={(e) => {
                      const first = (e.target.files ?? [])[0];
                      setJustificatifFiles(first ? [first] : []);
                    }}
                    className="hidden"
                  />
                  <div className="flex items-center gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => fileInputRef.current?.click()}
                      className="rounded-lg h-10 px-4 gap-2"
                    >
                      <Upload className="w-4 h-4" />
                      Choisir un fichier
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      {justificatifFiles.length === 0
                        ? 'Aucun fichier sélectionné'
                        : `${justificatifFiles.length} fichier sélectionné`}
                    </span>
                  </div>
                  {justificatifFiles.length > 0 && (
                    <div className="space-y-1">
                      {justificatifFiles.map((file, idx) => (
                        <button
                          key={`${file.name}-${idx}`}
                          type="button"
                          onClick={() => previewLocalFile(file)}
                          className="block text-left text-xs text-accent hover:underline"
                        >
                          Voir le fichier : {file.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {nonBiologiqueMode ? (
            <Button onClick={handleSubmit} disabled={isDateInvalid} className="w-full rounded-lg bg-accent text-white hover:bg-accent/90 disabled:opacity-50">
              {replacementMode ? 'Remplacer' : 'Soumettre la demande'}
            </Button>
          ) : (
            <div className="flex justify-end gap-3 pt-4 border-t border-border">
              <Button variant="outline" onClick={resetForm} className="rounded-lg">Annuler</Button>
              <Button onClick={handleSubmit} disabled={isDateInvalid} className="rounded-lg bg-accent text-white hover:bg-accent/90 gap-2 disabled:opacity-50">
                <UserPlus className="w-4 h-4" />
                Enregistrer l'inscription
              </Button>
            </div>
          )}
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

      {/* Uniquement parent sans enfant codifié (nonBiologiqueMode) : une seule inscription non biologique — message de limite dédié après succès API */}
      <Dialog open={nonBioLimiteDialogOpen} onOpenChange={setNonBioLimiteDialogOpen}>
        <DialogContent className="sm:max-w-md rounded-xl">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center"><AlertTriangle className="w-5 h-5 text-amber-700" /></div>
              <DialogTitle className="text-foreground">Vous avez atteint la limite</DialogTitle>
            </div>
            <DialogDescription asChild>
              <div className="pt-2 space-y-2 text-left">
                <p>
                  L&apos;inscription de <strong className="text-foreground">{nonBioLimiteEnfantLabel}</strong> est bien enregistrée (liste d&apos;attente N°2).
                </p>
                <p className="text-foreground font-medium">
                  Vous ne pouvez plus inscrire d&apos;autre enfant non biologique : une seule inscription est autorisée lorsque vous n&apos;avez pas d&apos;enfant codifié.
                </p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setNonBioLimiteDialogOpen(false)} className="rounded-lg bg-accent text-white hover:bg-accent/90">
              Compris
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-md rounded-xl">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center"><AlertTriangle className="w-5 h-5 text-accent" /></div>
              <DialogTitle className="text-foreground">{replacementMode ? 'Confirmer le remplacement' : "Confirmer l'inscription"}</DialogTitle>
            </div>
            <DialogDescription className="pt-2">
              Veuillez vérifier attentivement les informations saisies avant de confirmer :
              <br /><br />
              <strong>Enfant :</strong> {prenom} {nom}<br />
              <strong>Date de naissance :</strong> {dateNaissance ? new Date(dateNaissance).toLocaleDateString('fr-FR') : ''}<br />
              <strong>Sexe :</strong> {sexe === 'M' ? 'Masculin' : sexe === 'F' ? 'Féminin' : ''}
              {!nonBiologiqueMode && (
                <>
                  <br />
                  <strong>Lien de parenté :</strong> {LIEN_PARENTE_LABELS[lienParente as LienParenteApi] ?? lienParente}
                </>
              )}
              <br /><br />
              {nonBiologiqueMode ? (
                <span className="text-destructive font-medium">
                  Attention : après confirmation, l&apos;inscription est enregistrée. Vous pourrez corriger les renseignements saisis depuis votre carte enfant si nécessaire.
                </span>
              ) : (
                <span className="text-destructive font-medium">
                  ⚠ Attention : une fois l&apos;inscription enregistrée, vous pourrez corriger les informations depuis votre demande, sans changer votre rang.
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} className="rounded-lg">Vérifier à nouveau</Button>
            <Button onClick={confirmInscription} className="rounded-lg bg-accent text-white hover:bg-accent/90">
              {replacementMode ? 'Confirmer le remplacement' : "Confirmer l'inscription"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="sm:max-w-3xl rounded-xl p-0 overflow-hidden">
          <DialogHeader className="sr-only">
            <DialogTitle>Aperçu du fichier justificatif</DialogTitle>
            <DialogDescription>{previewName || 'Aperçu du document sélectionné'}</DialogDescription>
          </DialogHeader>
          <div className="relative bg-card">
            <button
              type="button"
              onClick={() => setPreviewOpen(false)}
              className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background hover:bg-muted"
              aria-label="Fermer l'aperçu"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="px-5 py-4 border-b border-border">
              <DialogTitle className="text-base text-foreground">Aperçu du fichier</DialogTitle>
              <DialogDescription className="pt-1">{previewName}</DialogDescription>
            </div>
            <div className="p-4 bg-muted/20">
              {previewUrl && previewMime.startsWith('image/') ? (
                <img src={previewUrl} alt={previewName} className="max-h-[70vh] w-full object-contain rounded-md bg-background" />
              ) : previewUrl ? (
                <iframe src={previewUrl} title={previewName} className="w-full h-[70vh] rounded-md bg-background" />
              ) : null}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
