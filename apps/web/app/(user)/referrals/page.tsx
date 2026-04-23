'use client';
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Copy, Users, Coins, Share2, Check } from 'lucide-react';
import { api } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';

interface Referrals {
  enabled: boolean;
  referralCode: string;
  commissionPct: number;
  invitedCount: number;
  totalEarnedPoints: string;
  transactionCount: number;
  recent: Array<{ id: string; email: string; earnedPoints: string; createdAt: string }>;
}

export default function ReferralsPage() {
  const toast = useToast();
  const [data, setData] = useState<Referrals | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api<Referrals>('/referrals').then(setData);
  }, []);

  async function copyLink() {
    if (!data) return;
    const link = `${window.location.origin}/register?ref=${data.referralCode}`;
    await navigator.clipboard.writeText(link);
    setCopied(true);
    toast.push('Link copied!', 'success');
    setTimeout(() => setCopied(false), 2000);
  }

  if (!data) return <div className="text-navy-300">Loading...</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold text-gradient-gold">Referrals</h1>
        <p className="mt-2 text-navy-200">
          Earn <b className="text-gold-300">{data.commissionPct}%</b> of every top-up from users you invite. Forever.
        </p>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="card border-gold-500/30 bg-gradient-to-br from-navy-800/70 to-navy-900/70"
      >
        <div className="flex items-center gap-3 text-gold-400">
          <Share2 className="h-5 w-5" />
          <span className="text-xs uppercase tracking-wider">Your referral code</span>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <div className="font-display text-4xl font-bold text-gradient-gold">
            {data.referralCode}
          </div>
          <button onClick={copyLink} className="btn-gold">
            {copied ? <Check className="mr-2 h-5 w-5" /> : <Copy className="mr-2 h-5 w-5" />}
            {copied ? 'Copied!' : 'Copy invite link'}
          </button>
        </div>
      </motion.div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard icon={Users} label="Invited users" value={data.invitedCount.toString()} />
        <StatCard icon={Coins} label="Points earned" value={Number(data.totalEarnedPoints).toLocaleString()} />
        <StatCard icon={Share2} label="Commissions" value={data.transactionCount.toString()} />
      </div>

      <div className="card">
        <h2 className="mb-4 font-display text-lg font-bold text-gold-300">Recent earnings</h2>
        {data.recent.length === 0 ? (
          <div className="text-navy-300">No commissions yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-navy-300">
              <tr>
                <th className="py-2">Date</th>
                <th>Referred user</th>
                <th className="text-right">Earned</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-700/60">
              {data.recent.map((r) => (
                <tr key={r.id} className="text-navy-100">
                  <td className="py-2 text-xs text-navy-300">{new Date(r.createdAt).toLocaleString()}</td>
                  <td className="text-xs">{r.email}</td>
                  <td className="text-right text-emerald-300">
                    +{Number(r.earnedPoints).toLocaleString()} pts
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
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
    <motion.div whileHover={{ y: -3 }} className="card">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gold-500/10 text-gold-400">
          <Icon className="h-5 w-5" />
        </div>
        <div className="text-xs uppercase tracking-wider text-navy-300">{label}</div>
      </div>
      <div className="mt-3 font-display text-2xl font-bold text-navy-50">{value}</div>
    </motion.div>
  );
}
