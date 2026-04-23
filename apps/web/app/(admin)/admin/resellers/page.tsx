'use client';
import { useEffect, useState } from 'react';
import { Plus, Trash2, UserPlus } from 'lucide-react';
import { api } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';

interface Tier {
  id: number;
  name: string;
  discountPct: number;
  description: string | null;
  _count: { users: number };
}

interface ResellerUser {
  id: string;
  email: string;
  tier: string;
  discountPct: number;
  balancePoints: string;
  createdAt: string;
}

export default function ResellersPage() {
  const toast = useToast();
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [users, setUsers] = useState<ResellerUser[]>([]);
  const [name, setName] = useState('');
  const [pct, setPct] = useState(10);
  const [assignEmail, setAssignEmail] = useState('');
  const [assignTier, setAssignTier] = useState<number | ''>('');

  async function load() {
    const [t, u] = await Promise.all([
      api<Tier[]>('/admin/resellers/tiers'),
      api<ResellerUser[]>('/admin/resellers/users'),
    ]);
    setTiers(t);
    setUsers(u);
  }
  useEffect(() => {
    load();
  }, []);

  async function addTier(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api('/admin/resellers/tiers', {
        method: 'POST',
        body: JSON.stringify({ name, discountPct: pct }),
      });
      setName('');
      toast.push('Tier created', 'success');
      await load();
    } catch (err) {
      toast.push((err as Error).message, 'error');
    }
  }

  async function delTier(id: number) {
    if (!confirm('Delete this tier? Users will be unassigned.')) return;
    await api(`/admin/resellers/tiers/${id}`, { method: 'DELETE' });
    await load();
  }

  async function assign(e: React.FormEvent) {
    e.preventDefault();
    try {
      // Find user by email (admin could expose direct, but here we piggyback on payment filter)
      const r = await api<{ items: Array<{ userId: string; userEmail: string }> }>(
        `/admin/payments?userEmail=${encodeURIComponent(assignEmail)}&pageSize=1`,
      );
      let userId = r.items[0]?.userId;
      if (!userId) {
        // fallback: user may have no payments yet — ask admin to find them via users page
        toast.push('User has no payment history; open Users page to assign.', 'error');
        return;
      }
      await api('/admin/resellers/assign', {
        method: 'POST',
        body: JSON.stringify({ userId, tierId: assignTier || null }),
      });
      setAssignEmail('');
      toast.push('Assignment updated', 'success');
      await load();
    } catch (err) {
      toast.push((err as Error).message, 'error');
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-bold text-gradient-gold">Resellers</h1>
        <p className="mt-2 text-navy-200">
          Create tiers and assign users. Tier discount is applied as bonus points on top-ups.
        </p>
      </div>

      <div className="card">
        <h2 className="font-display text-lg font-bold text-gold-300">Tiers</h2>
        <form onSubmit={addTier} className="mt-4 grid gap-3 sm:grid-cols-[2fr_1fr_auto]">
          <input className="input-field" placeholder="Tier name (e.g. Silver)" value={name} onChange={(e) => setName(e.target.value)} required />
          <input type="number" min={0} max={100} className="input-field" placeholder="Discount %" value={pct} onChange={(e) => setPct(Number(e.target.value))} />
          <button className="btn-gold h-11">
            <Plus className="h-5 w-5" />
          </button>
        </form>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-navy-300">
              <tr>
                <th className="py-2">Name</th>
                <th>Discount</th>
                <th>Users</th>
                <th></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-700/60">
              {tiers.map((t) => (
                <tr key={t.id} className="text-navy-100">
                  <td className="py-2">{t.name}</td>
                  <td className="text-emerald-300">+{t.discountPct}%</td>
                  <td>{t._count.users}</td>
                  <td>
                    <button onClick={() => delTier(t.id)} className="btn-ghost h-8 px-2 text-xs hover:!border-red-500/40 hover:!text-red-300">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h2 className="font-display text-lg font-bold text-gold-300">Assign user to tier</h2>
        <form onSubmit={assign} className="mt-4 grid gap-3 sm:grid-cols-[2fr_1fr_auto]">
          <input className="input-field" placeholder="user@example.com" value={assignEmail} onChange={(e) => setAssignEmail(e.target.value)} required />
          <select className="input-field" value={assignTier} onChange={(e) => setAssignTier(e.target.value ? Number(e.target.value) : '')}>
            <option value="">Remove (→ User)</option>
            {tiers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} · +{t.discountPct}%
              </option>
            ))}
          </select>
          <button className="btn-gold h-11">
            <UserPlus className="h-5 w-5" />
          </button>
        </form>
      </div>

      <div className="card">
        <h2 className="font-display text-lg font-bold text-gold-300">Current resellers ({users.length})</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-navy-300">
              <tr>
                <th className="py-2">Email</th>
                <th>Tier</th>
                <th>Discount</th>
                <th>Balance</th>
                <th>Since</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-700/60">
              {users.map((u) => (
                <tr key={u.id} className="text-navy-100">
                  <td className="py-2 text-xs">{u.email}</td>
                  <td>{u.tier}</td>
                  <td className="text-emerald-300">+{u.discountPct}%</td>
                  <td className="text-gold-300">{Number(u.balancePoints).toLocaleString()}</td>
                  <td className="text-xs text-navy-300">{new Date(u.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
