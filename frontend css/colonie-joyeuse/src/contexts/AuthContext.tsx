import React, { createContext, useContext, useState, ReactNode } from 'react';
import { Parent } from '@/data/mockData';
import { apiRequest } from '@/lib/api';

type UserRole = 'parent' | 'gestionnaire' | 'super_admin' | null;
type AuthStep = 'logged_out' | 'force_password_change' | 'forgot_password' | 'logged_in';

interface AuthContextType {
  role: UserRole;
  parent: Parent | null;
  adminEmail: string | null;
  token: string | null;
  authStep: AuthStep;
  loginAsParent: (matricule: string, password: string) => Promise<void>;
  loginAsAdmin: (email: string, password: string) => Promise<void>;
  logout: () => void;
  setAuthStep: (step: AuthStep) => void;
  pendingParent: Parent | null;
  setPendingParent: (p: Parent | null) => void;
  pendingAdminFirstLogin: { email: string; token: string } | null;
  setPendingAdminFirstLogin: (v: { email: string; token: string } | null) => void;
  refreshParentProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<UserRole>(null);
  const [parent, setParent] = useState<Parent | null>(null);
  const [adminEmail, setAdminEmail] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [authStep, setAuthStep] = useState<AuthStep>('logged_out');
  const [pendingParent, setPendingParent] = useState<Parent | null>(null);
  const [pendingAdminFirstLogin, setPendingAdminFirstLogin] = useState<{ email: string; token: string } | null>(null);

  const refreshParentProfile = async () => {
    if (!token || role !== 'parent') return;
    const me = await apiRequest<any>('/auth/me', { token });
    const p = me.parent || {};
    setParent({
      matricule: p.matricule || me.matricule,
      prenom: p.prenom || '',
      nom: p.nom || '',
      service: p.service || '',
      site: p.site_code || undefined,
      site_code: p.site_code || undefined,
      site_nom: p.site_nom || undefined,
      email: p.email || undefined,
      telephone: p.telephone || undefined,
      motDePasse: '',
    });
  };

  const loginAsParent = async (matricule: string, password: string) => {
    const res = await apiRequest<{ access_token: string; token_type: string; must_change_password?: boolean }>('/auth/login-parent', {
      method: 'POST',
      body: JSON.stringify({ matricule, password }),
    });
    if (res.must_change_password) {
      setAuthStep('force_password_change');
      setToken(res.access_token);
      const me = await apiRequest<any>('/auth/me', { token: res.access_token });
      const p = me.parent || {};
      setPendingParent({
        matricule: p.matricule || me.matricule || matricule,
        prenom: p.prenom || '',
        nom: p.nom || '',
        service: p.service || '',
        site: p.site_code || undefined,
        site_code: p.site_code || undefined,
        site_nom: p.site_nom || undefined,
        email: p.email || undefined,
        telephone: p.telephone || undefined,
        motDePasse: '',
      });
      return;
    }
    setToken(res.access_token);
    const me = await apiRequest<any>('/auth/me', { token: res.access_token });
    const p = me.parent || {};
    setRole('parent');
    setParent({
      matricule: p.matricule || me.matricule,
      prenom: p.prenom || '',
      nom: p.nom || '',
      service: p.service || '',
      site: p.site_code || undefined,
      site_code: p.site_code || undefined,
      site_nom: p.site_nom || undefined,
      email: p.email || undefined,
      telephone: p.telephone || undefined,
      motDePasse: '',
    });
    setAdminEmail(null);
    setAuthStep('logged_in');
  };

  const loginAsAdmin = async (email: string, password: string) => {
    const res = await apiRequest<{ access_token: string; token_type: string; must_change_password?: boolean }>('/auth/login-admin', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    if (res.must_change_password) {
      setPendingAdminFirstLogin({ email, token: res.access_token });
      setToken(res.access_token);
      setAuthStep('force_password_change');
      return;
    }
    const me = await apiRequest<any>('/auth/me', { token: res.access_token });
    setRole(me.role === 'SUPER_ADMIN' || me.role === 'super_admin' ? 'super_admin' : 'gestionnaire');
    setAdminEmail(email);
    setToken(res.access_token);
    setParent(null);
    setAuthStep('logged_in');
  };

  const logout = () => {
    setRole(null);
    setParent(null);
    setAdminEmail(null);
    setToken(null);
    setAuthStep('logged_out');
    setPendingParent(null);
    setPendingAdminFirstLogin(null);
  };

  return (
    <AuthContext.Provider value={{
      role,
      parent,
      adminEmail,
      token,
      authStep,
      loginAsParent,
      loginAsAdmin,
      logout,
      setAuthStep,
      pendingParent,
      setPendingParent,
      pendingAdminFirstLogin,
      setPendingAdminFirstLogin,
      refreshParentProfile,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
