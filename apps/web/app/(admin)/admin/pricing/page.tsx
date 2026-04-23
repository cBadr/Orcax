'use client';
import { useEffect, useState } from 'react';
import { Plus, Trash2, Save } from 'lucide-react';
import { api } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';

interface TldGroup {
  id: number;
  name: string;
  tlds: string[];
  pointsPerEmail: number;
  priority: number;
}
interface DomainPrice {
  id: number;
  domainId: number;
  pointsPerEmail: number;
  domain: { name: string };
}
interface BulkDiscount {
  id: number;
  minQuantity: number;
  discountPct: number;
  active: boolean;
}
interface TopupBonus {
  id: number;
  minUsd: number;
  bonusPct: number;
  active: boolean;
}

export default function PricingPage() {
  const toast = useToast();
  const [defaultPoints, setDefaultPoints] = useState(1);
  const [tldGroups, setTldGroups] = useState<TldGroup[]>([]);
  const [domainPrices, setDomainPrices] = useState<DomainPrice[]>([]);
  const [bulk, setBulk] = useState<BulkDiscount[]>([]);
  const [bonuses, setBonuses] = useState<TopupBonus[]>([]);

  async function load() {
    const [d, tg, dp, bd, tb] = await Promise.all([
      api<{ pointsPerEmail: number }>('/admin/pricing/default'),
      api<TldGroup[]>('/admin/pricing/tld-groups'),
      api<DomainPrice[]>('/admin/pricing/domains'),
      api<BulkDiscount[]>('/admin/pricing/bulk-discounts'),
      api<TopupBonus[]>('/admin/pricing/topup-bonuses'),
    ]);
    setDefaultPoints(d.pointsPerEmail);
    setTldGroups(tg);
    setDomainPrices(dp);
    setBulk(bd);
    setBonuses(tb);
  }
  useEffect(() => {
    load();
  }, []);

  async function saveDefault() {
    try {
      await api('/admin/pricing/default', {
        method: 'PUT',
        body: JSON.stringify({ pointsPerEmail: defaultPoints }),
      });
      toast.push('Default price saved', 'success');
    } catch (e) {
      toast.push((e as Error).message, 'error');
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-bold text-gradient-gold">Pricing</h1>
        <p className="mt-2 text-navy-200">
          Resolution order: <b className="text-gold-300">domain-specific → TLD group → default</b>.
        </p>
      </div>

      {/* Default */}
      <div className="card max-w-md">
        <h2 className="font-display text-lg font-bold text-gold-300">Default price</h2>
        <div className="mt-4 flex items-end gap-3">
          <div className="flex-1">
            <label className="label">Points per email</label>
            <input
              type="number"
              min={1}
              className="input-field"
              value={defaultPoints}
              onChange={(e) => setDefaultPoints(Number(e.target.value))}
            />
          </div>
          <button onClick={saveDefault} className="btn-gold h-11">
            <Save className="mr-2 h-5 w-5" /> Save
          </button>
        </div>
      </div>

      {/* TLD Groups */}
      <TldGroupsPanel groups={tldGroups} reload={load} />

      {/* Domain prices */}
      <DomainPricesPanel prices={domainPrices} reload={load} />

      {/* Bulk discounts */}
      <BulkDiscountsPanel rules={bulk} reload={load} />

      {/* Top-up bonuses */}
      <TopupBonusesPanel rules={bonuses} reload={load} />
    </div>
  );
}

function TldGroupsPanel({ groups, reload }: { groups: TldGroup[]; reload: () => void }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [tlds, setTlds] = useState('');
  const [points, setPoints] = useState(5);
  const [priority, setPriority] = useState(100);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api('/admin/pricing/tld-groups', {
        method: 'POST',
        body: JSON.stringify({
          name,
          tlds: tlds.split(',').map((t) => t.trim().replace(/^\./, '')).filter(Boolean),
          pointsPerEmail: points,
          priority,
        }),
      });
      setName('');
      setTlds('');
      reload();
      toast.push('TLD group added', 'success');
    } catch (e) {
      toast.push((e as Error).message, 'error');
    }
  }

  async function del(id: number) {
    await api(`/admin/pricing/tld-groups/${id}`, { method: 'DELETE' });
    reload();
  }

  return (
    <div className="card">
      <h2 className="font-display text-lg font-bold text-gold-300">TLD groups</h2>
      <form onSubmit={add} className="mt-4 grid gap-3 sm:grid-cols-[2fr_3fr_1fr_1fr_auto]">
        <input className="input-field" placeholder="Name (e.g. EDU)" value={name} onChange={(e) => setName(e.target.value)} />
        <input className="input-field" placeholder="TLDs: edu,ac.uk,gov" value={tlds} onChange={(e) => setTlds(e.target.value)} />
        <input type="number" className="input-field" value={points} onChange={(e) => setPoints(Number(e.target.value))} />
        <input type="number" className="input-field" value={priority} onChange={(e) => setPriority(Number(e.target.value))} />
        <button className="btn-gold h-11">
          <Plus className="h-5 w-5" />
        </button>
      </form>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-navy-300">
            <tr>
              <th className="py-2">Name</th>
              <th>TLDs</th>
              <th>Points</th>
              <th>Priority</th>
              <th></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-navy-700/60">
            {groups.map((g) => (
              <tr key={g.id} className="text-navy-100">
                <td className="py-2">{g.name}</td>
                <td className="font-mono text-xs">{g.tlds.join(', ')}</td>
                <td>{g.pointsPerEmail}</td>
                <td>{g.priority}</td>
                <td>
                  <button onClick={() => del(g.id)} className="btn-ghost h-8 px-2 text-xs hover:!border-red-500/40 hover:!text-red-300">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DomainPricesPanel({ prices, reload }: { prices: DomainPrice[]; reload: () => void }) {
  const toast = useToast();
  const [domainName, setDomainName] = useState('');
  const [points, setPoints] = useState(5);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    try {
      const d = await api<{ items: Array<{ id: number; name: string }> }>(
        `/admin/domains?search=${encodeURIComponent(domainName)}`,
      );
      const domain = d.items.find((x) => x.name === domainName.toLowerCase());
      if (!domain) {
        toast.push('Domain not found', 'error');
        return;
      }
      await api('/admin/pricing/domains', {
        method: 'POST',
        body: JSON.stringify({ domainId: domain.id, pointsPerEmail: points }),
      });
      setDomainName('');
      reload();
      toast.push('Domain price saved', 'success');
    } catch (e) {
      toast.push((e as Error).message, 'error');
    }
  }
  async function del(id: number) {
    await api(`/admin/pricing/domains/${id}`, { method: 'DELETE' });
    reload();
  }
  return (
    <div className="card">
      <h2 className="font-display text-lg font-bold text-gold-300">Domain-specific prices</h2>
      <form onSubmit={add} className="mt-4 grid gap-3 sm:grid-cols-[3fr_1fr_auto]">
        <input className="input-field" placeholder="gmail.com" value={domainName} onChange={(e) => setDomainName(e.target.value.toLowerCase())} />
        <input type="number" className="input-field" value={points} onChange={(e) => setPoints(Number(e.target.value))} />
        <button className="btn-gold h-11">
          <Plus className="h-5 w-5" />
        </button>
      </form>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-navy-300">
            <tr>
              <th className="py-2">Domain</th>
              <th>Points</th>
              <th></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-navy-700/60">
            {prices.map((p) => (
              <tr key={p.id} className="text-navy-100">
                <td className="py-2 font-mono">{p.domain.name}</td>
                <td>{p.pointsPerEmail}</td>
                <td>
                  <button onClick={() => del(p.id)} className="btn-ghost h-8 px-2 text-xs hover:!border-red-500/40 hover:!text-red-300">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BulkDiscountsPanel({ rules, reload }: { rules: BulkDiscount[]; reload: () => void }) {
  const [min, setMin] = useState(1000);
  const [pct, setPct] = useState(5);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    await api('/admin/pricing/bulk-discounts', {
      method: 'POST',
      body: JSON.stringify({ minQuantity: min, discountPct: pct, active: true }),
    });
    reload();
  }
  async function del(id: number) {
    await api(`/admin/pricing/bulk-discounts/${id}`, { method: 'DELETE' });
    reload();
  }

  return (
    <div className="card">
      <h2 className="font-display text-lg font-bold text-gold-300">Bulk discounts</h2>
      <form onSubmit={add} className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
        <input type="number" className="input-field" placeholder="Min quantity" value={min} onChange={(e) => setMin(Number(e.target.value))} />
        <input type="number" className="input-field" placeholder="Discount %" value={pct} onChange={(e) => setPct(Number(e.target.value))} />
        <button className="btn-gold h-11">
          <Plus className="h-5 w-5" />
        </button>
      </form>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-navy-300">
            <tr>
              <th className="py-2">Min qty</th>
              <th>Discount</th>
              <th></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-navy-700/60">
            {rules.map((r) => (
              <tr key={r.id} className="text-navy-100">
                <td className="py-2">{r.minQuantity.toLocaleString()}</td>
                <td className="text-emerald-300">−{r.discountPct}%</td>
                <td>
                  <button onClick={() => del(r.id)} className="btn-ghost h-8 px-2 text-xs hover:!border-red-500/40 hover:!text-red-300">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TopupBonusesPanel({ rules, reload }: { rules: TopupBonus[]; reload: () => void }) {
  const [min, setMin] = useState(50);
  const [pct, setPct] = useState(10);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    await api('/admin/pricing/topup-bonuses', {
      method: 'POST',
      body: JSON.stringify({ minUsd: min, bonusPct: pct, active: true }),
    });
    reload();
  }
  async function del(id: number) {
    await api(`/admin/pricing/topup-bonuses/${id}`, { method: 'DELETE' });
    reload();
  }

  return (
    <div className="card">
      <h2 className="font-display text-lg font-bold text-gold-300">Top-up bonuses</h2>
      <p className="text-xs text-navy-300">
        Reward users for larger top-ups. E.g. +20% bonus points on $100+.
      </p>
      <form onSubmit={add} className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
        <input type="number" className="input-field" placeholder="Min USD" value={min} onChange={(e) => setMin(Number(e.target.value))} />
        <input type="number" className="input-field" placeholder="Bonus %" value={pct} onChange={(e) => setPct(Number(e.target.value))} />
        <button className="btn-gold h-11">
          <Plus className="h-5 w-5" />
        </button>
      </form>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-navy-300">
            <tr>
              <th className="py-2">Min $</th>
              <th>Bonus</th>
              <th></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-navy-700/60">
            {rules.map((r) => (
              <tr key={r.id} className="text-navy-100">
                <td className="py-2">${r.minUsd}</td>
                <td className="text-emerald-300">+{r.bonusPct}%</td>
                <td>
                  <button onClick={() => del(r.id)} className="btn-ghost h-8 px-2 text-xs hover:!border-red-500/40 hover:!text-red-300">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
