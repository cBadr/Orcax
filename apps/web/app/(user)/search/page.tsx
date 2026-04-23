'use client';
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { Search, Sparkles, Coins, Lock, X, Loader2, Check, Timer } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/store';
import { useToast } from '@/components/ui/Toast';
import { MultiCombobox } from '@/components/ui/MultiCombobox';

interface Domain {
  id: number;
  name: string;
  emailsCount: string;
  countryId: number | null;
}
interface Country {
  id: number;
  code: string;
  name: string;
}

interface SearchSummary {
  searchId: string;
  totalFound: number;
  demoCount: number;
  perDomain: Array<{
    domainId: number;
    domain: string;
    available: number;
    requested: number;
    pointsPerEmail: number;
  }>;
  previewEmails: string[];
  estimatedPoints: string;
  estimatedDiscountPct: number;
}

export default function SearchPage() {
  const router = useRouter();
  const toast = useToast();
  const refreshUser = useAuth((s) => s.refresh);

  const [countries, setCountries] = useState<Country[]>([]);
  const [allDomains, setAllDomains] = useState<Domain[]>([]);
  const [selectedDomains, setSelectedDomains] = useState<string[]>([]);
  const [selectedCountries, setSelectedCountries] = useState<number[]>([]);

  const [totalQty, setTotalQty] = useState<number | ''>(1000);
  const [localContains, setLocalContains] = useState('');
  const [localStartsWith, setLocalStartsWith] = useState('');
  const [localEndsWith, setLocalEndsWith] = useState('');

  const [running, setRunning] = useState(false);
  const [summary, setSummary] = useState<SearchSummary | null>(null);

  const [reservation, setReservation] = useState<{
    reservationId: string;
    totalCount: number;
    totalPoints: string;
    expiresAt?: string;
  } | null>(null);
  const [reserving, setReserving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number>(0);

  useEffect(() => {
    api<Country[]>('/countries', { auth: false }).then(setCountries);
    api<{ items: Domain[] }>('/domains?pageSize=500').then((d) => setAllDomains(d.items));
  }, []);

  useEffect(() => {
    if (!reservation?.expiresAt) return;
    const end = new Date(reservation.expiresAt).getTime();
    const t = setInterval(() => {
      setTimeLeft(Math.max(0, Math.floor((end - Date.now()) / 1000)));
    }, 1000);
    return () => clearInterval(t);
  }, [reservation?.expiresAt]);

  function buildFilters() {
    return {
      domains: selectedDomains.length > 0 ? selectedDomains : undefined,
      countryIds: selectedCountries.length > 0 ? selectedCountries : undefined,
      totalQty: typeof totalQty === 'number' && totalQty > 0 ? totalQty : undefined,
      localPartContains: localContains || undefined,
      localPartStartsWith: localStartsWith || undefined,
      localPartEndsWith: localEndsWith || undefined,
      randomize: true,
    };
  }

  async function onSearch() {
    setRunning(true);
    setSummary(null);
    setReservation(null);
    try {
      const res = await api<SearchSummary>('/search', {
        method: 'POST',
        body: JSON.stringify(buildFilters()),
      });
      setSummary(res);
      if (res.totalFound === 0) toast.push('No emails matched your filters', 'info');
    } catch (err) {
      toast.push((err as Error).message, 'error');
    } finally {
      setRunning(false);
    }
  }

  async function onReserve() {
    if (!summary) return;
    setReserving(true);
    try {
      const res = await api<{ reservationId: string; totalCount: number; totalPoints: string }>(
        '/reservations',
        {
          method: 'POST',
          body: JSON.stringify({ searchId: summary.searchId, filters: buildFilters() }),
        },
      );
      // Compute expiresAt client-side from the TTL; or fetch detail
      const detail = await api<{ expiresAt: string }>(`/reservations/${res.reservationId}`);
      setReservation({ ...res, expiresAt: detail.expiresAt });
      toast.push(`Reserved ${res.totalCount} emails`, 'success');
    } catch (err) {
      toast.push((err as Error).message, 'error');
    } finally {
      setReserving(false);
    }
  }

  async function onCancelReservation() {
    if (!reservation) return;
    try {
      await api(`/reservations/${reservation.reservationId}`, { method: 'DELETE' });
      toast.push('Reservation released', 'info');
      setReservation(null);
    } catch (err) {
      toast.push((err as Error).message, 'error');
    }
  }

  async function onConfirm() {
    if (!reservation) return;
    setConfirming(true);
    try {
      const res = await api<{ orderId: string; newBalance: string }>(
        `/reservations/${reservation.reservationId}/confirm`,
        { method: 'POST' },
      );
      toast.push('Order confirmed! Points deducted.', 'success');
      await refreshUser();
      router.push(`/orders/${res.orderId}`);
    } catch (err) {
      toast.push((err as Error).message, 'error');
    } finally {
      setConfirming(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold text-gradient-gold">Search Emails</h1>
        <p className="mt-2 text-navy-200">
          Explore, reserve, and unlock verified email inventory. Search is always free — you only pay when you confirm.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_2fr]">
        {/* Filters */}
        <div className="card space-y-5">
          <h2 className="font-display text-lg font-bold text-gold-300">Filters</h2>

          <div>
            <label className="label">Domains</label>
            <MultiCombobox
              items={allDomains.map((d) => ({
                id: d.name,
                label: d.name,
                sub: Number(d.emailsCount).toLocaleString(),
              }))}
              selectedIds={selectedDomains}
              onChange={(ids) => setSelectedDomains(ids as string[])}
              placeholder="All domains"
              searchPlaceholder="Type to filter domains..."
              maxHeight={300}
            />
          </div>

          <div>
            <label className="label">Countries</label>
            <MultiCombobox
              items={countries.map((c) => ({
                id: c.id,
                label: c.name,
                sub: c.code,
              }))}
              selectedIds={selectedCountries}
              onChange={(ids) => setSelectedCountries(ids as number[])}
              placeholder="Any country"
              searchPlaceholder="Type country name..."
              maxHeight={260}
            />
          </div>

          <div>
            <label className="label">Quantity (total)</label>
            <input
              type="number"
              min={1}
              className="input-field"
              value={totalQty}
              onChange={(e) => setTotalQty(e.target.value === '' ? '' : Number(e.target.value))}
            />
          </div>

          <div>
            <label className="label">Local part contains</label>
            <input className="input-field" placeholder="e.g. info" value={localContains} onChange={(e) => setLocalContains(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Starts with</label>
              <input className="input-field" value={localStartsWith} onChange={(e) => setLocalStartsWith(e.target.value)} />
            </div>
            <div>
              <label className="label">Ends with</label>
              <input className="input-field" value={localEndsWith} onChange={(e) => setLocalEndsWith(e.target.value)} />
            </div>
          </div>

          <button onClick={onSearch} disabled={running} className="btn-gold w-full">
            {running ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Search className="mr-2 h-5 w-5" />}
            {running ? 'Searching...' : 'Run search'}
          </button>
        </div>

        {/* Results */}
        <div className="space-y-5">
          <AnimatePresence mode="wait">
            {!summary && !running && (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="card flex min-h-[200px] items-center justify-center text-center"
              >
                <div>
                  <Sparkles className="mx-auto h-10 w-10 text-gold-400" />
                  <div className="mt-3 font-display text-lg text-navy-100">Set your filters</div>
                  <div className="text-sm text-navy-300">Run a search to see available emails.</div>
                </div>
              </motion.div>
            )}

            {summary && (
              <motion.div
                key="summary"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-5"
              >
                <div className="card">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-xs uppercase tracking-wider text-navy-300">Matched</div>
                      <div className="font-display text-3xl font-bold text-gradient-gold">
                        {summary.totalFound.toLocaleString()} emails
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs uppercase tracking-wider text-navy-300">Estimated cost</div>
                      <div className="flex items-center justify-end gap-2 font-display text-2xl font-bold text-gold-300">
                        <Coins className="h-5 w-5" />
                        {Number(summary.estimatedPoints).toLocaleString()} pts
                      </div>
                      {summary.estimatedDiscountPct > 0 && (
                        <div className="mt-1 text-xs text-emerald-300">
                          {summary.estimatedDiscountPct.toFixed(1)}% bulk discount applied
                        </div>
                      )}
                    </div>
                  </div>

                  {summary.perDomain.length > 0 && (
                    <div className="mt-5 grid gap-2 text-sm">
                      {summary.perDomain.map((p) => (
                        <div
                          key={p.domainId}
                          className="flex items-center justify-between rounded-lg bg-navy-950/60 px-3 py-2"
                        >
                          <span className="font-mono text-navy-100">{p.domain}</span>
                          <span className="text-navy-300">
                            {p.requested.toLocaleString()} of {p.available.toLocaleString()} · {p.pointsPerEmail} pts/email
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {!reservation && summary.totalFound > 0 && (
                    <button
                      onClick={onReserve}
                      disabled={reserving}
                      className="btn-gold mt-5 w-full animate-pulse-gold"
                    >
                      {reserving ? (
                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      ) : (
                        <Lock className="mr-2 h-5 w-5" />
                      )}
                      {reserving ? 'Reserving...' : `Reserve ${summary.totalFound.toLocaleString()} emails`}
                    </button>
                  )}
                </div>

                {/* Preview */}
                {summary.previewEmails.length > 0 && (
                  <div className="card">
                    <h3 className="font-display text-sm font-bold uppercase tracking-wider text-navy-300">
                      Preview ({summary.previewEmails.length} masked)
                    </h3>
                    <div className="mt-3 grid grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-3">
                      {summary.previewEmails.map((e, i) => (
                        <motion.div
                          key={i}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: i * 0.01 }}
                          className="font-mono text-xs text-navy-100"
                        >
                          {e}
                        </motion.div>
                      ))}
                    </div>
                    <div className="mt-3 text-xs text-navy-300">
                      Real emails are revealed after you confirm the reservation.
                    </div>
                  </div>
                )}

                {reservation && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="card border-gold-500/40 bg-gold-500/5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 text-gold-300">
                          <Lock className="h-5 w-5" />
                          <span className="font-display text-lg font-bold">
                            Reservation locked
                          </span>
                        </div>
                        <div className="mt-1 text-sm text-navy-200">
                          {reservation.totalCount.toLocaleString()} emails · {Number(reservation.totalPoints).toLocaleString()} pts
                        </div>
                      </div>
                      <div className="flex items-center gap-2 rounded-lg bg-navy-900/80 px-3 py-1.5 text-sm font-mono text-gold-300">
                        <Timer className="h-4 w-4" />
                        {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
                      </div>
                    </div>
                    <div className="mt-5 flex flex-wrap gap-3">
                      <button
                        onClick={onConfirm}
                        disabled={confirming || timeLeft === 0}
                        className="btn-gold"
                      >
                        {confirming ? (
                          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                        ) : (
                          <Check className="mr-2 h-5 w-5" />
                        )}
                        {confirming ? 'Confirming...' : 'Confirm & pay'}
                      </button>
                      <button onClick={onCancelReservation} className="btn-ghost">
                        <X className="mr-2 h-5 w-5" /> Release
                      </button>
                    </div>
                  </motion.div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
