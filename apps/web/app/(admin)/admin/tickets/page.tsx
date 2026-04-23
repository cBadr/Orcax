'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { api } from '@/lib/api';

interface Ticket {
  id: string;
  subject: string;
  status: string;
  priority: string;
  userEmail: string;
  messagesCount: number;
  updatedAt: string;
}

export default function AdminTicketsPage() {
  const [items, setItems] = useState<Ticket[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');

  async function load() {
    const qs = new URLSearchParams({ page: String(page), pageSize: '30' });
    if (status) qs.set('status', status);
    const r = await api<{ items: Ticket[]; total: number }>(`/admin/tickets?${qs}`);
    setItems(r.items);
    setTotal(r.total);
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, status]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold text-gradient-gold">Support Tickets</h1>
      </div>

      <div className="card">
        <div className="mb-4 flex items-center gap-3">
          <select className="input-field w-40" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="">All</option>
            <option value="open">Open</option>
            <option value="answered">Answered</option>
            <option value="closed">Closed</option>
          </select>
        </div>

        {items.length === 0 ? (
          <div className="text-navy-300">No tickets.</div>
        ) : (
          <div className="divide-y divide-navy-700/60">
            {items.map((t) => (
              <Link key={t.id} href={`/admin/tickets/${t.id}`} className="flex items-center justify-between py-4 hover:bg-navy-800/40">
                <div>
                  <div className="font-display text-navy-50">{t.subject}</div>
                  <div className="mt-1 text-xs text-navy-300">
                    {t.userEmail} · {t.messagesCount} msgs · {new Date(t.updatedAt).toLocaleString()}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${
                    t.priority === 'high' ? 'border-red-500/40 bg-red-500/10 text-red-300' : 'border-navy-600 bg-navy-800 text-navy-100'
                  }`}>{t.priority}</span>
                  <span className={`rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${
                    t.status === 'answered' ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' :
                    t.status === 'closed' ? 'border-navy-600 bg-navy-800 text-navy-300' :
                    'border-gold-500/40 bg-gold-500/10 text-gold-300'
                  }`}>{t.status}</span>
                  <ChevronRight className="h-5 w-5 text-navy-300" />
                </div>
              </Link>
            ))}
          </div>
        )}

        {total > 30 && (
          <div className="mt-4 flex items-center justify-between text-sm text-navy-200">
            <div>Page {page} · {total}</div>
            <div className="flex gap-2">
              <button disabled={page === 1} onClick={() => setPage((p) => p - 1)} className="btn-ghost h-8 px-3 text-xs disabled:opacity-40">Prev</button>
              <button disabled={page * 30 >= total} onClick={() => setPage((p) => p + 1)} className="btn-ghost h-8 px-3 text-xs disabled:opacity-40">Next</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
