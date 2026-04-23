'use client';
import { Fragment, useEffect, useState } from 'react';
import { Search as SearchIcon } from 'lucide-react';
import { api } from '@/lib/api';

interface AuditRow {
  id: string;
  action: string;
  actorEmail: string;
  targetType: string | null;
  targetId: string | null;
  diff: unknown;
  ip: string | null;
  createdAt: string;
}

export default function AuditLogPage() {
  const [items, setItems] = useState<AuditRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');
  const [actorEmail, setActorEmail] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  async function load() {
    const qs = new URLSearchParams({ page: String(page), pageSize: '50' });
    if (action) qs.set('action', action);
    if (actorEmail) qs.set('actorEmail', actorEmail);
    const r = await api<{ items: AuditRow[]; total: number }>(`/admin/audit?${qs}`);
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
        <h1 className="font-display text-3xl font-bold text-gradient-gold">Audit Log</h1>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          load();
        }}
        className="card grid gap-3 sm:grid-cols-[2fr_2fr_auto]"
      >
        <input className="input-field" placeholder="Action contains (e.g. user.update)" value={action} onChange={(e) => setAction(e.target.value)} />
        <input className="input-field" placeholder="Actor email" value={actorEmail} onChange={(e) => setActorEmail(e.target.value)} />
        <button className="btn-gold h-11">
          <SearchIcon className="mr-2 h-5 w-5" /> Filter
        </button>
      </form>

      <div className="card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-navy-300">
              <tr>
                <th className="py-2">Date</th>
                <th>Actor</th>
                <th>Action</th>
                <th>Target</th>
                <th>IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-700/60">
              {items.map((a) => (
                <Fragment key={a.id}>
                  <tr
                    onClick={() => setExpanded((p) => (p === a.id ? null : a.id))}
                    className="cursor-pointer text-navy-100 hover:bg-navy-800/40"
                  >
                    <td className="py-2 text-xs text-navy-300">{new Date(a.createdAt).toLocaleString()}</td>
                    <td className="text-xs">{a.actorEmail}</td>
                    <td className="font-mono text-xs text-gold-300">{a.action}</td>
                    <td className="text-xs text-navy-300">
                      {a.targetType}
                      {a.targetId && `:${a.targetId}`}
                    </td>
                    <td className="text-xs text-navy-300">{a.ip ?? '—'}</td>
                  </tr>
                  {expanded === a.id && a.diff !== null && (
                    <tr>
                      <td colSpan={5} className="bg-navy-950/60 p-3">
                        <pre className="overflow-x-auto text-xs text-navy-100">
                          {JSON.stringify(a.diff, null, 2)}
                        </pre>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4 flex items-center justify-between text-sm text-navy-200">
          <div>Page {page} · {total.toLocaleString()}</div>
          <div className="flex gap-2">
            <button disabled={page === 1} onClick={() => setPage((p) => p - 1)} className="btn-ghost h-8 px-3 text-xs disabled:opacity-40">Prev</button>
            <button disabled={page * 50 >= total} onClick={() => setPage((p) => p + 1)} className="btn-ghost h-8 px-3 text-xs disabled:opacity-40">Next</button>
          </div>
        </div>
      </div>
    </div>
  );
}
