'use client';
import { useEffect, useState } from 'react';
import { Search as SearchIcon } from 'lucide-react';
import { api } from '@/lib/api';

interface Order {
  id: string;
  userEmail: string;
  userId: string;
  totalCount: number;
  totalPoints: string;
  status: string;
  createdAt: string;
}

export default function AdminOrdersPage() {
  const [items, setItems] = useState<Order[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [userEmail, setUserEmail] = useState('');

  async function load() {
    const qs = new URLSearchParams({ page: String(page), pageSize: '30' });
    if (status) qs.set('status', status);
    if (userEmail) qs.set('userEmail', userEmail);
    const r = await api<{ items: Order[]; total: number }>(`/admin/orders?${qs}`);
    setItems(r.items);
    setTotal(r.total);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold text-gradient-gold">Orders</h1>
        <p className="mt-2 text-navy-200">All confirmed purchases across the platform.</p>
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
          <option value="completed">Completed</option>
          <option value="refunded">Refunded</option>
        </select>
        <input className="input-field" placeholder="User email" value={userEmail} onChange={(e) => setUserEmail(e.target.value)} />
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
                <th>Order ID</th>
                <th>User</th>
                <th>Emails</th>
                <th>Points</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-700/60">
              {items.map((o) => (
                <tr key={o.id} className="text-navy-100">
                  <td className="py-2 text-xs text-navy-300">{new Date(o.createdAt).toLocaleString()}</td>
                  <td className="font-mono text-xs">#{o.id.slice(0, 10)}</td>
                  <td className="text-xs">{o.userEmail}</td>
                  <td>{o.totalCount.toLocaleString()}</td>
                  <td className="text-gold-300">{Number(o.totalPoints).toLocaleString()}</td>
                  <td>
                    <span className={`rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${
                      o.status === 'refunded'
                        ? 'border-red-500/40 bg-red-500/10 text-red-300'
                        : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                    }`}>{o.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {items.length === 0 && <div className="py-6 text-center text-navy-300">No orders yet.</div>}
        <div className="mt-4 flex items-center justify-between text-sm text-navy-200">
          <div>Page {page} · {total.toLocaleString()}</div>
          <div className="flex gap-2">
            <button disabled={page === 1} onClick={() => setPage((p) => p - 1)} className="btn-ghost h-8 px-3 text-xs disabled:opacity-40">Prev</button>
            <button disabled={page * 30 >= total} onClick={() => setPage((p) => p + 1)} className="btn-ghost h-8 px-3 text-xs disabled:opacity-40">Next</button>
          </div>
        </div>
      </div>
    </div>
  );
}
