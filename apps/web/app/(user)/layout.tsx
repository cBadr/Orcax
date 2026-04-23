'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { LayoutDashboard, Search, ShoppingBag, Download, CreditCard, Receipt, Ticket, Users, Settings } from 'lucide-react';
import { Sidebar, type NavItem } from '@/components/layout/Sidebar';
import { TopBar } from '@/components/layout/TopBar';
import { AnnouncementsBanner } from '@/components/layout/AnnouncementsBanner';
import { useAuth } from '@/lib/store';

const NAV: NavItem[] = [
  { href: '/dashboard', label: 'Overview', icon: LayoutDashboard },
  { href: '/search', label: 'Search Emails', icon: Search },
  { href: '/orders', label: 'My Orders', icon: ShoppingBag },
  { href: '/exports', label: 'Exports', icon: Download },
  { href: '/billing', label: 'Billing', icon: CreditCard },
  { href: '/billing/ledger', label: 'Ledger', icon: Receipt },
  { href: '/tickets', label: 'Support', icon: Ticket },
  { href: '/referrals', label: 'Referrals', icon: Users },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export default function UserLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, hydrated } = useAuth();

  useEffect(() => {
    if (hydrated && !user) router.push('/login');
  }, [user, hydrated, router]);

  if (!hydrated) return null;
  if (!user) return null;

  return (
    <div className="flex">
      <Sidebar items={NAV} />
      <div className="min-h-screen flex-1">
        <TopBar />
        <AnnouncementsBanner />
        <main className="p-6 md:p-8">{children}</main>
      </div>
    </div>
  );
}
