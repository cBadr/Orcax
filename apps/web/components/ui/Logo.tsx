'use client';
import { useBranding } from '@/lib/store';

export function Logo({ className = '' }: { className?: string }) {
  const settings = useBranding((s) => s.settings);
  const name = (settings.site_name as string) ?? 'Platform';
  const logo = settings.logo_url as string | undefined;

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo} alt={name} className="h-9 w-9 rounded-lg object-contain" />
      ) : (
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gold-gradient font-display text-lg font-bold text-navy-950 shadow-glow">
          {name[0]?.toUpperCase() ?? 'P'}
        </div>
      )}
      <div className="font-display text-xl font-bold tracking-tight text-gradient-gold">
        {name}
      </div>
    </div>
  );
}
