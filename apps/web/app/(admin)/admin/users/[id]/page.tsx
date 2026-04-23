'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  ChevronLeft, Save, Key, ShieldOff, LogOut, Unlock, UserCheck, Trash2,
  MessageSquare, Coins, UserCog, AlertTriangle,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/store';
import { useToast } from '@/components/ui/Toast';

interface UserDetail {
  id: string;
  email: string;
  country: string;
  telegram: string | null;
  status: string;
  role: string;
  roleId: number;
  resellerTier: { id: number; name: string; discountPct: number } | null;
  balancePoints: string;
  frozenBalancePoints: string;
  referralCode: string;
  referredBy: { id: string; email: string; referralCode: string } | null;
  emailVerifiedAt: string | null;
  twoFaEnabled: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  lastLoginIp: string | null;
  counts: {
    orders: number;
    payments: number;
    tickets: number;
    referrals: number;
    sessions: number;
    exports: number;
  };
  stats: {
    totalSpentPoints: string;
    totalToppedUpUsd: string;
    lastPaymentAt: string | null;
    totalReferralEarnings: string;
    activeReservationId: string | null;
  };
  recentLoginAttempts: Array<{ id: string; success: boolean; ip: string | null; attemptedAt: string }>;
}

interface Role {
  id: number;
  name: string;
  displayName: string;
}
interface Tier {
  id: number;
  name: string;
  discountPct: number;
}

const TABS = [
  'overview',
  'orders',
  'payments',
  'ledger',
  'exports',
  'tickets',
  'referrals',
  'sessions',
  'security',
  'danger',
] as const;
type Tab = (typeof TABS)[number];

export default function AdminUserDetail() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const currentUser = useAuth((s) => s.user);
  const [tab, setTab] = useState<Tab>('overview');
  const [u, setU] = useState<UserDetail | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [tiers, setTiers] = useState<Tier[]>([]);

  async function load() {
    const r = await api<UserDetail>(`/admin/users/${params.id}`);
    setU(r);
  }
  useEffect(() => {
    load();
    api<Role[]>('/admin/roles').then(setRoles).catch(() => {});
    api<Tier[]>('/admin/resellers/tiers').then(setTiers).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  if (!u) return <div className="text-navy-300">Loading...</div>;

  async function action(label: string, fn: () => Promise<unknown>) {
    try {
      await fn();
      toast.push(label, 'success');
      await load();
    } catch (err) {
      toast.push((err as Error).message, 'error');
    }
  }

  return (
    <div className="space-y-6">
      <Link href="/admin/users" className="inline-flex items-center text-sm text-navy-200 hover:text-gold-300">
        <ChevronLeft className="mr-1 h-4 w-4" /> Back to users
      </Link>

      <div className="card">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold text-gradient-gold">{u.email}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
              <StatusBadge status={u.status} />
              <RoleBadge role={u.role} />
              {u.resellerTier && (
                <span className="rounded-full border border-purple-500/40 bg-purple-500/10 px-2 py-0.5 text-purple-300">
                  {u.resellerTier.name} · +{u.resellerTier.discountPct}%
                </span>
              )}
              {u.emailVerifiedAt && <span className="rounded bg-emerald-500/15 px-2 py-0.5 text-emerald-300">Email verified</span>}
              {u.twoFaEnabled && <span className="rounded bg-gold-500/15 px-2 py-0.5 text-gold-300">2FA on</span>}
            </div>
            <div className="mt-2 font-mono text-xs text-navy-300">{u.id}</div>
          </div>
          <div className="text-right">
            <div className="text-xs uppercase tracking-wider text-navy-300">Balance</div>
            <div className="font-display text-3xl font-bold text-gradient-gold">
              {Number(u.balancePoints).toLocaleString()} pts
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-navy-700/60 pb-2 text-sm">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-t-lg px-3 py-1.5 capitalize transition ${
              tab === t
                ? 'border-b-2 border-gold-500 bg-gold-500/10 text-gold-300'
                : 'text-navy-200 hover:text-gold-300'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'overview' && <OverviewTab u={u} roles={roles} tiers={tiers} reload={load} />}
      {tab === 'orders' && <RelatedTab type="orders" userId={u.id} />}
      {tab === 'payments' && <RelatedTab type="payments" userId={u.id} />}
      {tab === 'ledger' && <RelatedTab type="ledger" userId={u.id} />}
      {tab === 'exports' && <RelatedTab type="exports" userId={u.id} />}
      {tab === 'tickets' && <TicketsTab userId={u.id} />}
      {tab === 'referrals' && <ReferralsTab userId={u.id} />}
      {tab === 'sessions' && <SessionsTab userId={u.id} u={u} onAction={action} />}
      {tab === 'security' && <SecurityTab u={u} onAction={action} />}
      {tab === 'danger' && (
        <DangerZoneTab
          u={u}
          canDelete={currentUser?.role === 'super_admin' || currentUser?.role === 'admin'}
          canImpersonate={currentUser?.role === 'super_admin'}
          onDeleted={() => router.push('/admin/users')}
        />
      )}
    </div>
  );
}

// ====== Overview tab ======
function OverviewTab({
  u, roles, tiers, reload,
}: { u: UserDetail; roles: Role[]; tiers: Tier[]; reload: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState({
    email: u.email,
    country: u.country,
    telegram: u.telegram ?? '',
    status: u.status,
    roleId: u.roleId,
    resellerTierId: u.resellerTier?.id ?? ('' as number | ''),
  });
  const [saving, setSaving] = useState(false);
  const [adjust, setAdjust] = useState({ amount: 0, note: '' });

  async function save() {
    setSaving(true);
    try {
      await api(`/admin/users/${u.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          email: form.email !== u.email ? form.email : undefined,
          country: form.country,
          telegram: form.telegram || null,
          status: form.status,
          roleId: form.roleId,
          resellerTierId: form.resellerTierId || null,
        }),
      });
      toast.push('Saved', 'success');
      reload();
    } catch (err) {
      toast.push((err as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function doAdjust() {
    if (!adjust.amount) return;
    try {
      await api('/admin/payments/adjust-balance', {
        method: 'POST',
        body: JSON.stringify({
          userId: u.id,
          amountPoints: Number(adjust.amount),
          note: adjust.note,
        }),
      });
      toast.push('Balance adjusted', 'success');
      setAdjust({ amount: 0, note: '' });
      reload();
    } catch (err) {
      toast.push((err as Error).message, 'error');
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
      <div className="space-y-5">
        <div className="card">
          <h2 className="mb-4 font-display text-lg font-bold text-gold-300">Profile</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label">Email</label>
              <input className="input-field" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div>
              <label className="label">Country (ISO)</label>
              <input maxLength={2} className="input-field uppercase" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value.toUpperCase() })} />
            </div>
            <div>
              <label className="label">Telegram</label>
              <input className="input-field" value={form.telegram} onChange={(e) => setForm({ ...form, telegram: e.target.value })} />
            </div>
            <div>
              <label className="label">Status</label>
              <select className="input-field" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
                <option value="banned">Banned</option>
                <option value="pending_verification">Pending verification</option>
              </select>
            </div>
            <div>
              <label className="label">Role</label>
              <select className="input-field" value={form.roleId} onChange={(e) => setForm({ ...form, roleId: Number(e.target.value) })}>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>{r.displayName}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Reseller tier</label>
              <select className="input-field" value={form.resellerTierId} onChange={(e) => setForm({ ...form, resellerTierId: e.target.value ? Number(e.target.value) : '' })}>
                <option value="">None</option>
                {tiers.map((t) => (
                  <option key={t.id} value={t.id}>{t.name} · +{t.discountPct}%</option>
                ))}
              </select>
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <button onClick={save} disabled={saving} className="btn-gold">
              <Save className="mr-2 h-5 w-5" />
              {saving ? 'Saving...' : 'Save profile'}
            </button>
          </div>
        </div>

        <div className="card">
          <h2 className="mb-4 font-display text-lg font-bold text-gold-300">Adjust balance</h2>
          <div className="grid gap-3 sm:grid-cols-[1fr_2fr_auto]">
            <input type="number" className="input-field" placeholder="Amount (+/-)" value={adjust.amount || ''} onChange={(e) => setAdjust({ ...adjust, amount: Number(e.target.value) })} />
            <input className="input-field" placeholder="Note (visible in ledger)" value={adjust.note} onChange={(e) => setAdjust({ ...adjust, note: e.target.value })} />
            <button onClick={doAdjust} className="btn-gold h-11">
              <Coins className="mr-2 h-5 w-5" /> Apply
            </button>
          </div>
          <p className="mt-2 text-xs text-navy-300">Positive amounts credit the user; negative amounts debit.</p>
        </div>
      </div>

      <div className="space-y-5">
        <div className="card">
          <h2 className="mb-4 font-display text-lg font-bold text-gold-300">Stats</h2>
          <dl className="space-y-2 text-sm">
            <Row label="Total topped up" value={`$${Number(u.stats.totalToppedUpUsd).toFixed(2)}`} />
            <Row label="Total spent (pts)" value={Math.abs(Number(u.stats.totalSpentPoints)).toLocaleString()} />
            <Row label="Referral earnings" value={Number(u.stats.totalReferralEarnings).toLocaleString()} />
            <Row label="Orders" value={u.counts.orders.toString()} />
            <Row label="Payments" value={u.counts.payments.toString()} />
            <Row label="Exports" value={u.counts.exports.toString()} />
            <Row label="Tickets" value={u.counts.tickets.toString()} />
            <Row label="Invited users" value={u.counts.referrals.toString()} />
            <Row label="Joined" value={new Date(u.createdAt).toLocaleString()} />
            <Row label="Last login" value={u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : '—'} />
            <Row label="Last IP" value={u.lastLoginIp ?? '—'} />
            <Row label="Referral code" value={u.referralCode} />
            {u.referredBy && <Row label="Referred by" value={u.referredBy.email} />}
            {u.stats.activeReservationId && (
              <Row label="Active reservation" value={u.stats.activeReservationId.slice(0, 10) + '...'} />
            )}
          </dl>
        </div>

        <div className="card">
          <h2 className="mb-4 font-display text-lg font-bold text-gold-300">Recent login attempts</h2>
          {u.recentLoginAttempts.length === 0 ? (
            <div className="text-sm text-navy-300">None.</div>
          ) : (
            <div className="space-y-1 text-xs">
              {u.recentLoginAttempts.map((a) => (
                <div key={a.id} className="flex items-center justify-between">
                  <span className={a.success ? 'text-emerald-300' : 'text-red-300'}>
                    {a.success ? 'OK' : 'FAIL'} · {a.ip ?? '?'}
                  </span>
                  <span className="text-navy-400">{new Date(a.attemptedAt).toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-navy-700/40 py-1 last:border-none">
      <span className="text-navy-300">{label}</span>
      <span className="font-mono text-navy-50">{value}</span>
    </div>
  );
}

// ====== Related generic tab (orders/payments/ledger/exports) ======
function RelatedTab({ type, userId }: { type: 'orders' | 'payments' | 'ledger' | 'exports'; userId: string }) {
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

  useEffect(() => {
    api<{ items: Record<string, unknown>[]; total: number }>(
      `/admin/users/${userId}/${type}?page=${page}&pageSize=20`,
    ).then((r) => {
      setItems(r.items);
      setTotal(r.total);
    });
  }, [userId, type, page]);

  if (items.length === 0) return <div className="card text-navy-300">No {type}.</div>;

  const keys = Object.keys(items[0]!);
  return (
    <div className="card">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-navy-300">
            <tr>
              {keys.map((k) => (
                <th key={k} className="py-2">{k}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-navy-700/60">
            {items.map((it, i) => (
              <tr key={(it.id as string) ?? i} className="text-navy-100">
                {keys.map((k) => (
                  <td key={k} className="py-2 text-xs">
                    {formatCell(k, it[k])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex items-center justify-between text-sm text-navy-200">
        <div>Page {page} · {total}</div>
        <div className="flex gap-2">
          <button disabled={page === 1} onClick={() => setPage((p) => p - 1)} className="btn-ghost h-8 px-3 text-xs disabled:opacity-40">Prev</button>
          <button disabled={page * 20 >= total} onClick={() => setPage((p) => p + 1)} className="btn-ghost h-8 px-3 text-xs disabled:opacity-40">Next</button>
        </div>
      </div>
    </div>
  );
}

function formatCell(key: string, v: unknown) {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'string' && /At$|^createdAt$|finishedAt/.test(key) && !isNaN(Date.parse(v))) {
    return new Date(v).toLocaleString();
  }
  if (typeof v === 'string' && /Points|Usd|amount/.test(key)) return Number(v).toLocaleString();
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function TicketsTab({ userId }: { userId: string }) {
  const [items, setItems] = useState<Array<{ id: string; subject: string; status: string; updatedAt: string; _count: { messages: number } }>>([]);
  useEffect(() => {
    api<typeof items>(`/admin/users/${userId}/tickets`).then(setItems);
  }, [userId]);
  if (items.length === 0) return <div className="card text-navy-300">No tickets.</div>;
  return (
    <div className="card">
      <div className="divide-y divide-navy-700/60">
        {items.map((t) => (
          <Link key={t.id} href={`/admin/tickets/${t.id}`} className="flex items-center justify-between py-3 hover:bg-navy-800/40">
            <div>
              <div className="font-display text-navy-50">{t.subject}</div>
              <div className="mt-1 text-xs text-navy-300">
                {t._count.messages} msgs · {new Date(t.updatedAt).toLocaleString()}
              </div>
            </div>
            <span className="rounded-full border border-navy-600 bg-navy-800 px-2 py-0.5 text-xs capitalize text-navy-200">{t.status}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

function ReferralsTab({ userId }: { userId: string }) {
  const [data, setData] = useState<{
    invited: Array<{ id: string; email: string; createdAt: string; balancePoints: string }>;
    earnings: Array<{ id: string; referredEmail: string; earnedPoints: string; createdAt: string }>;
  } | null>(null);
  useEffect(() => {
    api<NonNullable<typeof data>>(`/admin/users/${userId}/referrals`).then(setData);
  }, [userId]);
  if (!data) return <div className="text-navy-300">Loading...</div>;
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="card">
        <h3 className="mb-3 font-display text-lg font-bold text-gold-300">Invited users ({data.invited.length})</h3>
        {data.invited.length === 0 ? (
          <div className="text-sm text-navy-300">None.</div>
        ) : (
          <div className="space-y-2 text-sm">
            {data.invited.map((u) => (
              <div key={u.id} className="flex items-center justify-between border-b border-navy-700/40 py-1">
                <span className="text-xs">{u.email}</span>
                <span className="text-xs text-navy-300">{new Date(u.createdAt).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="card">
        <h3 className="mb-3 font-display text-lg font-bold text-gold-300">Commission earnings ({data.earnings.length})</h3>
        {data.earnings.length === 0 ? (
          <div className="text-sm text-navy-300">None.</div>
        ) : (
          <div className="space-y-2 text-sm">
            {data.earnings.map((e) => (
              <div key={e.id} className="flex items-center justify-between border-b border-navy-700/40 py-1">
                <span className="text-xs">{e.referredEmail}</span>
                <span className="text-xs text-emerald-300">+{Number(e.earnedPoints).toLocaleString()} pts</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SessionsTab({ userId, u, onAction }: { userId: string; u: UserDetail; onAction: (label: string, fn: () => Promise<unknown>) => Promise<void> }) {
  const [data, setData] = useState<{
    sessions: Array<{ id: string; ip: string | null; userAgent: string | null; createdAt: string; expiresAt: string }>;
    refreshTokens: Array<{ id: string; createdAt: string; expiresAt: string }>;
  } | null>(null);

  async function load() {
    setData(await api<NonNullable<typeof data>>(`/admin/users/${userId}/sessions`));
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  if (!data) return <div className="text-navy-300">Loading...</div>;
  return (
    <div className="space-y-5">
      <div className="card">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-lg font-bold text-gold-300">
            Active refresh tokens ({data.refreshTokens.length})
          </h3>
          <button
            onClick={() => onAction('Logged out everywhere', () => api(`/admin/users/${userId}/logout-all`, { method: 'POST' }))}
            className="btn-ghost"
          >
            <LogOut className="mr-2 h-5 w-5" /> Force logout everywhere
          </button>
        </div>
        <div className="mt-3 space-y-1 text-xs">
          {data.refreshTokens.map((r) => (
            <div key={r.id} className="flex justify-between border-b border-navy-700/40 py-1">
              <span className="font-mono">{r.id.slice(0, 12)}...</span>
              <span className="text-navy-300">
                issued {new Date(r.createdAt).toLocaleString()} · expires {new Date(r.expiresAt).toLocaleDateString()}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h3 className="font-display text-lg font-bold text-gold-300">Recent login attempts</h3>
        {u.recentLoginAttempts.length === 0 ? (
          <div className="mt-2 text-sm text-navy-300">None.</div>
        ) : (
          <div className="mt-3 space-y-1 text-xs">
            {u.recentLoginAttempts.map((a) => (
              <div key={a.id} className="flex justify-between border-b border-navy-700/40 py-1">
                <span className={a.success ? 'text-emerald-300' : 'text-red-300'}>
                  {a.success ? 'OK' : 'FAIL'} · {a.ip ?? '?'}
                </span>
                <span className="text-navy-400">{new Date(a.attemptedAt).toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
        <button
          onClick={() => onAction('Lockout lifted', () => api(`/admin/users/${userId}/lift-lockout`, { method: 'POST' }))}
          className="btn-ghost mt-4"
        >
          <Unlock className="mr-2 h-5 w-5" /> Lift lockout (clear failed attempts)
        </button>
      </div>
    </div>
  );
}

function SecurityTab({ u, onAction }: { u: UserDetail; onAction: (label: string, fn: () => Promise<unknown>) => Promise<void> }) {
  const [newPassword, setNewPassword] = useState('');
  const [notify, setNotify] = useState({ title: '', body: '' });
  const toast = useToast();

  async function resetPassword() {
    if (newPassword.length < 8) {
      toast.push('Password must be at least 8 chars', 'error');
      return;
    }
    await onAction('Password reset', () =>
      api(`/admin/users/${u.id}/password`, {
        method: 'POST',
        body: JSON.stringify({ password: newPassword }),
      }),
    );
    setNewPassword('');
  }

  async function sendNotif() {
    if (!notify.title || !notify.body) return;
    await onAction('Notification sent', () =>
      api(`/admin/users/${u.id}/notify`, {
        method: 'POST',
        body: JSON.stringify(notify),
      }),
    );
    setNotify({ title: '', body: '' });
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="card">
        <h3 className="mb-3 font-display text-lg font-bold text-gold-300">Reset password</h3>
        <div className="flex gap-2">
          <input
            type="text"
            className="input-field"
            placeholder="New password (min 8 chars)"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
          <button onClick={resetPassword} className="btn-gold">
            <Key className="mr-2 h-5 w-5" /> Set
          </button>
        </div>
        <p className="mt-2 text-xs text-navy-300">
          All existing sessions will be revoked; user must log in again.
        </p>
      </div>

      <div className="card">
        <h3 className="mb-3 font-display text-lg font-bold text-gold-300">Email & 2FA</h3>
        <div className="space-y-2">
          <button
            disabled={!!u.emailVerifiedAt}
            onClick={() => onAction('Email verified', () => api(`/admin/users/${u.id}/verify-email`, { method: 'POST' }))}
            className="btn-ghost w-full disabled:opacity-40"
          >
            <UserCheck className="mr-2 h-5 w-5" />
            {u.emailVerifiedAt ? 'Email already verified' : 'Mark email verified'}
          </button>
          <button
            disabled={!u.twoFaEnabled}
            onClick={() => onAction('2FA disabled', () => api(`/admin/users/${u.id}/disable-2fa`, { method: 'POST' }))}
            className="btn-ghost w-full disabled:opacity-40"
          >
            <ShieldOff className="mr-2 h-5 w-5" />
            {u.twoFaEnabled ? 'Force disable 2FA' : '2FA is disabled'}
          </button>
        </div>
      </div>

      <div className="card lg:col-span-2">
        <h3 className="mb-3 font-display text-lg font-bold text-gold-300">Send notification</h3>
        <div className="space-y-2">
          <input
            className="input-field"
            placeholder="Title"
            value={notify.title}
            onChange={(e) => setNotify({ ...notify, title: e.target.value })}
          />
          <textarea
            rows={3}
            className="input-field resize-none"
            placeholder="Message"
            value={notify.body}
            onChange={(e) => setNotify({ ...notify, body: e.target.value })}
          />
          <div className="flex justify-end">
            <button onClick={sendNotif} className="btn-gold">
              <MessageSquare className="mr-2 h-5 w-5" /> Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function DangerZoneTab({
  u,
  canDelete,
  canImpersonate,
  onDeleted,
}: {
  u: UserDetail;
  canDelete: boolean;
  canImpersonate: boolean;
  onDeleted: () => void;
}) {
  const toast = useToast();

  async function impersonate() {
    if (!confirm('Impersonate this user? Your current session will be replaced.')) return;
    try {
      const res = await api<{ accessToken: string }>(`/admin/users/${u.id}/impersonate`, {
        method: 'POST',
      });
      localStorage.setItem('accessToken', res.accessToken);
      localStorage.removeItem('refreshToken');
      toast.push('Now logged in as user — redirecting...', 'info');
      setTimeout(() => (window.location.href = '/dashboard'), 500);
    } catch (err) {
      toast.push((err as Error).message, 'error');
    }
  }

  async function del() {
    if (!confirm(`DELETE ${u.email}?  This removes the account and all related data.`)) return;
    if (!confirm('Are you absolutely sure? This cannot be undone.')) return;
    try {
      await api(`/admin/users/${u.id}`, { method: 'DELETE' });
      toast.push('User deleted', 'success');
      onDeleted();
    } catch (err) {
      toast.push((err as Error).message, 'error');
    }
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="card border-red-500/40 bg-red-500/5">
      <div className="flex items-center gap-2 text-red-300">
        <AlertTriangle className="h-5 w-5" />
        <h3 className="font-display text-lg font-bold">Danger zone</h3>
      </div>

      <div className="mt-4 space-y-4">
        {canImpersonate && (
          <div className="rounded-xl bg-navy-950/60 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="font-medium text-gold-300">Impersonate user</div>
                <div className="text-xs text-navy-300">
                  Log in as this user to debug issues. Your current session will be replaced.
                </div>
              </div>
              <button onClick={impersonate} className="btn-ghost">
                <UserCog className="mr-2 h-5 w-5" /> Impersonate
              </button>
            </div>
          </div>
        )}

        <div className="rounded-xl bg-red-950/40 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="font-medium text-red-300">Delete user</div>
              <div className="text-xs text-red-200/70">
                Permanently remove the account and all related data. Cannot be undone.
              </div>
            </div>
            <button
              disabled={!canDelete}
              onClick={del}
              className="btn-ghost !border-red-500/40 !text-red-300 hover:!bg-red-500/10 disabled:opacity-40"
            >
              <Trash2 className="mr-2 h-5 w-5" /> Delete
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    active: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40',
    suspended: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/40',
    banned: 'bg-red-500/15 text-red-300 border-red-500/40',
    pending_verification: 'bg-navy-800 text-navy-200 border-navy-600',
  };
  return (
    <span className={`rounded-full border px-2 py-0.5 text-xs capitalize ${colors[status] ?? colors.active}`}>
      {status.replace('_', ' ')}
    </span>
  );
}
function RoleBadge({ role }: { role: string }) {
  const colors: Record<string, string> = {
    super_admin: 'bg-red-500/15 text-red-300 border-red-500/40',
    admin: 'bg-gold-500/15 text-gold-300 border-gold-500/40',
    moderator: 'bg-blue-500/15 text-blue-300 border-blue-500/40',
    reseller: 'bg-purple-500/15 text-purple-300 border-purple-500/40',
    user: 'bg-navy-800 text-navy-200 border-navy-600',
  };
  return (
    <span className={`rounded-full border px-2 py-0.5 text-xs capitalize ${colors[role] ?? colors.user}`}>
      {role.replace('_', ' ')}
    </span>
  );
}
