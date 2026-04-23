'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import { Logo } from '@/components/ui/Logo';
import { cn } from '@/lib/cn';

export interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

export function Sidebar({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-r border-navy-700/60 bg-navy-900/60 backdrop-blur md:block">
      <div className="p-6">
        <Logo />
      </div>
      <nav className="px-3 pb-6">
        {items.map((it) => {
          const active = pathname === it.href || pathname.startsWith(it.href + '/');
          const Icon = it.icon;
          return (
            <Link key={it.href} href={it.href} className="block">
              <motion.div
                whileHover={{ x: 4 }}
                className={cn(
                  'mb-1 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors',
                  active
                    ? 'bg-gold-500/10 text-gold-300 shadow-[inset_2px_0_0_0_#d4af37]'
                    : 'text-navy-100 hover:bg-navy-800/60 hover:text-gold-300',
                )}
              >
                <Icon className="h-5 w-5" />
                <span className="font-medium">{it.label}</span>
              </motion.div>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
