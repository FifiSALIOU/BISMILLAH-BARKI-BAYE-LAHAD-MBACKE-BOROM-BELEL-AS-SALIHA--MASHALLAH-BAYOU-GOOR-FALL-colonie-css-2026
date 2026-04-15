import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { ParentSidebar } from '@/components/parent/ParentSidebar';
import ParentDashboard from '@/components/parent/ParentDashboard';
import { LogOut } from 'lucide-react';
import logo from '@/assets/logo.png';

export default function ParentLayout() {
  const { parent, logout } = useAuth();
  const [currentPage, setCurrentPage] = useState('dashboard');

  if (!parent) return null;

  const handleNavigate = (page: string) => {
    setCurrentPage(page);
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        {/* Sidebar parent masqué à la demande.
        <ParentSidebar currentPage={currentPage} onNavigate={handleNavigate} />
        */}
        <div className="flex-1 flex flex-col min-h-screen min-w-0">
          <header className="h-[76px] w-full border-b border-[hsl(var(--sidebar-border))] bg-[#0A1628] text-white flex items-center justify-between px-4 sticky top-0 z-20 shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <img src={logo} alt="Logo CSS" className="w-10 h-10 object-contain shrink-0" />
              <div className="min-w-0">
                <p className="text-lg font-bold leading-tight">Colonie de Vacances</p>
                <p className="text-sm text-white/75 truncate">Espace Parent — {parent.prenom} {parent.nom} ({parent.matricule})</p>
              </div>
            </div>
            <div className="flex items-center gap-4 shrink-0">
              <button onClick={logout} className="p-2 rounded-lg hover:bg-white/10 transition-colors text-white/90 hover:text-white">
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </header>
          <main className="flex-1 p-6 bg-background overflow-auto">
            <ParentDashboard />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
