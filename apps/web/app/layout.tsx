import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

// Fetch branding at request time so SSR title/favicon reflect the latest admin
// settings without a redeploy. Gracefully falls back to defaults during builds
// (when the API isn't running) — the client-side store picks up live values.
export async function generateMetadata(): Promise<Metadata> {
  const fallback: Metadata = {
    title: 'Platform',
    description: 'Premium Email Intelligence',
  };
  // Skip the fetch entirely during `next build` to avoid ECONNREFUSED noise.
  if (process.env.NEXT_PHASE === 'phase-production-build') return fallback;
  try {
    const res = await fetch(`${API_URL}/settings/public`, {
      next: { revalidate: 30 },
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) return fallback;
    const s = (await res.json()) as Record<string, unknown>;
    const name = (s.site_name as string) || 'Platform';
    const tagline = (s.site_tagline as string) || 'Premium Email Intelligence';
    const favicon = s.favicon_url as string | undefined;
    return {
      title: { default: name, template: `%s · ${name}` },
      description: tagline,
      icons: favicon ? { icon: favicon } : undefined,
    };
  } catch {
    return fallback;
  }
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-hero-radial">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
