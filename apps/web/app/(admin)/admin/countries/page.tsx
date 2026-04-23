'use client';
import { useEffect, useState } from 'react';
import { Plus, Save, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';

interface Country {
  id: number;
  code: string;
  name: string;
  isActive: boolean;
  _count: { domains: number };
}

export default function CountriesPage() {
  const toast = useToast();
  const [list, setList] = useState<Country[]>([]);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');

  async function load() {
    setList(await api<Country[]>('/admin/countries'));
  }
  useEffect(() => {
    load();
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api('/admin/countries', {
        method: 'POST',
        body: JSON.stringify({ code: code.toUpperCase(), name, isActive: true }),
      });
      toast.push('Country added', 'success');
      setCode('');
      setName('');
      await load();
    } catch (err) {
      toast.push((err as Error).message, 'error');
    }
  }

  async function toggle(id: number, isActive: boolean) {
    try {
      await api(`/admin/countries/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive }),
      });
      await load();
    } catch (err) {
      toast.push((err as Error).message, 'error');
    }
  }

  async function del(id: number) {
    if (!confirm('Delete this country? Domains will be unlinked.')) return;
    try {
      await api(`/admin/countries/${id}`, { method: 'DELETE' });
      toast.push('Deleted', 'success');
      await load();
    } catch (err) {
      toast.push((err as Error).message, 'error');
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold text-gradient-gold">Countries</h1>
        <p className="mt-2 text-navy-200">
          Map domains to countries so users can filter emails by geography.
        </p>
      </div>

      <form onSubmit={add} className="card grid gap-4 sm:grid-cols-[1fr_2fr_auto]">
        <div>
          <label className="label">ISO Code</label>
          <input
            required
            maxLength={2}
            className="input-field uppercase"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
        </div>
        <div>
          <label className="label">Name</label>
          <input required className="input-field" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="flex items-end">
          <button className="btn-gold h-11">
            <Plus className="mr-2 h-5 w-5" /> Add
          </button>
        </div>
      </form>

      <div className="card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-navy-300">
              <tr>
                <th className="py-2">Code</th>
                <th>Name</th>
                <th>Domains</th>
                <th>Active</th>
                <th></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-700/60">
              {list.map((c) => (
                <tr key={c.id} className="text-navy-100">
                  <td className="py-2 font-mono">{c.code}</td>
                  <td>{c.name}</td>
                  <td>{c._count.domains}</td>
                  <td>
                    <input
                      type="checkbox"
                      checked={c.isActive}
                      onChange={(e) => toggle(c.id, e.target.checked)}
                      className="h-4 w-4 accent-gold-500"
                    />
                  </td>
                  <td>
                    <button
                      onClick={() => del(c.id)}
                      className="btn-ghost h-8 px-2 text-xs hover:!border-red-500/40 hover:!text-red-300"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
