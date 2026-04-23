'use client';
import { create } from 'zustand';
import { api, clearTokens, setTokens } from './api';

export interface AuthUser {
  id: string;
  email: string;
  role: string;
  balancePoints: string;
  referralCode: string;
}

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  hydrated: boolean;
  setUser: (u: AuthUser | null) => void;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

export const useAuth = create<AuthState>((set, get) => ({
  user: null,
  loading: false,
  hydrated: false,
  setUser: (u) => set({ user: u }),

  login: async (email, password) => {
    set({ loading: true });
    try {
      const res = await api<{
        accessToken: string;
        refreshToken: string;
        user: AuthUser;
      }>('/auth/login', {
        method: 'POST',
        auth: false,
        body: JSON.stringify({ email, password }),
      });
      setTokens(res.accessToken, res.refreshToken);
      set({ user: res.user });
    } finally {
      set({ loading: false });
    }
  },

  logout: async () => {
    const rt = typeof window !== 'undefined' ? localStorage.getItem('refreshToken') : null;
    try {
      await api('/auth/logout', {
        method: 'POST',
        auth: false,
        body: JSON.stringify({ refreshToken: rt }),
      });
    } catch {
      // ignore
    }
    clearTokens();
    set({ user: null });
  },

  refresh: async () => {
    try {
      const me = await api<AuthUser>('/auth/me');
      set({ user: me, hydrated: true });
    } catch {
      set({ user: null, hydrated: true });
    }
  },
}));

interface BrandingState {
  settings: Record<string, unknown>;
  loaded: boolean;
  load: () => Promise<void>;
  reload: () => Promise<void>;
}

async function applyBrandingToDocument(settings: Record<string, unknown>) {
  if (typeof document === 'undefined') return;
  const name = (settings.site_name as string) || 'Platform';
  const tagline = (settings.site_tagline as string) || '';
  document.title = tagline ? `${name} · ${tagline}` : name;

  const favicon = settings.favicon_url as string | undefined;
  if (favicon) {
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = favicon;
  }

  const primary = settings.primary_color as string | undefined;
  const accent = settings.accent_color as string | undefined;
  if (primary) document.documentElement.style.setProperty('--brand-primary', primary);
  if (accent) document.documentElement.style.setProperty('--brand-accent', accent);
}

async function fetchBranding(): Promise<Record<string, unknown>> {
  return api<Record<string, unknown>>('/settings/public', { auth: false });
}

export const useBranding = create<BrandingState>((set, get) => ({
  settings: {},
  loaded: false,
  load: async () => {
    if (get().loaded) return;
    try {
      const settings = await fetchBranding();
      await applyBrandingToDocument(settings);
      set({ settings, loaded: true });
    } catch {
      set({ loaded: true });
    }
  },
  reload: async () => {
    try {
      const settings = await fetchBranding();
      await applyBrandingToDocument(settings);
      set({ settings, loaded: true });
    } catch {
      // keep previous settings
    }
  },
}));
