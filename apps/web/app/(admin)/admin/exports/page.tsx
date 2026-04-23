'use client';
import { useEffect, useState } from 'react';
import { Search as SearchIcon, Cloud, AlertCircle } from 'lucide-react';
import { api } from '@/lib/api';

interface ExportRow {
  id: string;
  userEmail: string;
  orderId: string | null;
  format: string;
  status: string;
  totalCount: number;
  fileSizeBytes: string | null;
  goFileUrl: string | null;
  expiresAt: string | null;
  errorMessage: string | null;
  createdAt: string;
  finishedAt: string | null;
}

export default function AdminExportsPage() {
  const [items, setItems] = useState<ExportRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [userEmail, setUserEmail] = useState('');

  async function load() {
    const qs = new URLSearchParams({ page: String(page), pageSize: '30' });
    if (status) qs.set('status', status);
    if (userEmail) qs.set('userEmail', userEmail);
    const r = await api<{ items: ExportRow[]; total: number }>(`/admin/exports?${qs}`);
    setItems(r.items);
    setTotal(r.total);
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold text-gradient-gold">Exports</h1>
        <p className="mt-2 text-navy-200">Every export job across the platform (auto-refreshes).</p>
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
          <option value="queued">Queued</option>
          <option value="running">Running</option>
          <option value="done">Done</option>
          <option value="error">Error</option>
        </select>
        <input className="input-field" placeholder="User email" value={userEmail} onChange={(e) => setUserEmail(e.target.value)} />
        <button className="btn-gold h-11">
          <SearchIcon className="mr-2 h-5 w-5" /> Filter
        </button>
      </form>

      <div className="card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-navy-300">
              <tr>
                <th className="py-2">Date</th>
                <th>User</th>
                <th>Format</th>
                <th>Emails</th>
                <th>Size</th>
                <th>Status</th>
                <th>Cloud</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-700/60">
              {items.map((e) => (
                <tr key={e.id} className="text-navy-100">
                  <td className="py-2 text-xs text-navy-300">{new Date(e.createdAt).toLocaleString()}</td>
                  <td className="text-xs">{e.userEmail}</td>
                  <td className="uppercase">{e.format}</td>
                  <td>{e.totalCount.toLocaleString()}</td>
                  <td className="text-xs text-navy-300">
                    {e.fileSizeBytes ? formatBytes(Number(e.fileSizeBytes)) : '—'}
                  </td>
                  <td>
                    <StatusPill status={e.status} />
                    {e.errorMessage && (
                      <div className="mt-1 flex items-center gap-1 text-xs text-red-300">
                        <AlertCircle className="h-3 w-3" /> {e.errorMessage.slice(0, 50)}
                      </div>
                    )}
                  </td>
                  <td>
                    {e.goFileUrl ? (
                      <a href={e.goFileUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-gold-300 hover:text-gold-200">
                        <Cloud className="h-3 w-3" /> Open
                      </a>
                    ) : (
                      <span className="text-xs text-navy-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {items.length === 0 && <div className="py-6 text-center text-navy-300">No exports yet.</div>}
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

function StatusPill({ status }: { status: string }) {
  const color =
    status === 'done'
      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
      : status === 'running' || status === 'queued'
        ? 'bg-gold-500/15 text-gold-300 border-gold-500/40 animate-pulse'
        : 'bg-red-500/15 text-red-300 border-red-500/40';
  return (
    <span className={`rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${color}`}>
      {status}
    </span>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}
