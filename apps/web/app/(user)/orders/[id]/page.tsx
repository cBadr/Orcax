'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ChevronLeft, Copy, Download } from 'lucide-react';
import { api } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';

interface OrderDetail {
  id: string;
  status: string;
  totalCount: number;
  totalPoints: string;
  createdAt: string;
  emailsPreview: string[];
  emailsCountReturned: number;
}

export default function OrderDetailPage() {
  const params = useParams<{ id: string }>();
  const toast = useToast();
  const [order, setOrder] = useState<OrderDetail | null>(null);

  useEffect(() => {
    api<OrderDetail>(`/orders/${params.id}`).then(setOrder);
  }, [params.id]);

  async function copyAll() {
    if (!order) return;
    await navigator.clipboard.writeText(order.emailsPreview.join('\n'));
    toast.push(`Copied ${order.emailsPreview.length} emails`, 'success');
  }

  if (!order) return <div className="text-navy-300">Loading...</div>;

  return (
    <div className="space-y-6">
      <Link href="/orders" className="inline-flex items-center text-sm text-navy-200 hover:text-gold-300">
        <ChevronLeft className="mr-1 h-4 w-4" /> Back to orders
      </Link>

      <div>
        <h1 className="font-display text-2xl font-bold text-gradient-gold">Order #{order.id.slice(0, 10)}</h1>
        <div className="mt-1 text-sm text-navy-300">{new Date(order.createdAt).toLocaleString()}</div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Emails" value={order.totalCount.toLocaleString()} />
        <Stat label="Points spent" value={Number(order.totalPoints).toLocaleString()} />
        <Stat label="Status" value={order.status} />
      </div>

      <div className="card">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-lg font-bold text-gold-300">
            Emails ({order.emailsPreview.length}
            {order.totalCount > order.emailsPreview.length ? ` of ${order.totalCount}` : ''})
          </h2>
          <div className="flex gap-2">
            <button onClick={copyAll} className="btn-ghost h-9 px-3 text-sm">
              <Copy className="mr-1.5 h-4 w-4" /> Copy
            </button>
            <Link href={`/exports?orderId=${order.id}`} className="btn-gold h-9 px-3 text-sm">
              <Download className="mr-1.5 h-4 w-4" /> Export
            </Link>
          </div>
        </div>
        <div className="max-h-[500px] overflow-y-auto rounded-lg bg-navy-950/60 p-4 font-mono text-xs text-navy-100">
          {order.emailsPreview.map((e, i) => (
            <div key={i} className="py-0.5">
              {e}
            </div>
          ))}
        </div>
        {order.totalCount > order.emailsPreview.length && (
          <div className="mt-3 text-xs text-navy-300">
            Showing {order.emailsPreview.length} of {order.totalCount}. Export to get the full list.
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card">
      <div className="text-xs uppercase tracking-wider text-navy-300">{label}</div>
      <div className="mt-2 font-display text-xl font-bold text-navy-50">{value}</div>
    </div>
  );
}
