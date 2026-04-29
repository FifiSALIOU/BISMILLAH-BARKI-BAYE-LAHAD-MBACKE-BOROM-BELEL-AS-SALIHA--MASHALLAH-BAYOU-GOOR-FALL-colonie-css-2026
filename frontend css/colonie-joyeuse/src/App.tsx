import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { InscriptionProvider } from "@/contexts/InscriptionContext";
import Index from "./pages/Index.tsx";
import HomePage from "./pages/HomePage.tsx";

import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <InscriptionProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/admin-login" element={<Index />} />
              {/* Parent routes */}
              <Route path="/dashboard" element={<Index page="dashboard" />} />
              {/* Gestionnaire routes */}
              <Route path="/dashboard/gestionnaire" element={<Index page="admin_dashboard" />} />
              <Route path="/dashboard/liste-inscriptions" element={<Index page="inscriptions_admin" />} />
              <Route path="/dashboard/liste/principale" element={<Index page="liste_principale" />} />
              <Route path="/dashboard/liste/attente-1" element={<Index page="liste_n1" />} />
              <Route path="/dashboard/liste/attente-2" element={<Index page="liste_n2" />} />
              <Route path="/dashboard/liste/demandes-desistees" element={<Index page="liste_desistees" />} />
              <Route path="/dashboard/liste/demandes-rejetees" element={<Index page="liste_rejetees" />} />
              <Route path="/dashboard/liste-finale" element={<Index page="liste_finale" />} />
              <Route path="/dashboard/statistiques" element={<Index page="statistiques" />} />
              <Route path="/dashboard/historique" element={<Index page="historique" />} />
              {/* Super Admin routes */}
              <Route path="/dashboard/admin" element={<Index page="admin_dashboard" />} />
              <Route path="/dashboard/admin/utilisateurs" element={<Index page="utilisateurs" />} />
              <Route path="/dashboard/admin/envoi-mails" element={<Index page="parents_list" />} />
              <Route path="/dashboard/admin/enfants" element={<Index page="chargement_enfants" />} />
              <Route path="/dashboard/admin/envoi-sms" element={<Index page="envoie_sms" />} />
              <Route path="/dashboard/admin/journal" element={<Index page="journal_logs" />} />
              <Route path="/dashboard/admin/parametres" element={<Index page="parametres" />} />
              <Route path="/dashboard/admin/listes" element={<Index page="gestion_listes_config" />} />
              <Route path="/dashboard/admin/services" element={<Index page="gestion_services" />} />
              <Route path="/dashboard/admin/sites" element={<Index page="gestion_sites" />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </InscriptionProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
