'use client';
import { useEffect } from 'react';
import { useAuth, useBranding } from '@/lib/store';
import { ToastProvider } from '@/components/ui/Toast';

export function Providers({ children }: { children: React.ReactNode }) {
  const hydrate = useAuth((s) => s.refresh);
  const loadBranding = useBranding((s) => s.load);

  useEffect(() => {
    loadBranding();
    if (typeof window !== 'undefined' && localStorage.getItem('accessToken')) {
      hydrate();
    } else {
      useAuth.setState({ hydrated: true });
    }
  }, [hydrate, loadBranding]);

  return <ToastProvider>{children}</ToastProvider>;
}
