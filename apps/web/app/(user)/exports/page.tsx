'use client';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Download, Cloud, FileText, Loader2, AlertCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';

interface ExportJob {
  id: string;
  orderId: string | null;
  format: string;
  status: string;
  totalCount: number;
  filePath: string | null;
  fileSizeBytes: string | null;
  goFileUrl: string | null;
  expiresAt: string | null;
  createdAt: string;
  finishedAt: string | null;
  errorMessage: string | null;
}

export default function ExportsPage() {
  return (
    <Suspense fallback={null}>
      <ExportsInner />
    </Suspense>
  );
}

function ExportsInner() {
  const toast = useToast();
  const router = useRouter();
  const params = useSearchParams();
  const orderId = params.get('orderId');

  const [items, setItems] = useState<ExportJob[]>([]);
  const [format, setFormat] = useState<'txt' | 'csv'>('txt');
  const [creating, setCreating] = useState(false);

  async function load() {
    const r = await api<{ items: ExportJob[] }>('/exports');
    setItems(r.items);
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, []);

  async function createFromOrder() {
    if (!orderId) return;
    setCreating(true);
    try {
      await api(`/orders/${orderId}/export`, {
        method: 'POST',
        body: JSON.stringify({ format }),
      });
      toast.push('Export queued', 'success');
      router.replace('/exports');
      await load();
    } catch (err) {
      toast.push((err as Error).message, 'error');
    } finally {
      setCreating(false);
    }
  }

  async function download(id: string) {
    const token = localStorage.getItem('accessToken');
    const url = `${process.env.NEXT_PUBLIC_API_URL}/exports/${id}/download`;
    // Use fetch with auth header, convert to blob, trigger download
    try {
      const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(`Download failed: ${res.status}`);
      const blob = await res.blob();
      const u = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      const cd = res.headers.get('content-disposition') ?? '';
      const match = /filename="([^"]+)"/.exec(cd);
      a.href = u;
      a.download = match?.[1] ?? `export-${id}.txt`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(u);
    } catch (err) {
      toast.push((err as Error).message, 'error');
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold text-gradient-gold">Exports</h1>
        <p className="mt-2 text-navy-200">
          Download your order files locally or grab a permanent cloud link.
        </p>
      </div>

      {orderId && (
        <div className="card border-gold-500/40 bg-gold-500/5">
          <h2 className="font-display text-lg font-bold text-gold-300">Export order</h2>
          <p className="mt-1 text-sm text-navy-200 font-mono">#{orderId}</p>
          <div className="mt-4 flex items-center gap-3">
            <select
              className="input-field w-32"
              value={format}
              onChange={(e) => setFormat(e.target.value as 'txt' | 'csv')}
            >
              <option value="txt">TXT</option>
              <option value="csv">CSV</option>
            </select>
            <button onClick={createFromOrder} disabled={creating} className="btn-gold">
              {creating ? (
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              ) : (
                <Download className="mr-2 h-5 w-5" />
              )}
              Create export
            </button>
          </div>
        </div>
      )}

      <div className="card">
        <h2 className="mb-4 font-display text-lg font-bold text-gold-300">Export history</h2>
        {items.length === 0 ? (
          <div className="text-navy-300">No exports yet.</div>
        ) : (
          <div className="divide-y divide-navy-700/60">
            {items.map((e) => (
              <div key={e.id} className="flex flex-wrap items-center gap-4 py-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gold-500/10 text-gold-400">
                  <FileText className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="truncate text-sm text-navy-50">
                    {e.totalCount.toLocaleString()} emails · {e.format.toUpperCase()}
                    {e.fileSizeBytes && (
                      <span className="ml-2 text-xs text-navy-300">
                        ({formatBytes(Number(e.fileSizeBytes))})
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-xs text-navy-300">
                    {new Date(e.createdAt).toLocaleString()}
                    {e.expiresAt && e.filePath && (
                      <>
                        {' · '}local until {new Date(e.expiresAt).toLocaleDateString()}
                      </>
                    )}
                  </div>
                  {e.errorMessage && (
                    <div className="mt-1 flex items-center gap-1 text-xs text-red-300">
                      <AlertCircle className="h-3 w-3" /> {e.errorMessage}
                    </div>
                  )}
                </div>
                <StatusPill status={e.status} />
                {e.status === 'done' && (
                  <div className="flex gap-2">
                    {e.filePath && (
                      <button
                        onClick={() => download(e.id)}
                        className="btn-ghost h-9 px-3 text-sm"
                      >
                        <Download className="mr-1.5 h-4 w-4" /> Download
                      </button>
                    )}
                    {e.goFileUrl && (
                      <a
                        href={e.goFileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-gold h-9 px-3 text-sm"
                      >
                        <Cloud className="mr-1.5 h-4 w-4" /> Cloud link
                      </a>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const color =
    status === 'done'
      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
      : status === 'running' || status === 'queued'
        ? 'bg-gold-500/15 text-gold-300 border-gold-500/40 animate-pulse'
        : 'bg-red-500/15 text-red-300 border-red-500/40';
  return (
    <span className={`rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${color}`}>
      {status}
    </span>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}
