import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { useInscription } from '@/contexts/InscriptionContext';
import { calculateAge, type Enfant } from '@/data/mockData';
import { Star, ArrowUpDown, User, HandMetal, AlertTriangle, CheckCircle2, Award, XCircle, RotateCcw, Hash } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { markTitulaireSwapBadges } from '@/lib/titulaireSwapBadges';

export default function MesEnfants() {
  const { parent } = useAuth();
  const { getEnfantsByParent, setTitulaire, demanderDesistement, annulerDesistement, reinscrireEnfant, getListeFinale, addHistorique, settings, getRangDansListe } = useInscription();

  const now = new Date();
  const heureFin = settings.heureFinInscriptions || '23:59';
  const dateFin = settings.dateFinInscriptions ? new Date(`${settings.dateFinInscriptions}T${heureFin}:00`) : null;
  const inscriptionsCloturees = dateFin ? now >= dateFin : false;
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [selectedId, setSelectedId] = useState('');
  const [selectedName, setSelectedName] = useState('');
  const [desistementOpen, setDesistementOpen] = useState(false);
  const [desistementId, setDesistementId] = useState('');
  const [desistementName, setDesistementName] = useState('');
  const [reinscrireOpen, setReinscrireOpen] = useState(false);
  const [reinscrireId, setReinscrireId] = useState('');
  const [reinscireName, setReinscireName] = useState('');
  const [cancelDesistError, setCancelDesistError] = useState(false);

  if (!parent) return null;
  const enfants = getEnfantsByParent(parent.matricule);
  const listeFinale = getListeFinale();

  // Find the N1 child for the titulaire swap suggestion
  const enfantN1 = enfants.find(e => e.statut === 'Suppléant N1' && !e.desistement);
  const getDemandeIdForAction = (e: Enfant | undefined): number | null => {
    if (!e) return null;
    if (typeof e.demandeId === 'number' && Number.isFinite(e.demandeId)) return e.demandeId;
    const fallback = Number(e.id);
    return Number.isFinite(fallback) ? fallback : null;
  };

  const handleSetTitulaire = (id: string, name: string) => { setSelectedId(id); setSelectedName(name); setConfirmOpen(true); };
  const confirmChange = () => {
    const target = enfants.find((x) => x.id === selectedId);
    const targetDemandeId = getDemandeIdForAction(target);
    const ancienTitulaire = enfants.find((x) => x.statut === 'Titulaire' && x.liste === 'principale' && !x.desistement);
    const ancienTitulaireDemandeId = getDemandeIdForAction(ancienTitulaire);
    setTitulaire(parent.matricule, selectedId);
    if (
      target?.liste === 'attente_n1' &&
      targetDemandeId &&
      ancienTitulaireDemandeId &&
      targetDemandeId !== ancienTitulaireDemandeId
    ) {
      markTitulaireSwapBadges({
        parentMatricule: parent.matricule,
        promotedDemandeId: targetDemandeId,
        exTitulaireDemandeId: ancienTitulaireDemandeId,
      });
    }
    addHistorique({ utilisateur: `${parent.prenom} ${parent.nom}`, role: 'Parent', action: 'Changement titulaire', details: `A défini ${selectedName} comme titulaire`, cible: selectedName });
    setConfirmOpen(false);
  };

  const handleDesistement = (id: string, name: string) => { setDesistementId(id); setDesistementName(name); setDesistementOpen(true); };

  // Check if the désistement target is the titulaire
  const desistementTarget = enfants.find(e => e.id === desistementId);
  const isTitulaireDesistement = desistementTarget?.statut === 'Titulaire';

  const handleSwapAndDesist = () => {
    if (!enfantN1) return;
    const enfantN1DemandeId = getDemandeIdForAction(enfantN1);
    const ancienTitulaire = enfants.find((x) => x.statut === 'Titulaire' && x.liste === 'principale' && !x.desistement);
    const ancienTitulaireDemandeId = getDemandeIdForAction(ancienTitulaire);
    // First swap: make N1 child the titulaire
    setTitulaire(parent.matricule, enfantN1.id);
    if (enfantN1DemandeId && ancienTitulaireDemandeId && enfantN1DemandeId !== ancienTitulaireDemandeId) {
      markTitulaireSwapBadges({
        parentMatricule: parent.matricule,
        promotedDemandeId: enfantN1DemandeId,
        exTitulaireDemandeId: ancienTitulaireDemandeId,
      });
    }
    addHistorique({ utilisateur: `${parent.prenom} ${parent.nom}`, role: 'Parent', action: 'Changement titulaire', details: `A défini ${enfantN1.prenom} ${enfantN1.nom} comme titulaire avant désistement`, cible: `${enfantN1.prenom} ${enfantN1.nom}` });
    // Don't close dialog - let parent click "Confirmer le désistement" next
    // The desistementId still points to the original child (now Suppléant N1)
  };

  const confirmDesistement = () => {
    demanderDesistement(desistementId);
    addHistorique({ utilisateur: `${parent.prenom} ${parent.nom}`, role: 'Parent', action: 'Désistement demandé', details: `A demandé le désistement de ${desistementName}`, cible: desistementName });
    setDesistementOpen(false);
  };

  const handleAnnulerDesistement = (id: string) => {
    const enfant = enfants.find(e => e.id === id);
    if (enfant?.desistement === 'validé') {
      setCancelDesistError(true);
      return;
    }
    annulerDesistement(id);
    addHistorique({ utilisateur: `${parent.prenom} ${parent.nom}`, role: 'Parent', action: 'Annulation désistement', details: `A annulé le désistement de ${enfant?.prenom} ${enfant?.nom}`, cible: `${enfant?.prenom} ${enfant?.nom}` });
  };

  const handleReinscrire = (id: string, name: string) => { setReinscrireId(id); setReinscireName(name); setReinscrireOpen(true); };
  const confirmReinscrire = () => {
    reinscrireEnfant(reinscrireId);
    addHistorique({ utilisateur: `${parent.prenom} ${parent.nom}`, role: 'Parent', action: 'Réinscription', details: `A réinscrit ${reinscireName} après désistement`, cible: reinscireName });
    setReinscrireOpen(false);
  };

  const getStatutStyle = (statut: string) => {
    switch (statut) {
      case 'Titulaire': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'Suppléant N1': return 'bg-accent/10 text-accent border-accent/20';
      case 'Suppléant N2': return 'bg-primary/10 text-primary border-primary/20';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const getListeLabel = (liste: string) => {
    switch (liste) {
      case 'principale': return 'Liste Principale';
      case 'attente_n1': return "Liste d'Attente N°1";
      case 'attente_n2': return "Liste d'Attente N°2";
      default: return liste;
    }
  };

  const isInFinale = (id: string) => listeFinale.some(e => e.id === id);

  if (enfants.length === 0) {
    return (
      <div className="max-w-2xl mx-auto">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-xl shadow-card border border-border p-12 text-center space-y-4">
          <div className="w-20 h-20 rounded-full bg-accent/10 flex items-center justify-center mx-auto"><User className="w-10 h-10 text-accent" /></div>
          <h2 className="text-xl font-bold text-foreground">Aucun enfant inscrit</h2>
          <p className="text-muted-foreground max-w-sm mx-auto">Rendez-vous dans "Inscrire un enfant" pour commencer.</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-bold text-foreground">Mes enfants</h1>
        <p className="text-muted-foreground mt-1">{enfants.length} enfant(s) inscrit(s)</p>
      </motion.div>

      {inscriptionsCloturees && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-amber-800">Période d'inscription terminée</p>
            <p className="text-xs text-amber-700 mt-1">
              {enfants.every(e => e.desistement === 'validé')
                ? "Tous vos enfants ont été désistés. Aucune action n'est disponible."
                : "Seule l'action de désistement est disponible. Les modifications et réinscriptions ne sont plus possibles."}
            </p>
          </div>
        </motion.div>
      )}

      <div className="space-y-4">
        {enfants.map((enfant, i) => {
          const inFinale = isInFinale(enfant.id);
          const rang = getRangDansListe(enfant.id);
          return (
            <motion.div key={enfant.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 * i }} className="bg-card rounded-xl shadow-card border border-border p-5">
              <div className="flex items-start justify-between flex-wrap gap-3">
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${enfant.statut === 'Titulaire' ? 'bg-emerald-100' : 'bg-muted'}`}>
                    {enfant.statut === 'Titulaire' ? <Star className="w-5 h-5 text-emerald-600" /> : <User className="w-5 h-5 text-muted-foreground" />}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-foreground">{enfant.prenom} {enfant.nom}</p>
                      {enfant.reinscrit && (
                        <span className="text-xs font-medium px-2 py-0.5 rounded-md bg-accent/10 text-accent border border-accent/20">Réinscrit</span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">{calculateAge(enfant.dateNaissance)} ans — {enfant.sexe === 'M' ? 'Garçon' : 'Fille'} — {enfant.lienParente}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Né(e) le {new Date(enfant.dateNaissance).toLocaleDateString('fr-FR')}</p>
                    {/*
                    Ancien affichage (le rang était toujours visible, y compris après désistement) :
                    <div className="flex items-center gap-1.5 mt-1">
                      <Hash className="w-3 h-3 text-muted-foreground" />
                      <span className="text-xs font-medium text-muted-foreground">
                        Rang <strong className="text-foreground">{rang}</strong> — {getListeLabel(enfant.liste)}
                      </span>
                    </div>
                    */}
                    {/* Rang/Liste masqués si désistement (réaffichés après réinscription). */}
                    {!enfant.desistement && !enfant.rejetDefinitif && (
                      <div className="flex items-center gap-1.5 mt-1">
                        <Hash className="w-3 h-3 text-muted-foreground" />
                        <span className="text-xs font-medium text-muted-foreground">
                          Rang <strong className="text-foreground">{rang}</strong> — {getListeLabel(enfant.liste)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span className={`text-xs font-medium px-3 py-1 rounded-lg border ${getStatutStyle(enfant.statut)}`}>{enfant.statut}</span>

                  {inFinale && !enfant.desistement && (
                    <span className="text-xs font-semibold px-3 py-1 rounded-lg bg-emerald-100 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                      <Award className="w-3 h-3" /> Retenu(e) pour la colonie
                    </span>
                  )}

                  {(enfant.validation || 'en_attente') === 'en_attente' &&
                    enfant.liste === 'attente_n2' &&
                    enfant.lienParente === 'Autre' && (
                    <span className="text-xs font-medium px-3 py-1 rounded-lg bg-amber-50 text-amber-700 border border-amber-200">
                      En attente de validation
                    </span>
                  )}

                  {enfant.validation === 'refusé' && enfant.rejetDefinitif && (
                    <div className="w-full max-w-md rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2 text-xs text-destructive space-y-1.5 sm:ml-auto">
                      <p className="font-semibold leading-tight">Refus définitif</p>
                      <p className="leading-snug break-words">
                        Motif : {enfant.motifRefus?.trim() || '—'}
                      </p>
                      <p className="font-medium leading-tight">Aucune action possible</p>
                    </div>
                  )}
                  {enfant.validation === 'refusé' && !enfant.rejetDefinitif && (
                    <span className="text-xs font-medium px-3 py-1 rounded-lg bg-destructive/10 text-destructive border border-destructive/20 flex items-center gap-1">
                      <XCircle className="w-3 h-3 shrink-0" aria-hidden />
                      Refusé — {enfant.motifRefus?.trim() || '—'}
                    </span>
                  )}

                  {enfant.desistement === 'demandé' && (
                    <span className="text-xs font-medium px-3 py-1 rounded-lg bg-amber-50 text-amber-700 border border-amber-200">⏳ Désistement en attente</span>
                  )}

                  {enfant.desistement === 'validé' && (
                    <span className="text-xs font-medium px-3 py-1 rounded-lg bg-destructive/10 text-destructive border border-destructive/20">✓ Désistement validé</span>
                  )}

                  <div className="flex gap-2 mt-1 flex-wrap">
                    {!inscriptionsCloturees && enfant.statut !== 'Titulaire' && enfant.lienParente !== 'Autre' && !enfant.desistement && !enfant.rejetDefinitif && (
                      <Button variant="outline" size="sm" onClick={() => handleSetTitulaire(enfant.id, `${enfant.prenom} ${enfant.nom}`)} className="rounded-lg gap-1 text-xs">
                        <ArrowUpDown className="w-3 h-3" />Définir titulaire
                      </Button>
                    )}

                    {!enfant.desistement && enfant.validation !== 'refusé' && !enfant.rejetDefinitif && (
                      <Button variant="outline" size="sm" onClick={() => handleDesistement(enfant.id, `${enfant.prenom} ${enfant.nom}`)} className="rounded-lg gap-1 text-xs text-destructive border-destructive/30 hover:bg-destructive hover:text-white hover:border-destructive">
                        <HandMetal className="w-3 h-3" />Désistement
                      </Button>
                    )}

                    {enfant.desistement === 'demandé' && !enfant.rejetDefinitif && (
                      <Button variant="outline" size="sm" onClick={() => handleAnnulerDesistement(enfant.id)} className="rounded-lg gap-1 text-xs text-amber-700 border-amber-300 hover:bg-amber-50">
                        <XCircle className="w-3 h-3" />Annuler désistement
                      </Button>
                    )}

                    {!inscriptionsCloturees && enfant.desistement === 'validé' && !enfant.rejetDefinitif && (
                      <Button variant="outline" size="sm" onClick={() => handleReinscrire(enfant.id, `${enfant.prenom} ${enfant.nom}`)} className="rounded-lg gap-1 text-xs hover:bg-accent hover:text-white hover:border-accent">
                        <RotateCcw className="w-3 h-3" />Réinscrire
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Confirm Titulaire */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-md rounded-xl">
          <DialogHeader>
            <DialogTitle className="text-foreground">Changer l'enfant titulaire</DialogTitle>
            <DialogDescription className="pt-2">Êtes-vous sûr de vouloir définir <strong>{selectedName}</strong> comme enfant titulaire ?</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} className="rounded-lg">Annuler</Button>
            <Button onClick={confirmChange} className="rounded-lg bg-accent text-white hover:bg-accent/90">Confirmer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Désistement - with titulaire swap suggestion */}
      <Dialog open={desistementOpen} onOpenChange={setDesistementOpen}>
        <DialogContent className="sm:max-w-lg rounded-xl overflow-hidden">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 shrink-0 rounded-xl bg-destructive/10 flex items-center justify-center"><AlertTriangle className="w-5 h-5 text-destructive" /></div>
              <DialogTitle className="text-foreground">Confirmer le désistement</DialogTitle>
            </div>
            <DialogDescription asChild>
              <div className="pt-2 space-y-3 text-sm text-muted-foreground">
                <p>Vous êtes sur le point de désister <strong className="text-foreground">{desistementName}</strong>.</p>
                <p>
                  Cela signifie que vous ne souhaitez plus que cet enfant participe à la Colonie de Vacances 2026.
                  {/* Cette demande sera envoyée à l'administration pour validation. */}
                </p>
                {/* <p>Vous pourrez annuler cette demande tant que le gestionnaire ne l'a pas encore validée.</p> */}
                {isTitulaireDesistement && enfantN1 && !inscriptionsCloturees && (
                  <p className="text-foreground font-medium">
                    💡 Avant de confirmer, souhaitez-vous définir <strong>{enfantN1.prenom} {enfantN1.nom}</strong> (actuellement Suppléant N1) comme nouveau Titulaire ? Cliquez sur le bouton ci-dessous pour effectuer ce changement avant le désistement.
                  </p>
                )}
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col sm:flex-row gap-2 pt-2">
            <Button variant="outline" onClick={() => setDesistementOpen(false)} className="rounded-lg">Annuler</Button>
            {isTitulaireDesistement && enfantN1 && !inscriptionsCloturees && (
              <Button onClick={handleSwapAndDesist} variant="outline" className="rounded-lg gap-1 text-accent border-accent/30 hover:bg-accent hover:text-white hover:border-accent whitespace-normal text-left">
                <ArrowUpDown className="w-3 h-3 shrink-0" />Promouvoir en titulaire
              </Button>
            )}
            <Button onClick={confirmDesistement} className="rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/90 whitespace-nowrap">Confirmer le désistement</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel desist error */}
      <Dialog open={cancelDesistError} onOpenChange={setCancelDesistError}>
        <DialogContent className="sm:max-w-md rounded-xl">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center"><AlertTriangle className="w-5 h-5 text-amber-600" /></div>
              <DialogTitle className="text-foreground">Annulation impossible</DialogTitle>
            </div>
            <DialogDescription className="pt-2">
              Le gestionnaire a déjà validé le désistement de cet enfant. L'annulation n'est plus possible à ce stade.
              <br /><br />Si vous souhaitez remettre votre enfant dans le processus d'inscription, veuillez utiliser le bouton <strong>« Réinscrire »</strong> disponible sur la fiche de cet enfant. L'enfant sera réintégré dans sa liste d'origine en respectant l'ordre d'arrivée.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter><Button onClick={() => setCancelDesistError(false)} className="bg-primary text-primary-foreground rounded-lg">Compris</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Réinscrire */}
      <Dialog open={reinscrireOpen} onOpenChange={setReinscrireOpen}>
        <DialogContent className="sm:max-w-md rounded-xl">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center"><RotateCcw className="w-5 h-5 text-accent" /></div>
              <DialogTitle className="text-foreground">Réinscrire l'enfant</DialogTitle>
            </div>
            <DialogDescription className="pt-2">
              Vous souhaitez réinscrire <strong>{reinscireName}</strong> après son désistement.
              <br /><br /><strong>Important :</strong> L'enfant sera réintégré dans sa liste d'origine mais ne retrouvera pas son ancien rang. Il sera placé en fin de liste en respectant l'ordre d'arrivée{/* (nouvelle date d'inscription) */}.
              {/* <br /><br />La demande devra à nouveau être validée par le gestionnaire. */}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReinscrireOpen(false)} className="rounded-lg">Annuler</Button>
            <Button variant="outline" onClick={confirmReinscrire} className="rounded-lg hover:bg-accent hover:text-white hover:border-accent">Confirmer la réinscription</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
