'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Search as SearchIcon, UserPlus, Download, ShieldBan, ShieldCheck, Pause,
  MessageSquare, ChevronRight, ArrowUpDown,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';

interface User {
  id: string;
  email: string;
  country: string;
  telegram: string | null;
  status: string;
  role: string;
  roleId: number;
  roleDisplayName: string;
  resellerTier: string | null;
  balancePoints: string;
  referralCode: string;
  emailVerifiedAt: string | null;
  twoFaEnabled: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  ordersCount: number;
  paymentsCount: number;
}

interface Role {
  id: number;
  name: string;
  displayName: string;
}

interface Tier {
  id: number;
  name: string;
}

type SortCol = 'createdAt' | 'lastLoginAt' | 'balancePoints' | 'email';

export default function UsersPage() {
  const toast = useToast();
  const [items, setItems] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(30);

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [roleId, setRoleId] = useState<number | ''>('');
  const [country, setCountry] = useState('');
  const [resellerTierId, setResellerTierId] = useState<number | ''>('');
  const [hasBalance, setHasBalance] = useState<'' | 'yes' | 'no'>('');
  const [sortBy, setSortBy] = useState<SortCol>('createdAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const [roles, setRoles] = useState<Role[]>([]);
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [showCreate, setShowCreate] = useState(false);
  const [bulkMode, setBulkMode] = useState<null | 'ban' | 'suspend' | 'activate' | 'notify'>(null);
  const [bulkTitle, setBulkTitle] = useState('');
  const [bulkBody, setBulkBody] = useState('');

  async function load() {
    const qs = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
      sortBy,
      sortDir,
    });
    if (search) qs.set('search', search);
    if (status) qs.set('status', status);
    if (roleId) qs.set('roleId', String(roleId));
    if (country) qs.set('country', country);
    if (resellerTierId) qs.set('resellerTierId', String(resellerTierId));
    if (hasBalance) qs.set('hasBalance', hasBalance);
    const r = await api<{ items: User[]; total: number }>(`/admin/users?${qs}`);
    setItems(r.items);
    setTotal(r.total);
  }

  useEffect(() => {
    api<Role[]>('/admin/roles').then((r) => setRoles(r)).catch(() => {});
    api<Tier[]>('/admin/resellers/tiers').then(setTiers).catch(() => {});
  }, []);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, sortBy, sortDir]);

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }
  function toggleAll() {
    if (selected.size === items.length) setSelected(new Set());
    else setSelected(new Set(items.map((i) => i.id)));
  }
  function changeSort(col: SortCol) {
    if (col === sortBy) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortBy(col);
      setSortDir('desc');
    }
  }

  async function doBulk() {
    if (selected.size === 0 || !bulkMode) return;
    try {
      const payload: Record<string, unknown> = {
        userIds: [...selected],
        action: bulkMode,
      };
      if (bulkMode === 'notify') {
        payload.title = bulkTitle;
        payload.body = bulkBody;
      }
      const r = await api<{ affected: number }>('/admin/users/bulk', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      toast.push(`Applied to ${r.affected} users`, 'success');
      setBulkMode(null);
      setBulkTitle('');
      setBulkBody('');
      setSelected(new Set());
      await load();
    } catch (err) {
      toast.push((err as Error).message, 'error');
    }
  }

  async function exportCsv() {
    const token = localStorage.getItem('accessToken');
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/users/export.csv`, {
      headers: { authorization: `Bearer ${token}` },
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'users.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold text-gradient-gold">Users</h1>
          <p className="mt-2 text-navy-200">{total.toLocaleString()} total · full control</p>
        </div>
        <div className="flex gap-2">
          <button onClick={exportCsv} className="btn-ghost">
            <Download className="mr-2 h-5 w-5" /> Export CSV
          </button>
          <button onClick={() => setShowCreate(true)} className="btn-gold">
            <UserPlus className="mr-2 h-5 w-5" /> New user
          </button>
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          load();
        }}
        className="card grid gap-3 sm:grid-cols-2 lg:grid-cols-6"
      >
        <input className="input-field lg:col-span-2" placeholder="Search email..." value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className="input-field" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="banned">Banned</option>
          <option value="pending_verification">Pending verification</option>
        </select>
        <select className="input-field" value={roleId} onChange={(e) => setRoleId(e.target.value ? Number(e.target.value) : '')}>
          <option value="">All roles</option>
          {roles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.displayName}
            </option>
          ))}
        </select>
        <select className="input-field" value={hasBalance} onChange={(e) => setHasBalance(e.target.value as typeof hasBalance)}>
          <option value="">Any balance</option>
          <option value="yes">Has balance</option>
          <option value="no">Zero balance</option>
        </select>
        <button className="btn-gold h-11">
          <SearchIcon className="mr-2 h-5 w-5" /> Apply
        </button>

        <input className="input-field" placeholder="Country (e.g. US)" value={country} onChange={(e) => setCountry(e.target.value.toUpperCase())} maxLength={2} />
        <select className="input-field" value={resellerTierId} onChange={(e) => setResellerTierId(e.target.value ? Number(e.target.value) : '')}>
          <option value="">Any tier</option>
          {tiers.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <select className="input-field" value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
          <option value={30}>30 per page</option>
          <option value={50}>50 per page</option>
          <option value={100}>100 per page</option>
          <option value={200}>200 per page</option>
        </select>
      </form>

      {selected.size > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -5 }}
          animate={{ opacity: 1, y: 0 }}
          className="card flex flex-wrap items-center gap-3 border-gold-500/40 bg-gold-500/5"
        >
          <div className="text-sm text-gold-300">
            <b>{selected.size}</b> selected
          </div>
          <div className="flex gap-2">
            <button onClick={() => setBulkMode('activate')} className="btn-ghost h-9 px-3 text-xs">
              <ShieldCheck className="mr-1 h-4 w-4" /> Activate
            </button>
            <button onClick={() => setBulkMode('suspend')} className="btn-ghost h-9 px-3 text-xs">
              <Pause className="mr-1 h-4 w-4" /> Suspend
            </button>
            <button onClick={() => setBulkMode('ban')} className="btn-ghost h-9 px-3 text-xs hover:!border-red-500/40 hover:!text-red-300">
              <ShieldBan className="mr-1 h-4 w-4" /> Ban
            </button>
            <button onClick={() => setBulkMode('notify')} className="btn-ghost h-9 px-3 text-xs">
              <MessageSquare className="mr-1 h-4 w-4" /> Notify
            </button>
          </div>
          <button onClick={() => setSelected(new Set())} className="ml-auto text-xs text-navy-300 hover:text-gold-300">
            Clear selection
          </button>
        </motion.div>
      )}

      {bulkMode && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="card border-gold-500/40 bg-gold-500/5"
        >
          <h3 className="font-display font-bold text-gold-300">
            {bulkMode === 'notify'
              ? `Notify ${selected.size} users`
              : `Confirm ${bulkMode} for ${selected.size} users`}
          </h3>
          {bulkMode === 'notify' && (
            <div className="mt-3 space-y-2">
              <input className="input-field" placeholder="Title" value={bulkTitle} onChange={(e) => setBulkTitle(e.target.value)} />
              <textarea rows={3} className="input-field resize-none" placeholder="Message" value={bulkBody} onChange={(e) => setBulkBody(e.target.value)} />
            </div>
          )}
          <div className="mt-3 flex gap-2">
            <button onClick={doBulk} className="btn-gold">
              Confirm
            </button>
            <button onClick={() => setBulkMode(null)} className="btn-ghost">
              Cancel
            </button>
          </div>
        </motion.div>
      )}

      <div className="card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-navy-300">
              <tr>
                <th className="w-8 py-2">
                  <input
                    type="checkbox"
                    checked={items.length > 0 && selected.size === items.length}
                    onChange={toggleAll}
                    className="h-4 w-4 accent-gold-500"
                  />
                </th>
                <SortTh col="email" label="Email" sortBy={sortBy} sortDir={sortDir} onSort={changeSort} />
                <th>Role</th>
                <th>Status</th>
                <SortTh col="balancePoints" label="Balance" sortBy={sortBy} sortDir={sortDir} onSort={changeSort} />
                <th>Orders/Pay</th>
                <th>Country</th>
                <th>Flags</th>
                <SortTh col="lastLoginAt" label="Last login" sortBy={sortBy} sortDir={sortDir} onSort={changeSort} />
                <SortTh col="createdAt" label="Joined" sortBy={sortBy} sortDir={sortDir} onSort={changeSort} />
                <th></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-700/60">
              {items.map((u) => (
                <tr key={u.id} className="text-navy-100 hover:bg-navy-800/30">
                  <td className="py-2">
                    <input
                      type="checkbox"
                      checked={selected.has(u.id)}
                      onChange={() => toggle(u.id)}
                      className="h-4 w-4 accent-gold-500"
                    />
                  </td>
                  <td className="text-xs">
                    <Link href={`/admin/users/${u.id}`} className="hover:text-gold-300">
                      {u.email}
                    </Link>
                  </td>
                  <td className="text-xs">
                    <RoleBadge role={u.role} />
                    {u.resellerTier && (
                      <span className="ml-1 text-xs text-gold-300">· {u.resellerTier}</span>
                    )}
                  </td>
                  <td>
                    <StatusBadge status={u.status} />
                  </td>
                  <td className="text-gold-300">{Number(u.balancePoints).toLocaleString()}</td>
                  <td className="text-xs text-navy-300">
                    {u.ordersCount} / {u.paymentsCount}
                  </td>
                  <td className="text-xs">{u.country}</td>
                  <td className="text-xs">
                    <div className="flex gap-1">
                      {u.emailVerifiedAt && <span title="Email verified" className="rounded bg-emerald-500/15 px-1 text-emerald-300">✓</span>}
                      {u.twoFaEnabled && <span title="2FA enabled" className="rounded bg-gold-500/15 px-1 text-gold-300">2FA</span>}
                      {u.telegram && <span title={u.telegram} className="rounded bg-navy-700 px-1 text-navy-100">TG</span>}
                    </div>
                  </td>
                  <td className="text-xs text-navy-300">
                    {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString() : '—'}
                  </td>
                  <td className="text-xs text-navy-300">{new Date(u.createdAt).toLocaleDateString()}</td>
                  <td>
                    <Link href={`/admin/users/${u.id}`} className="btn-ghost h-8 px-2 text-xs">
                      <ChevronRight className="h-4 w-4" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {items.length === 0 && <div className="py-6 text-center text-navy-300">No users match.</div>}
        <div className="mt-4 flex items-center justify-between text-sm text-navy-200">
          <div>Page {page} · {total.toLocaleString()}</div>
          <div className="flex gap-2">
            <button disabled={page === 1} onClick={() => setPage((p) => p - 1)} className="btn-ghost h-8 px-3 text-xs disabled:opacity-40">Prev</button>
            <button disabled={page * pageSize >= total} onClick={() => setPage((p) => p + 1)} className="btn-ghost h-8 px-3 text-xs disabled:opacity-40">Next</button>
          </div>
        </div>
      </div>

      {showCreate && (
        <CreateUserModal
          roles={roles}
          tiers={tiers}
          onClose={() => setShowCreate(false)}
          onCreated={async () => {
            setShowCreate(false);
            await load();
            toast.push('User created', 'success');
          }}
        />
      )}
    </div>
  );
}

function SortTh({
  col,
  label,
  sortBy,
  sortDir,
  onSort,
}: {
  col: SortCol;
  label: string;
  sortBy: string;
  sortDir: string;
  onSort: (c: SortCol) => void;
}) {
  const active = sortBy === col;
  return (
    <th className="cursor-pointer select-none" onClick={() => onSort(col)}>
      <span className={active ? 'text-gold-300' : ''}>
        {label} <ArrowUpDown className="ml-1 inline h-3 w-3 opacity-60" />
        {active && <span className="ml-1 text-[10px]">{sortDir}</span>}
      </span>
    </th>
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

function CreateUserModal({
  roles,
  tiers,
  onClose,
  onCreated,
}: {
  roles: Role[];
  tiers: Tier[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const toast = useToast();
  const [form, setForm] = useState({
    email: '',
    password: '',
    country: 'US',
    telegram: '',
    roleId: roles.find((r) => r.name === 'user')?.id ?? 0,
    status: 'active' as 'active' | 'suspended' | 'banned' | 'pending_verification',
    resellerTierId: '' as number | '',
    initialBalance: 0,
    emailVerified: true,
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api('/admin/users', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          resellerTierId: form.resellerTierId || null,
          telegram: form.telegram || null,
        }),
      });
      onCreated();
    } catch (err) {
      toast.push((err as Error).message, 'error');
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <motion.form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        initial={{ scale: 0.95, y: 10 }}
        animate={{ scale: 1, y: 0 }}
        className="w-full max-w-2xl space-y-4 rounded-2xl border border-navy-700 bg-navy-900 p-6 shadow-navy"
      >
        <h2 className="font-display text-xl font-bold text-gradient-gold">Create user</h2>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="label">Email</label>
            <input type="email" required className="input-field" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div>
            <label className="label">Password</label>
            <input type="text" required minLength={8} className="input-field" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </div>
          <div>
            <label className="label">Country (ISO)</label>
            <input required maxLength={2} className="input-field uppercase" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value.toUpperCase() })} />
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
            <label className="label">Status</label>
            <select className="input-field" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as typeof form.status })}>
              <option value="active">Active</option>
              <option value="pending_verification">Pending verification</option>
              <option value="suspended">Suspended</option>
              <option value="banned">Banned</option>
            </select>
          </div>
          <div>
            <label className="label">Reseller tier (optional)</label>
            <select className="input-field" value={form.resellerTierId} onChange={(e) => setForm({ ...form, resellerTierId: e.target.value ? Number(e.target.value) : '' })}>
              <option value="">None</option>
              {tiers.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Initial balance (points)</label>
            <input type="number" min={0} className="input-field" value={form.initialBalance} onChange={(e) => setForm({ ...form, initialBalance: Number(e.target.value) })} />
          </div>
          <div>
            <label className="label">Telegram (optional)</label>
            <input className="input-field" value={form.telegram} onChange={(e) => setForm({ ...form, telegram: e.target.value })} />
          </div>
          <div className="col-span-2">
            <label className="flex items-center gap-2 text-sm text-navy-100">
              <input type="checkbox" checked={form.emailVerified} onChange={(e) => setForm({ ...form, emailVerified: e.target.checked })} className="h-4 w-4 accent-gold-500" />
              Mark email as verified
            </label>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="btn-ghost">Cancel</button>
          <button className="btn-gold">Create</button>
        </div>
      </motion.form>
    </motion.div>
  );
}
