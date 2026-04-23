'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  LayoutDashboard, Users, Shield, Mail, FolderInput, Globe, AtSign, Tag, CreditCard,
  ShoppingBag, Download, UserCog, Ticket, Megaphone, ScrollText, Settings,
} from 'lucide-react';
import { Sidebar, type NavItem } from '@/components/layout/Sidebar';
import { TopBar } from '@/components/layout/TopBar';
import { useAuth } from '@/lib/store';

const ADMIN_ROLES = ['super_admin', 'admin', 'moderator'];

const NAV: NavItem[] = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/admin/users', label: 'Users', icon: Users },
  { href: '/admin/roles', label: 'Roles', icon: Shield },
  { href: '/admin/emails', label: 'Emails', icon: Mail },
  { href: '/admin/ingestion', label: 'Ingestion', icon: FolderInput },
  { href: '/admin/domains', label: 'Domains', icon: AtSign },
  { href: '/admin/countries', label: 'Countries', icon: Globe },
  { href: '/admin/pricing', label: 'Pricing', icon: Tag },
  { href: '/admin/payments', label: 'Payments', icon: CreditCard },
  { href: '/admin/orders', label: 'Orders', icon: ShoppingBag },
  { href: '/admin/exports', label: 'Exports', icon: Download },
  { href: '/admin/resellers', label: 'Resellers', icon: UserCog },
  { href: '/admin/tickets', label: 'Tickets', icon: Ticket },
  { href: '/admin/announcements', label: 'Announcements', icon: Megaphone },
  { href: '/admin/audit-log', label: 'Audit Log', icon: ScrollText },
  { href: '/admin/settings', label: 'Settings', icon: Settings },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, hydrated } = useAuth();

  useEffect(() => {
    if (!hydrated) return;
    if (!user) router.push('/login');
    else if (!ADMIN_ROLES.includes(user.role)) router.push('/dashboard');
  }, [user, hydrated, router]);

  if (!hydrated || !user || !ADMIN_ROLES.includes(user.role)) return null;

  return (
    <div className="flex">
      <Sidebar items={NAV} />
      <div className="min-h-screen flex-1">
        <TopBar showBalance={false} />
        <main className="p-6 md:p-8">{children}</main>
      </div>
    </div>
  );
}
