'use client';
import { useEffect, useState } from 'react';
import { Search as SearchIcon, Mail, Database, HardDrive, Boxes } from 'lucide-react';
import { api } from '@/lib/api';

interface Stats {
  total: number;
  byStatus: Record<string, number>;
  domainsCount: number;
  foldersCount: number;
}

interface EmailRow {
  id: string;
  email: string;
  domain: string;
  status: string;
  reservedUntil: string | null;
  availableAfter: string | null;
  createdAt: string;
}

export default function EmailsPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [rows, setRows] = useState<EmailRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [domain, setDomain] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');

  async function loadStats() {
    setStats(await api<Stats>('/admin/emails/stats'));
  }

  async function loadRows() {
    const qs = new URLSearchParams({
      page: String(page),
      pageSize: '50',
      ...(domain ? { domain } : {}),
      ...(status ? { status } : {}),
      ...(search ? { search } : {}),
    });
    const res = await api<{ items: EmailRow[]; total: number }>(`/admin/emails?${qs}`);
    setRows(res.items);
    setTotal(res.total);
  }

  useEffect(() => {
    loadStats();
  }, []);

  useEffect(() => {
    loadRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  function onFilter(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    loadRows();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold text-gradient-gold">Emails</h1>
        <p className="mt-2 text-navy-200">Inspect the email inventory.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard icon={Mail} label="Total" value={stats?.total.toLocaleString() ?? '—'} />
        <StatCard icon={Database} label="Available" value={(stats?.byStatus.available ?? 0).toLocaleString()} />
        <StatCard icon={HardDrive} label="Sold" value={(stats?.byStatus.sold ?? 0).toLocaleString()} />
        <StatCard icon={Boxes} label="Domains" value={stats?.domainsCount.toLocaleString() ?? '—'} />
      </div>

      <form onSubmit={onFilter} className="card grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
        <input className="input-field" placeholder="Domain (e.g. gmail.com)" value={domain} onChange={(e) => setDomain(e.target.value)} />
        <select className="input-field" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="available">Available</option>
          <option value="reserved">Reserved</option>
          <option value="sold">Sold</option>
        </select>
        <input className="input-field" placeholder="Local part contains" value={search} onChange={(e) => setSearch(e.target.value)} />
        <button className="btn-gold h-11">
          <SearchIcon className="mr-2 h-5 w-5" /> Search
        </button>
      </form>

      <div className="card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-navy-300">
              <tr>
                <th className="py-2">Email</th>
                <th>Domain</th>
                <th>Status</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-700/60">
              {rows.map((r) => (
                <tr key={r.id} className="text-navy-100">
                  <td className="py-2 font-mono text-xs">{r.email}</td>
                  <td>{r.domain}</td>
                  <td className="capitalize">{r.status}</td>
                  <td className="text-xs text-navy-300">{new Date(r.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4 flex items-center justify-between text-sm text-navy-200">
          <div>Page {page} · {total.toLocaleString()} results</div>
          <div className="flex gap-2">
            <button disabled={page === 1} onClick={() => setPage((p) => p - 1)} className="btn-ghost h-8 px-3 text-xs disabled:opacity-40">
              Prev
            </button>
            <button disabled={page * 50 >= total} onClick={() => setPage((p) => p + 1)} className="btn-ghost h-8 px-3 text-xs disabled:opacity-40">
              Next
            </button>
          </div>
        </div>
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
    <div className="card">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gold-500/10 text-gold-400">
          <Icon className="h-5 w-5" />
        </div>
        <div className="text-xs uppercase tracking-wider text-navy-300">{label}</div>
      </div>
      <div className="mt-3 font-display text-xl font-bold text-navy-50">{value}</div>
    </div>
  );
}
