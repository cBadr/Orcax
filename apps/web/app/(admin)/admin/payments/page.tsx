'use client';
import { useEffect, useState } from 'react';
import { Check, RefreshCw, Search as SearchIcon } from 'lucide-react';
import { api } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';

interface Payment {
  id: string;
  userId: string;
  userEmail: string;
  amountUsd: string;
  amountPoints: string;
  currency: string;
  status: string;
  txid: string | null;
  createdAt: string;
  confirmedAt: string | null;
}

export default function AdminPaymentsPage() {
  const toast = useToast();
  const [items, setItems] = useState<Payment[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [userEmail, setUserEmail] = useState('');

  async function load() {
    const qs = new URLSearchParams({
      page: String(page),
      pageSize: '30',
      ...(status ? { status } : {}),
      ...(userEmail ? { userEmail } : {}),
    });
    const r = await api<{ items: Payment[]; total: number }>(`/admin/payments?${qs}`);
    setItems(r.items);
    setTotal(r.total);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  async function forceConfirm(id: string) {
    if (!confirm('Force-confirm this payment? Points will be credited to the user.')) return;
    try {
      await api(`/admin/payments/${id}/force-confirm`, { method: 'POST' });
      toast.push('Payment confirmed', 'success');
      await load();
    } catch (err) {
      toast.push((err as Error).message, 'error');
    }
  }

  async function reconcile(id: string) {
    try {
      const r = await api<{ current: string; cpStatus: string | null }>(
        `/admin/payments/${id}/reconcile`,
        { method: 'POST' },
      );
      toast.push(
        r.current === 'confirmed'
          ? 'Confirmed from CoinPayments'
          : `CP status: ${r.cpStatus ?? 'unknown'} · local: ${r.current}`,
        r.current === 'confirmed' ? 'success' : 'info',
      );
      await load();
    } catch (err) {
      toast.push((err as Error).message, 'error');
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold text-gradient-gold">Payments</h1>
        <p className="mt-2 text-navy-200">All top-up transactions.</p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          load();
        }}
        className="card grid gap-3 sm:grid-cols-[1fr_1fr_auto]"
      >
        <select className="input-field" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="confirmed">Confirmed</option>
          <option value="failed">Failed</option>
          <option value="canceled">Canceled</option>
        </select>
        <input
          className="input-field"
          placeholder="User email"
          value={userEmail}
          onChange={(e) => setUserEmail(e.target.value)}
        />
        <button className="btn-gold h-11">
          <SearchIcon className="mr-2 h-5 w-5" /> Filter
        </button>
      </form>

      <div className="card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-navy-300">
              <tr>
                <th className="py-2">Date</th>
                <th>User</th>
                <th>Amount</th>
                <th>Points</th>
                <th>Currency</th>
                <th>Status</th>
                <th>TXID</th>
                <th></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-700/60">
              {items.map((p) => (
                <tr key={p.id} className="text-navy-100">
                  <td className="py-2 text-xs text-navy-300">
                    {new Date(p.createdAt).toLocaleString()}
                  </td>
                  <td className="text-xs">{p.userEmail}</td>
                  <td>${Number(p.amountUsd).toFixed(2)}</td>
                  <td className="text-gold-300">{Number(p.amountPoints).toLocaleString()}</td>
                  <td>{p.currency}</td>
                  <td className="capitalize">{p.status}</td>
                  <td className="font-mono text-xs text-navy-300">
                    {p.txid ? p.txid.slice(0, 10) + '...' : '—'}
                  </td>
                  <td className="flex gap-1">
                    {p.status === 'pending' && (
                      <>
                        <button
                          onClick={() => reconcile(p.id)}
                          className="btn-ghost h-8 px-2 text-xs"
                          title="Re-check with CoinPayments"
                        >
                          <RefreshCw className="mr-1 h-3 w-3" /> Recheck
                        </button>
                        <button
                          onClick={() => forceConfirm(p.id)}
                          className="btn-ghost h-8 px-2 text-xs"
                        >
                          <Check className="mr-1 h-3 w-3" /> Confirm
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4 flex items-center justify-between text-sm text-navy-200">
          <div>Page {page} · {total} payments</div>
          <div className="flex gap-2">
            <button
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
              className="btn-ghost h-8 px-3 text-xs disabled:opacity-40"
            >
              Prev
            </button>
            <button
              disabled={page * 30 >= total}
              onClick={() => setPage((p) => p + 1)}
              className="btn-ghost h-8 px-3 text-xs disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
