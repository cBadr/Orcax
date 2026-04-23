'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';

interface Country {
  id: number;
  code: string;
  name: string;
}
interface Domain {
  id: number;
  name: string;
  tld: string;
  countryId: number | null;
  country: Country | null;
  isActive: boolean;
  emailsCount: string;
}

export default function DomainsPage() {
  const toast = useToast();
  const [items, setItems] = useState<Domain[]>([]);
  const [total, setTotal] = useState(0);
  const [countries, setCountries] = useState<Country[]>([]);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');

  async function load() {
    const qs = new URLSearchParams({
      page: String(page),
      pageSize: '50',
      ...(search ? { search } : {}),
    });
    const res = await api<{ items: Domain[]; total: number }>(`/admin/domains?${qs}`);
    setItems(res.items);
    setTotal(res.total);
  }

  useEffect(() => {
    api<Country[]>('/admin/countries').then((c) => setCountries(c.map((x) => ({ id: x.id, code: x.code, name: x.name }))));
  }, []);
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  async function updateDomain(id: number, patch: Partial<Domain>) {
    try {
      await api(`/admin/domains/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
      await load();
    } catch (err) {
      toast.push((err as Error).message, 'error');
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold text-gradient-gold">Domains</h1>
        <p className="mt-2 text-navy-200">Assign countries to domains and toggle activity.</p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          load();
        }}
        className="card"
      >
        <input
          className="input-field max-w-md"
          placeholder="Search domains..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </form>

      <div className="card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-navy-300">
              <tr>
                <th className="py-2">Domain</th>
                <th>TLD</th>
                <th>Emails</th>
                <th>Country</th>
                <th>Active</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-700/60">
              {items.map((d) => (
                <tr key={d.id} className="text-navy-100">
                  <td className="py-2 font-mono">{d.name}</td>
                  <td className="text-navy-300">.{d.tld}</td>
                  <td>{Number(d.emailsCount).toLocaleString()}</td>
                  <td>
                    <select
                      className="input-field h-9 py-1"
                      value={d.countryId ?? ''}
                      onChange={(e) =>
                        updateDomain(d.id, {
                          countryId: e.target.value ? Number(e.target.value) : null,
                        })
                      }
                    >
                      <option value="">—</option>
                      {countries.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.code} · {c.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      checked={d.isActive}
                      onChange={(e) => updateDomain(d.id, { isActive: e.target.checked })}
                      className="h-4 w-4 accent-gold-500"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4 flex items-center justify-between text-sm text-navy-200">
          <div>Page {page} · {total.toLocaleString()} domains</div>
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
