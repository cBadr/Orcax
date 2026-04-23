'use client';
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Coins, CreditCard, Sparkles, ExternalLink, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useBranding, useAuth } from '@/lib/store';
import { useToast } from '@/components/ui/Toast';

interface Payment {
  id: string;
  amountUsd: string;
  amountPoints: string;
  currency: string;
  status: string;
  createdAt: string;
  confirmedAt: string | null;
  txid: string | null;
}

interface Estimate {
  basePoints: string;
  bonusPoints: string;
  totalPoints: string;
  bonusPct: number;
}

export default function BillingPage() {
  const toast = useToast();
  const settings = useBranding((s) => s.settings);
  const user = useAuth((s) => s.user);
  const [amount, setAmount] = useState(50);
  const [currency, setCurrency] = useState('USDT.TRC20');
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(false);

  const minTopup = (settings.min_topup_usd as number) ?? 10;
  const maxTopup = (settings.max_topup_usd as number) ?? 3000;
  const currencies = (settings.coinpayments_currencies as string[]) ?? [
    'BTC', 'USDT.TRC20', 'ETH', 'LTC',
  ];

  async function loadPayments() {
    const r = await api<{ items: Payment[] }>('/billing/payments');
    setPayments(r.items);
  }
  useEffect(() => {
    loadPayments();
  }, []);

  useEffect(() => {
    if (amount < minTopup) return;
    api<Estimate>('/billing/estimate', {
      method: 'POST',
      body: JSON.stringify({ amountUsd: amount }),
    })
      .then(setEstimate)
      .catch(() => setEstimate(null));
  }, [amount, minTopup]);

  async function onTopup(e: React.FormEvent) {
    e.preventDefault();
    if (amount < minTopup || amount > maxTopup) {
      toast.push(`Amount must be between $${minTopup} and $${maxTopup}`, 'error');
      return;
    }
    setLoading(true);
    try {
      const res = await api<{ invoiceUrl: string; paymentId: string }>('/billing/topup', {
        method: 'POST',
        body: JSON.stringify({ amountUsd: amount, currency }),
      });
      toast.push('Invoice created. Redirecting...', 'success');
      window.open(res.invoiceUrl, '_blank', 'noopener,noreferrer');
      await loadPayments();
    } catch (err) {
      toast.push((err as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold text-gradient-gold">Billing</h1>
        <p className="mt-2 text-navy-200">Top up your balance with crypto.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr_3fr]">
        {/* Balance + Top up form */}
        <div className="space-y-5">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="card border-gold-500/30 bg-gradient-to-br from-navy-800/70 to-navy-900/70"
          >
            <div className="flex items-center gap-3 text-gold-400">
              <Coins className="h-5 w-5" />
              <span className="text-xs uppercase tracking-wider">Current balance</span>
            </div>
            <div className="mt-3 font-display text-4xl font-bold text-gradient-gold">
              {Number(user?.balancePoints ?? 0).toLocaleString()}
              <span className="ml-2 text-lg text-navy-200">pts</span>
            </div>
          </motion.div>

          <form onSubmit={onTopup} className="card space-y-4">
            <h2 className="font-display text-lg font-bold text-gold-300">Top up</h2>

            <div>
              <label className="label">Amount (USD)</label>
              <input
                type="number"
                min={minTopup}
                max={maxTopup}
                step={1}
                required
                className="input-field"
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
              />
              <div className="mt-1 text-xs text-navy-300">
                Min ${minTopup} · Max ${maxTopup}
              </div>
            </div>

            <div>
              <label className="label">Pay with</label>
              <div className="grid grid-cols-3 gap-2">
                {currencies.map((c) => (
                  <button
                    type="button"
                    key={c}
                    onClick={() => setCurrency(c)}
                    className={`rounded-xl border px-3 py-2 text-sm font-medium transition ${
                      currency === c
                        ? 'border-gold-500 bg-gold-500/10 text-gold-300'
                        : 'border-navy-600 bg-navy-900/40 text-navy-100 hover:border-gold-500/40'
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>

            {estimate && (
              <motion.div
                key={`${estimate.totalPoints}-${estimate.bonusPct}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="rounded-xl bg-navy-950/60 p-4"
              >
                <div className="flex items-baseline justify-between">
                  <span className="text-xs uppercase tracking-wider text-navy-300">You will receive</span>
                  {estimate.bonusPct > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-300">
                      <Sparkles className="h-3 w-3" /> +{estimate.bonusPct}% bonus
                    </span>
                  )}
                </div>
                <div className="mt-1 font-display text-3xl font-bold text-gradient-gold">
                  {Number(estimate.totalPoints).toLocaleString()}
                  <span className="ml-2 text-sm text-navy-200">pts</span>
                </div>
                {estimate.bonusPct > 0 && (
                  <div className="mt-1 text-xs text-navy-300">
                    Base: {Number(estimate.basePoints).toLocaleString()} + Bonus:{' '}
                    {Number(estimate.bonusPoints).toLocaleString()}
                  </div>
                )}
              </motion.div>
            )}

            <button disabled={loading} className="btn-gold w-full animate-pulse-gold">
              {loading ? (
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              ) : (
                <CreditCard className="mr-2 h-5 w-5" />
              )}
              {loading ? 'Creating invoice...' : `Pay $${amount}`}
            </button>
            <p className="text-xs text-navy-300">
              You will be redirected to CoinPayments. Your balance is credited automatically once the payment confirms on-chain.
            </p>
          </form>
        </div>

        {/* History */}
        <div className="card">
          <h2 className="mb-4 font-display text-lg font-bold text-gold-300">Payment history</h2>
          {payments.length === 0 ? (
            <div className="text-navy-300">No payments yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px] text-sm">
                <thead className="text-left text-xs uppercase tracking-wider text-navy-300">
                  <tr>
                    <th className="py-2">Date</th>
                    <th>Amount</th>
                    <th>Points</th>
                    <th>Currency</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-navy-700/60">
                  {payments.map((p) => (
                    <tr key={p.id} className="text-navy-100">
                      <td className="py-2 text-xs text-navy-300">
                        {new Date(p.createdAt).toLocaleString()}
                      </td>
                      <td>${Number(p.amountUsd).toFixed(2)}</td>
                      <td className="text-gold-300">
                        {Number(p.amountPoints).toLocaleString()}
                      </td>
                      <td>{p.currency}</td>
                      <td>
                        <StatusPill status={p.status} />
                      </td>
                      <td>
                        {p.status === 'pending' && (
                          <button
                            onClick={async () => {
                              try {
                                const r = await api<{ current: string }>(
                                  `/billing/payments/${p.id}/reconcile`,
                                  { method: 'POST' },
                                );
                                if (r.current === 'confirmed') {
                                  toast.push('Payment confirmed!', 'success');
                                } else {
                                  toast.push('Still pending on CoinPayments', 'info');
                                }
                                await loadPayments();
                              } catch (err) {
                                toast.push((err as Error).message, 'error');
                              }
                            }}
                            className="btn-ghost h-8 px-2 text-xs"
                          >
                            Check now
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const color =
    status === 'confirmed'
      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
      : status === 'pending'
        ? 'bg-gold-500/15 text-gold-300 border-gold-500/40 animate-pulse'
        : 'bg-red-500/15 text-red-300 border-red-500/40';
  return (
    <span className={`rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${color}`}>
      {status}
    </span>
  );
}
