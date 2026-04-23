'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface LedgerEntry {
  id: string;
  amount: string;
  type: string;
  balanceAfter: string;
  note: string | null;
  createdAt: string;
}

export default function LedgerPage() {
  const [items, setItems] = useState<LedgerEntry[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  async function load() {
    const r = await api<{ items: LedgerEntry[]; total: number }>(
      `/me/ledger?page=${page}&pageSize=30`,
    );
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
        <h1 className="font-display text-3xl font-bold text-gradient-gold">Ledger</h1>
        <p className="mt-2 text-navy-200">Every points transaction on your account.</p>
      </div>

      <div className="card">
        {items.length === 0 ? (
          <div className="text-navy-300">No entries yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-navy-300">
                <tr>
                  <th className="py-2">Date</th>
                  <th>Type</th>
                  <th>Amount</th>
                  <th>Balance</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-700/60">
                {items.map((e) => {
                  const n = Number(e.amount);
                  return (
                    <tr key={e.id} className="text-navy-100">
                      <td className="py-2 text-xs text-navy-300">
                        {new Date(e.createdAt).toLocaleString()}
                      </td>
                      <td className="capitalize">{e.type.replace(/_/g, ' ')}</td>
                      <td className={n >= 0 ? 'text-emerald-300' : 'text-red-300'}>
                        {n >= 0 ? '+' : ''}
                        {n.toLocaleString()}
                      </td>
                      <td className="text-gold-300">
                        {Number(e.balanceAfter).toLocaleString()}
                      </td>
                      <td className="text-xs text-navy-300">{e.note}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {total > 30 && (
          <div className="mt-4 flex items-center justify-between text-sm text-navy-200">
            <div>Page {page} · {total} entries</div>
            <div className="flex gap-2">
              <button
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
                className="btn-ghost h-8 px-3 text-xs disabled:opacity-40"
              >
                Prev
              </button>
              <button
                disabled={page * 30 >= total}
                onClick={() => setPage((p) => p + 1)}
                className="btn-ghost h-8 px-3 text-xs disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
