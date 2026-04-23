'use client';
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Users, Mail, CreditCard, TrendingUp, ShoppingBag, MessageCircle } from 'lucide-react';
import { api } from '@/lib/api';

interface Stats {
  users: { total: number; new30d: number };
  emails: { total: number; available: number };
  orders: { total: number };
  revenue: { total: string; last30d: string };
  topDomains: Array<{ name: string; count: string }>;
  revenueByDay: Array<{ day: string; amount: number }>;
  ordersByDay: Array<{ day: string; count: number }>;
  pendingTickets: number;
}

export default function AdminDashboard() {
  const [s, setS] = useState<Stats | null>(null);

  useEffect(() => {
    api<Stats>('/admin/stats/overview').then(setS);
  }, []);

  if (!s) return <div className="text-navy-300">Loading...</div>;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-bold text-gradient-gold">Dashboard</h1>
        <p className="mt-2 text-navy-200">Operational overview for the last 30 days.</p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={Users} label="Total users" value={s.users.total.toLocaleString()} sub={`+${s.users.new30d} in 30d`} />
        <Stat icon={Mail} label="Emails in DB" value={s.emails.total.toLocaleString()} sub={`${s.emails.available.toLocaleString()} available`} />
        <Stat icon={ShoppingBag} label="Total orders" value={s.orders.total.toLocaleString()} />
        <Stat icon={CreditCard} label="Revenue (30d)" value={`$${Number(s.revenue.last30d).toFixed(2)}`} sub={`Total $${Number(s.revenue.total).toFixed(2)}`} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <ChartCard title="Revenue (last 30 days)" data={s.revenueByDay} yKey="amount" prefix="$" />
        <ChartCard title="Orders (last 30 days)" data={s.ordersByDay} yKey="count" />
      </div>

      <div className="grid gap-5 lg:grid-cols-[2fr_1fr]">
        <div className="card">
          <h2 className="mb-4 font-display text-lg font-bold text-gold-300">Top domains</h2>
          {s.topDomains.length === 0 ? (
            <div className="text-navy-300">No data yet.</div>
          ) : (
            <div className="space-y-2">
              {s.topDomains.map((d, i) => {
                const max = Number(s.topDomains[0]!.count);
                const pct = max > 0 ? (Number(d.count) / max) * 100 : 0;
                return (
                  <motion.div
                    key={d.name}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.03 }}
                  >
                    <div className="flex justify-between text-sm">
                      <span className="font-mono text-navy-100">{d.name}</span>
                      <span className="text-navy-300">{Number(d.count).toLocaleString()}</span>
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-navy-900">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ delay: i * 0.04, duration: 0.6 }}
                        className="h-full bg-gold-gradient"
                      />
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>

        <div className="card">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gold-500/10 text-gold-400">
              <MessageCircle className="h-5 w-5" />
            </div>
            <div className="text-xs uppercase tracking-wider text-navy-300">Open tickets</div>
          </div>
          <div className="mt-3 font-display text-4xl font-bold text-gradient-gold">
            {s.pendingTickets}
          </div>
          <a href="/admin/tickets" className="mt-4 inline-block text-sm text-gold-400 hover:text-gold-300">
            Review open tickets →
          </a>
        </div>
      </div>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
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
      {sub && <div className="mt-1 text-xs text-navy-300">{sub}</div>}
    </motion.div>
  );
}

function ChartCard({
  title,
  data,
  yKey,
  prefix = '',
}: {
  title: string;
  data: Array<Record<string, unknown>>;
  yKey: string;
  prefix?: string;
}) {
  const values = data.map((d) => Number(d[yKey] ?? 0));
  const max = Math.max(1, ...values);
  const total = values.reduce((a, b) => a + b, 0);
  return (
    <div className="card">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-bold text-gold-300">{title}</h2>
        <div className="text-xs text-navy-300">
          Sum: {prefix}
          {yKey === 'amount' ? total.toFixed(2) : total.toLocaleString()}
        </div>
      </div>
      <div className="mt-4 flex h-48 items-end gap-1">
        {values.map((v, i) => {
          const h = (v / max) * 100;
          return (
            <motion.div
              key={i}
              initial={{ height: 0 }}
              animate={{ height: `${h}%` }}
              transition={{ delay: i * 0.015, duration: 0.4 }}
              className="flex-1 rounded-t bg-gold-gradient opacity-80 hover:opacity-100"
              title={`${prefix}${v}`}
            />
          );
        })}
      </div>
    </div>
  );
}
