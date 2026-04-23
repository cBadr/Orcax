'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { RefreshCcw, ChevronLeft } from 'lucide-react';
import { api } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';

interface File {
  id: number;
  filename: string;
  status: string;
  linesCount: number;
  ingestedCount: number;
  duplicatesCount: number;
  invalidCount: number;
  errorMessage: string | null;
  processedAt: string | null;
  createdAt: string;
}

interface FolderDetail {
  id: number;
  path: string;
  label: string | null;
  status: string;
  filesCount: number;
  emailsCount: string;
  byStatus: Record<string, number>;
}

export default function FolderDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const toast = useToast();
  const [folder, setFolder] = useState<FolderDetail | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [status, setStatus] = useState<string>('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  async function load() {
    const [f, list] = await Promise.all([
      api<FolderDetail>(`/admin/ingestion/folders/${id}`),
      api<{ items: File[]; total: number }>(
        `/admin/ingestion/folders/${id}/files?page=${page}&pageSize=50${status ? `&status=${status}` : ''}`,
      ),
    ]);
    setFolder(f);
    setFiles(list.items);
    setTotal(list.total);
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, status, page]);

  async function rescan(fid: number) {
    try {
      await api(`/admin/ingestion/files/${fid}/rescan`, { method: 'POST' });
      toast.push('File re-queued', 'success');
      await load();
    } catch (err) {
      toast.push((err as Error).message, 'error');
    }
  }

  if (!folder) return <div className="text-navy-200">Loading...</div>;

  return (
    <div className="space-y-6">
      <Link href="/admin/ingestion" className="inline-flex items-center text-sm text-navy-200 hover:text-gold-300">
        <ChevronLeft className="mr-1 h-4 w-4" /> Back to folders
      </Link>

      <div>
        <h1 className="font-display text-2xl font-bold text-gradient-gold">
          {folder.label ?? folder.path}
        </h1>
        <div className="mt-1 font-mono text-xs text-navy-300">{folder.path}</div>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <Stat label="Total files" value={folder.filesCount.toLocaleString()} />
        <Stat label="Emails ingested" value={Number(folder.emailsCount).toLocaleString()} />
        <Stat label="Pending" value={(folder.byStatus.pending ?? 0).toString()} />
        <Stat label="Errors" value={(folder.byStatus.error ?? 0).toString()} />
      </div>

      <div className="card">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <h2 className="font-display text-lg font-bold text-gold-300">Files</h2>
          <select
            className="input-field w-40"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All statuses</option>
            <option value="pending">Pending</option>
            <option value="processing">Processing</option>
            <option value="done">Done</option>
            <option value="error">Error</option>
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-navy-300">
              <tr>
                <th className="py-2">Filename</th>
                <th>Status</th>
                <th>Lines</th>
                <th>Ingested</th>
                <th>Duplicates</th>
                <th>Invalid</th>
                <th></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-700/60">
              {files.map((f) => (
                <tr key={f.id} className="text-navy-100">
                  <td className="py-2 font-mono text-xs">{f.filename}</td>
                  <td>
                    <StatusPill status={f.status} />
                  </td>
                  <td>{f.linesCount}</td>
                  <td>{f.ingestedCount}</td>
                  <td>{f.duplicatesCount}</td>
                  <td>{f.invalidCount}</td>
                  <td>
                    {(f.status === 'error' || f.status === 'done') && (
                      <button
                        onClick={() => rescan(f.id)}
                        className="btn-ghost h-8 px-2 text-xs"
                      >
                        <RefreshCcw className="mr-1 h-3 w-3" />
                        Rescan
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {total > 50 && (
          <div className="mt-4 flex items-center justify-between text-sm text-navy-200">
            <div>
              Page {page} · {total} files total
            </div>
            <div className="flex gap-2">
              <button
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
                className="btn-ghost h-8 px-3 text-xs disabled:opacity-40"
              >
                Prev
              </button>
              <button
                disabled={page * 50 >= total}
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card py-4">
      <div className="text-xs uppercase tracking-wider text-navy-300">{label}</div>
      <div className="mt-2 font-display text-xl font-bold text-navy-50">{value}</div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const color =
    status === 'done'
      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
      : status === 'processing'
        ? 'bg-gold-500/15 text-gold-300 border-gold-500/40 animate-pulse'
        : status === 'error'
          ? 'bg-red-500/15 text-red-300 border-red-500/40'
          : 'bg-navy-800 text-navy-100 border-navy-600';
  return (
    <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${color}`}>
      {status}
    </span>
  );
}
