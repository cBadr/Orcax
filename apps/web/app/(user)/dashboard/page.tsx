'use client';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { Search, Coins, TrendingUp, Sparkles } from 'lucide-react';
import { useAuth } from '@/lib/store';

export default function DashboardPage() {
  const user = useAuth((s) => s.user);

  return (
    <div className="space-y-8">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="font-display text-3xl font-bold text-gradient-gold">
          Welcome{user ? `, ${user.email.split('@')[0]}` : ''}
        </h1>
        <p className="mt-2 text-navy-200">
          Ready to unlock your next high-value lead batch? Let's go.
        </p>
      </motion.div>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard icon={Coins} label="Balance" value={`${Number(user?.balancePoints ?? 0).toLocaleString()} pts`} />
        <StatCard icon={TrendingUp} label="Orders" value="—" />
        <StatCard icon={Sparkles} label="Referrals" value="—" />
      </div>

      <Link href="/search">
        <motion.div
          whileHover={{ scale: 1.01 }}
          className="card flex items-center justify-between border-gold-500/30 bg-gradient-to-br from-navy-800/70 to-navy-900/70"
        >
          <div>
            <div className="font-display text-xl font-bold text-gradient-gold">Start a new search</div>
            <p className="mt-1 text-sm text-navy-200">
              Filter by domain, country, local-part patterns, and more.
            </p>
          </div>
          <div className="btn-gold">
            <Search className="mr-2 h-5 w-5" /> Open Search
          </div>
        </motion.div>
      </Link>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <motion.div
      whileHover={{ y: -3 }}
      className="card flex items-center gap-4"
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gold-500/10 text-gold-400">
        <Icon className="h-6 w-6" />
      </div>
      <div>
        <div className="text-xs uppercase tracking-wider text-navy-300">{label}</div>
        <div className="mt-1 font-display text-2xl font-bold text-navy-50">{value}</div>
      </div>
    </motion.div>
  );
}
