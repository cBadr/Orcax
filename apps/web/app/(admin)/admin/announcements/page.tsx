'use client';
import { useEffect, useState } from 'react';
import { Plus, Trash2, Save, Pencil } from 'lucide-react';
import { api } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';

interface Announcement {
  id: number;
  title: string;
  body: string;
  type: string;
  active: boolean;
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string;
}

export default function AnnouncementsPage() {
  const toast = useToast();
  const [items, setItems] = useState<Announcement[]>([]);
  const [form, setForm] = useState({
    title: '',
    body: '',
    type: 'info' as 'info' | 'warning' | 'success',
    active: true,
  });

  async function load() {
    setItems(await api<Announcement[]>('/admin/announcements'));
  }
  useEffect(() => {
    load();
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api('/admin/announcements', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      setForm({ title: '', body: '', type: 'info', active: true });
      toast.push('Announcement created', 'success');
      await load();
    } catch (err) {
      toast.push((err as Error).message, 'error');
    }
  }

  async function toggle(id: number, active: boolean) {
    await api(`/admin/announcements/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ active }),
    });
    await load();
  }

  async function del(id: number) {
    if (!confirm('Delete this announcement?')) return;
    await api(`/admin/announcements/${id}`, { method: 'DELETE' });
    await load();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold text-gradient-gold">Announcements</h1>
        <p className="mt-2 text-navy-200">Broadcast messages to all users via the top banner.</p>
      </div>

      <form onSubmit={add} className="card space-y-4">
        <h2 className="font-display text-lg font-bold text-gold-300">New announcement</h2>
        <div>
          <label className="label">Title</label>
          <input className="input-field" required value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
        </div>
        <div>
          <label className="label">Body</label>
          <textarea rows={3} className="input-field resize-none" required value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Type</label>
            <select className="input-field" value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as typeof form.type }))}>
              <option value="info">Info</option>
              <option value="warning">Warning</option>
              <option value="success">Success</option>
            </select>
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm text-navy-100">
              <input type="checkbox" checked={form.active} onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))} className="h-4 w-4 accent-gold-500" />
              Active
            </label>
          </div>
        </div>
        <button className="btn-gold">
          <Plus className="mr-2 h-5 w-5" /> Create
        </button>
      </form>

      <div className="card">
        <h2 className="mb-4 font-display text-lg font-bold text-gold-300">All announcements</h2>
        {items.length === 0 ? (
          <div className="text-navy-300">No announcements.</div>
        ) : (
          <div className="divide-y divide-navy-700/60">
            {items.map((a) => (
              <div key={a.id} className="flex items-start justify-between py-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${
                      a.type === 'warning' ? 'border-yellow-500/40 bg-yellow-500/10 text-yellow-300' :
                      a.type === 'success' ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' :
                      'border-gold-500/40 bg-gold-500/10 text-gold-300'
                    }`}>{a.type}</span>
                    <span className="font-display text-navy-50">{a.title}</span>
                  </div>
                  <p className="mt-1 text-sm text-navy-200">{a.body}</p>
                </div>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1 text-xs text-navy-100">
                    <input type="checkbox" checked={a.active} onChange={(e) => toggle(a.id, e.target.checked)} className="h-4 w-4 accent-gold-500" />
                    Active
                  </label>
                  <button onClick={() => del(a.id)} className="btn-ghost h-8 px-2 text-xs hover:!border-red-500/40 hover:!text-red-300">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
