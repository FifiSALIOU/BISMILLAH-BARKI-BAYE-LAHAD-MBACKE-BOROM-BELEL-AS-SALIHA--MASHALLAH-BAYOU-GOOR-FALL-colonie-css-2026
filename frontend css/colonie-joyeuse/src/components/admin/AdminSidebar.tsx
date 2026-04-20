import React from 'react';
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarMenuSub, SidebarMenuSubItem, SidebarMenuSubButton,
  useSidebar,
} from '@/components/ui/sidebar';
import { LayoutDashboard, FileText, List, BarChart3, Users, Settings, ChevronDown, /* Award, */ History, Database, ListChecks, MapPin, Briefcase, Baby } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import logo from '@/assets/logo.png';

interface Props {
  currentPage: string;
  onNavigate: (page: string) => void;
  isSuperAdmin: boolean;
}

export function AdminSidebar({ currentPage, onNavigate, isSuperAdmin }: Props) {
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  // const isListeActive = ['liste_principale', 'liste_n1', 'liste_n2'].includes(currentPage);
  const isListeActive = ['liste_principale', 'liste_n1', 'liste_n2', 'liste_finale'].includes(currentPage);
  const isHistoriqueSectionActive =
    currentPage === 'historique' || currentPage === 'liste_desistees' || currentPage === 'liste_rejetees';

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        {!collapsed && (
          <div className="p-4 border-b border-sidebar-border">
            <div className="flex items-center gap-3">
              <img src={logo} alt="CSS" className="w-10 h-10 object-contain" />
              <div>
                <p className="font-display font-bold text-sm text-sidebar-foreground">{isSuperAdmin ? 'Super Admin' : 'Gestionnaire'}</p>
                <p className="text-xs text-sidebar-foreground/60">Colonie 2026</p>
              </div>
            </div>
          </div>
        )}

        <SidebarGroup>
          <SidebarGroupLabel>Principal</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton onClick={() => onNavigate('dashboard')} isActive={currentPage === 'dashboard'} tooltip="Tableau de bord">
                  <LayoutDashboard className="w-4 h-4" />{!collapsed && <span>Tableau de bord</span>}
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton onClick={() => onNavigate('inscriptions')} isActive={currentPage === 'inscriptions'} tooltip="Inscriptions">
                  <FileText className="w-4 h-4" />{!collapsed && <span>Liste des inscriptions</span>}
                </SidebarMenuButton>
              </SidebarMenuItem>

              {!collapsed ? (
                <Collapsible defaultOpen={isListeActive}>
                  <SidebarMenuItem>
                    <CollapsibleTrigger asChild>
                      <SidebarMenuButton tooltip="Gestion des listes">
                        <List className="w-4 h-4" /><span className="flex-1">Gestion des listes</span><ChevronDown className="w-3 h-3" />
                      </SidebarMenuButton>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <SidebarMenuSub>
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton onClick={() => onNavigate('liste_principale')} isActive={currentPage === 'liste_principale'}>
                            <span className="w-2 h-2 shrink-0 rounded-full bg-emerald-500" />
                            <span>Liste Principale</span>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton onClick={() => onNavigate('liste_n1')} isActive={currentPage === 'liste_n1'}>
                            <span className="w-2 h-2 shrink-0 rounded-full bg-accent" />
                            <span>Liste N°1</span>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton onClick={() => onNavigate('liste_n2')} isActive={currentPage === 'liste_n2'}>
                            <span className="w-2 h-2 shrink-0 rounded-full bg-primary" />
                            <span>Liste N°2</span>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton onClick={() => onNavigate('liste_finale')} isActive={currentPage === 'liste_finale'}>
                            <span className="w-2 h-2 shrink-0 rounded-full bg-amber-500" />
                            <span>Liste finale des retenus</span>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                        {/*
                        Ancien emplacement sous « Gestion des listes » (désormais sous « Historique »).
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton onClick={() => onNavigate('liste_desistees')} isActive={currentPage === 'liste_desistees'}>
                            <span className="w-2 h-2 shrink-0 rounded-full bg-destructive/70" />
                            <span>Demandes désistées</span>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                        */}
                      </SidebarMenuSub>
                    </CollapsibleContent>
                  </SidebarMenuItem>
                </Collapsible>
              ) : (
                <SidebarMenuItem>
                  {/* tooltip précédent (sans liste finale dans le sous-menu replié) : "Gestion des listes" */}
                  <SidebarMenuButton onClick={() => onNavigate('liste_principale')} isActive={isListeActive} tooltip="Gestion des listes — Principale, N1, N2, Liste finale">
                    <List className="w-4 h-4" />
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}

              {/*
              Ancienne entrée séparée « Liste finale des retenus » (désormais sous Gestion des listes > Liste N°2).
              <SidebarMenuItem>
                <SidebarMenuButton onClick={() => onNavigate('liste_finale')} isActive={currentPage === 'liste_finale'} tooltip="Liste finale">
                  <Award className="w-4 h-4" />{!collapsed && <span>Liste finale des retenus</span>}
                </SidebarMenuButton>
              </SidebarMenuItem>
              */}

              {/*
              Ancien emplacement « Sites » dans Principal (désormais sous Administration, après Utilisateurs).
              {isSuperAdmin && (
                <SidebarMenuItem>
                  <SidebarMenuButton onClick={() => onNavigate('gestion_sites')} isActive={currentPage === 'gestion_sites'} tooltip="Sites">
                    <MapPin className="w-4 h-4" />{!collapsed && <span>Sites</span>}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
              */}

              {/*
              Ancien emplacement « Statistiques » (gestionnaire : désormais après « Historique » ; super admin : Administration).
              <SidebarMenuItem>
                <SidebarMenuButton onClick={() => onNavigate('statistiques')} isActive={currentPage === 'statistiques'} tooltip="Statistiques">
                  <BarChart3 className="w-4 h-4" />{!collapsed && <span>Statistiques</span>}
                </SidebarMenuButton>
              </SidebarMenuItem>
              */}

              {/* Ancien menu : entrée unique « Historique » (sans sous-section).
              <SidebarMenuItem>
                <SidebarMenuButton onClick={() => onNavigate('historique')} isActive={currentPage === 'historique'} tooltip="Historique">
                  <History className="w-4 h-4" />{!collapsed && <span>Historique</span>}
                </SidebarMenuButton>
              </SidebarMenuItem>
              */}
              {!collapsed ? (
                <Collapsible defaultOpen={isHistoriqueSectionActive}>
                  <SidebarMenuItem>
                    <CollapsibleTrigger asChild>
                      <SidebarMenuButton tooltip="Historique">
                        <History className="w-4 h-4" /><span className="flex-1">Historique</span><ChevronDown className="w-3 h-3" />
                      </SidebarMenuButton>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <SidebarMenuSub>
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton onClick={() => onNavigate('liste_desistees')} isActive={currentPage === 'liste_desistees'}>
                            <span className="w-2 h-2 shrink-0 rounded-full bg-destructive/70" />
                            <span>Demandes désistées</span>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton onClick={() => onNavigate('liste_rejetees')} isActive={currentPage === 'liste_rejetees'}>
                            <span className="w-2 h-2 shrink-0 rounded-full bg-amber-600/80" />
                            <span>Demandes refusées</span>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton onClick={() => onNavigate('historique')} isActive={currentPage === 'historique'}>
                            <span className="w-2 h-2 shrink-0 rounded-full bg-muted-foreground/70" />
                            <span>Journal des actions</span>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      </SidebarMenuSub>
                    </CollapsibleContent>
                  </SidebarMenuItem>
                </Collapsible>
              ) : (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    onClick={() => onNavigate('historique')}
                    isActive={isHistoriqueSectionActive}
                    tooltip="Historique — Demandes désistées / refusées / Journal des actions"
                  >
                    <History className="w-4 h-4" />
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
              {!isSuperAdmin && (
                <SidebarMenuItem>
                  <SidebarMenuButton onClick={() => onNavigate('statistiques')} isActive={currentPage === 'statistiques'} tooltip="Statistiques">
                    <BarChart3 className="w-4 h-4" />{!collapsed && <span>Statistiques</span>}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {isSuperAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel>Administration</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton onClick={() => onNavigate('gestion_listes_config')} isActive={currentPage === 'gestion_listes_config'} tooltip="Listes">
                    <ListChecks className="w-4 h-4" />{!collapsed && <span>Listes</span>}
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton onClick={() => onNavigate('gestion_services')} isActive={currentPage === 'gestion_services'} tooltip="Service">
                    <Briefcase className="w-4 h-4" />{!collapsed && <span>Service</span>}
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton onClick={() => onNavigate('utilisateurs')} isActive={currentPage === 'utilisateurs'} tooltip="Utilisateurs">
                    <Users className="w-4 h-4" />{!collapsed && <span>Utilisateurs</span>}
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    onClick={() => onNavigate('chargement_enfants')}
                    isActive={currentPage === 'chargement_enfants'}
                    tooltip="Enfants codifiés (import CSV)"
                  >
                    <Baby className="w-4 h-4" />{!collapsed && <span>Enfants</span>}
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton onClick={() => onNavigate('gestion_sites')} isActive={currentPage === 'gestion_sites'} tooltip="Sites">
                    <MapPin className="w-4 h-4" />{!collapsed && <span>Sites</span>}
                  </SidebarMenuButton>
                </SidebarMenuItem>
                {/*
                <SidebarMenuItem>
                  <SidebarMenuButton onClick={() => onNavigate('parents_list')} isActive={currentPage === 'parents_list'} tooltip="Envoie Mails">
                    <UserCheck className="w-4 h-4" />{!collapsed && <span>Envoie Mails</span>}
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton onClick={() => onNavigate('envoie_sms')} isActive={currentPage === 'envoie_sms'} tooltip="Envoie SMS">
                    <MessageSquare className="w-4 h-4" />{!collapsed && <span>Envoie SMS</span>}
                  </SidebarMenuButton>
                </SidebarMenuItem>
                */}
                <SidebarMenuItem>
                  <SidebarMenuButton onClick={() => onNavigate('statistiques')} isActive={currentPage === 'statistiques'} tooltip="Statistiques">
                    <BarChart3 className="w-4 h-4" />{!collapsed && <span>Statistiques</span>}
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton onClick={() => onNavigate('journal_logs')} isActive={currentPage === 'journal_logs'} tooltip="Journal et Logs">
                    <Database className="w-4 h-4" />{!collapsed && <span>Journal et Logs</span>}
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton onClick={() => onNavigate('parametres')} isActive={currentPage === 'parametres'} tooltip="Paramètres">
                    <Settings className="w-4 h-4" />{!collapsed && <span>Paramètres</span>}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
    </Sidebar>
  );
}
