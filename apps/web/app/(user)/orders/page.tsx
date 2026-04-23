'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ShoppingBag, ChevronRight } from 'lucide-react';
import { api } from '@/lib/api';

interface Order {
  id: string;
  status: string;
  totalCount: number;
  totalPoints: string;
  createdAt: string;
}

export default function OrdersPage() {
  const [items, setItems] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<{ items: Order[] }>('/orders')
      .then((r) => setItems(r.items))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold text-gradient-gold">My Orders</h1>
        <p className="mt-2 text-navy-200">All your confirmed purchases.</p>
      </div>

      <div className="card">
        {loading ? (
          <div className="text-navy-300">Loading...</div>
        ) : items.length === 0 ? (
          <div className="flex min-h-[160px] items-center justify-center text-center">
            <div>
              <ShoppingBag className="mx-auto h-10 w-10 text-navy-300" />
              <div className="mt-3 text-navy-100">No orders yet</div>
              <Link href="/search" className="btn-gold mt-4 inline-flex">
                Start searching
              </Link>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-navy-700/60">
            {items.map((o) => (
              <Link
                key={o.id}
                href={`/orders/${o.id}`}
                className="flex items-center justify-between py-4 transition-colors hover:bg-navy-800/40"
              >
                <div>
                  <div className="font-mono text-xs text-navy-300">#{o.id.slice(0, 10)}</div>
                  <div className="mt-1 text-navy-50">
                    {o.totalCount.toLocaleString()} emails ·{' '}
                    <span className="text-gold-300">{Number(o.totalPoints).toLocaleString()} pts</span>
                  </div>
                  <div className="mt-1 text-xs text-navy-300">
                    {new Date(o.createdAt).toLocaleString()}
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 text-navy-300" />
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
