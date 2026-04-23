'use client';
import { useRouter } from 'next/navigation';
import { Coins, LogOut } from 'lucide-react';
import { useAuth } from '@/lib/store';
import { NotificationsBell } from './NotificationsBell';

export function TopBar({ showBalance = true }: { showBalance?: boolean }) {
  const router = useRouter();
  const { user, logout } = useAuth();

  async function onLogout() {
    await logout();
    router.push('/login');
  }

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between border-b border-navy-700/60 bg-navy-900/70 px-6 py-4 backdrop-blur">
      <div className="text-sm text-navy-200">
        Signed in as <span className="font-semibold text-gold-300">{user?.email}</span>
        <span className="ml-2 inline-block rounded-full border border-navy-600 bg-navy-800 px-2 py-0.5 text-xs uppercase tracking-wide text-navy-100">
          {user?.role}
        </span>
      </div>
      <div className="flex items-center gap-3">
        {showBalance && user && (
          <div className="flex items-center gap-2 rounded-xl border border-gold-500/40 bg-gold-500/10 px-3 py-1.5 text-sm font-semibold text-gold-300">
            <Coins className="h-4 w-4" />
            {Number(user.balancePoints).toLocaleString()} pts
          </div>
        )}
        <NotificationsBell />
        <button
          onClick={onLogout}
          className="flex items-center gap-2 rounded-xl border border-navy-600 bg-navy-800/50 px-3 py-2 text-sm text-navy-100 hover:border-red-500/40 hover:text-red-300"
        >
          <LogOut className="h-4 w-4" />
          Logout
        </button>
      </div>
    </header>
  );
}
