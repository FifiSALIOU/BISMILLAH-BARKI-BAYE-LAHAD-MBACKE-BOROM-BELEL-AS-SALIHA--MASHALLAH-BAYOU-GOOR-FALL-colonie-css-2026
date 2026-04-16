import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AdminSidebar } from '@/components/admin/AdminSidebar';
import AdminDashboard from '@/components/admin/AdminDashboard';
import ListeInscriptions from '@/components/admin/ListeInscriptions';
import GestionListe from '@/components/admin/GestionListe';
import ListeDemandesDesistees from '@/components/admin/ListeDemandesDesistees';
import ListeDemandesRejetees from '@/components/admin/ListeDemandesRejetees';
import ListeFinale from '@/components/admin/ListeFinale';
import Statistiques from '@/components/admin/Statistiques';
import GestionUtilisateurs from '@/components/admin/GestionUtilisateurs';
import GestionParents from '@/components/admin/GestionParents';
import ChargementEnfantsSuperAdmin from '@/components/admin/ChargementEnfantsSuperAdmin';
import Parametres from '@/components/admin/Parametres';
import Historique from '@/components/admin/Historique';
import JournalLogs from '@/components/admin/JournalLogs';
import GestionListesConfig from '@/components/admin/GestionListesConfig';
import GestionSites from '@/components/admin/GestionSites';
import GestionServices from '@/components/admin/GestionServices';
import logo from '@/assets/logo.png';
import { LogOut } from 'lucide-react';

interface Props {
  initialPage?: string;
}

export default function AdminLayout({ initialPage }: Props) {
  const { role, adminEmail, logout } = useAuth();
  const navigate = useNavigate();
  const [currentPage, setCurrentPage] = useState(initialPage || 'dashboard');
  const isSuperAdmin = role === 'super_admin';

  useEffect(() => {
    if (initialPage) {
      // Map route-based page names to internal names
      const pageMap: Record<string, string> = {
        admin_dashboard: 'dashboard',
        inscriptions_admin: 'inscriptions',
      };
      setCurrentPage(pageMap[initialPage] || initialPage);
    }
  }, [initialPage]);

  const routeMap: Record<string, string> = {
    dashboard: isSuperAdmin ? '/dashboard/admin' : '/dashboard/gestionnaire',
    inscriptions: '/dashboard/liste-inscriptions',
    liste_principale: '/dashboard/liste/principale',
    liste_n1: '/dashboard/liste/attente-1',
    liste_n2: '/dashboard/liste/attente-2',
    liste_desistees: '/dashboard/liste/demandes-desistees',
    liste_rejetees: '/dashboard/liste/demandes-rejetees',
    liste_finale: '/dashboard/liste-finale',
    statistiques: '/dashboard/statistiques',
    historique: '/dashboard/historique',
    utilisateurs: '/dashboard/admin/utilisateurs',
    parents_list: '/dashboard/admin/envoi-mails',
    chargement_enfants: '/dashboard/admin/enfants',
    envoie_sms: '/dashboard/admin/envoi-sms',
    journal_logs: '/dashboard/admin/journal',
    parametres: '/dashboard/admin/parametres',
    gestion_listes_config: '/dashboard/admin/listes',
    gestion_services: '/dashboard/admin/services',
    gestion_sites: '/dashboard/admin/sites',
  };

  const handleNavigate = (page: string) => {
    setCurrentPage(page);
    if (routeMap[page]) navigate(routeMap[page]);
  };

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard': return <AdminDashboard />;
      case 'inscriptions': return <ListeInscriptions />;
      case 'liste_principale': return <GestionListe type="principale" />;
      case 'liste_n1': return <GestionListe type="attente_n1" />;
      case 'liste_n2': return <GestionListe type="attente_n2" />;
      case 'liste_desistees': return <ListeDemandesDesistees />;
      case 'liste_rejetees': return <ListeDemandesRejetees />;
      case 'liste_finale': return <ListeFinale />;
      case 'statistiques': return <Statistiques />;
      case 'historique': return <Historique />;
      case 'utilisateurs': return isSuperAdmin ? <GestionUtilisateurs /> : <AdminDashboard />;
      case 'parents_list': return isSuperAdmin ? <GestionParents /> : <AdminDashboard />;
      case 'chargement_enfants': return isSuperAdmin ? <ChargementEnfantsSuperAdmin /> : <AdminDashboard />;
      case 'envoie_sms': return isSuperAdmin ? <div className="p-6"><h1 className="text-2xl font-bold text-foreground">Envoie SMS</h1><p className="text-muted-foreground mt-2">Cette fonctionnalité sera bientôt disponible.</p></div> : <AdminDashboard />;
      case 'journal_logs': return isSuperAdmin ? <JournalLogs /> : <AdminDashboard />;
      case 'parametres': return isSuperAdmin ? <Parametres /> : <AdminDashboard />;
      case 'gestion_listes_config': return isSuperAdmin ? <GestionListesConfig /> : <AdminDashboard />;
      case 'gestion_services': return isSuperAdmin ? <GestionServices /> : <AdminDashboard />;
      case 'gestion_sites': return isSuperAdmin ? <GestionSites /> : <AdminDashboard />;
      default: return <AdminDashboard />;
    }
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AdminSidebar currentPage={currentPage} onNavigate={handleNavigate} isSuperAdmin={isSuperAdmin} />
        <div className="flex-1 flex flex-col min-h-screen min-w-0">
          <header className="h-16 border-b border-border bg-card flex items-center justify-between px-4 sticky top-0 z-20 shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <SidebarTrigger />
            </div>
            <div className="flex items-center gap-4 shrink-0">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-semibold text-foreground">{adminEmail}</p>
                <p className="text-xs text-muted-foreground">{isSuperAdmin ? 'Super Administrateur' : 'Gestionnaire'}</p>
              </div>
              <button onClick={logout} className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-destructive">
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </header>
          <main className="flex-1 p-6 bg-background overflow-auto">
            {renderPage()}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
