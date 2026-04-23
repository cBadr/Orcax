'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { FolderPlus, Play, Trash2, RefreshCcw, FolderSearch } from 'lucide-react';
import { api } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';

interface Folder {
  id: number;
  path: string;
  label: string | null;
  status: string;
  filesCount: number;
  emailsCount: string;
  lastScannedAt: string | null;
}

export default function IngestionPage() {
  const toast = useToast();
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(false);
  const [path, setPath] = useState('');
  const [label, setLabel] = useState('');

  async function load() {
    const list = await api<Folder[]>('/admin/ingestion/folders');
    setFolders(list);
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []);

  async function addFolder(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await api('/admin/ingestion/folders', {
        method: 'POST',
        body: JSON.stringify({ path, label: label || null }),
      });
      toast.push('Folder registered', 'success');
      setPath('');
      setLabel('');
      await load();
    } catch (err) {
      toast.push((err as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  }

  async function scan(id: number) {
    try {
      await api(`/admin/ingestion/folders/${id}/scan`, { method: 'POST' });
      toast.push('Scan started', 'success');
      await load();
    } catch (err) {
      toast.push((err as Error).message, 'error');
    }
  }

  async function del(id: number) {
    if (!confirm('Delete this folder? (emails will be kept)')) return;
    try {
      await api(`/admin/ingestion/folders/${id}?deleteEmails=false`, { method: 'DELETE' });
      toast.push('Folder removed', 'success');
      await load();
    } catch (err) {
      toast.push((err as Error).message, 'error');
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-bold text-gradient-gold">Email Ingestion</h1>
        <p className="mt-2 text-navy-200">
          Point the platform at folders on disk. Files are scanned, split by domain, and
          streamed into the database with dedup.
        </p>
      </div>

      <form onSubmit={addFolder} className="card space-y-4">
        <h2 className="font-display text-lg font-bold text-gold-300">Add folder</h2>
        <div className="grid gap-4 sm:grid-cols-[2fr_1fr_auto]">
          <div>
            <label className="label">Absolute path</label>
            <input
              required
              className="input-field"
              placeholder="D:\data\emails\batch-01"
              value={path}
              onChange={(e) => setPath(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Label (optional)</label>
            <input
              className="input-field"
              placeholder="Batch 01"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>
          <div className="flex items-end">
            <button disabled={loading} className="btn-gold h-11">
              <FolderPlus className="mr-2 h-5 w-5" />
              Register
            </button>
          </div>
        </div>
      </form>

      <div className="card">
        <h2 className="mb-4 font-display text-lg font-bold text-gold-300">Folders</h2>
        {folders.length === 0 ? (
          <div className="text-sm text-navy-200">No folders yet.</div>
        ) : (
          <div className="divide-y divide-navy-700/60">
            {folders.map((f) => (
              <motion.div
                key={f.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-wrap items-center gap-3 py-4"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate font-mono text-sm text-navy-50">{f.path}</div>
                  <div className="mt-1 text-xs text-navy-300">
                    {f.label ?? 'no label'} · {f.filesCount} files ·{' '}
                    {Number(f.emailsCount).toLocaleString()} emails ·{' '}
                    {f.lastScannedAt
                      ? `last scan ${new Date(f.lastScannedAt).toLocaleString()}`
                      : 'not scanned'}
                  </div>
                </div>
                <StatusBadge status={f.status} />
                <button onClick={() => scan(f.id)} className="btn-ghost h-9 px-3 text-sm">
                  {f.status === 'idle' ? (
                    <>
                      <Play className="mr-1.5 h-4 w-4" /> Scan
                    </>
                  ) : (
                    <>
                      <RefreshCcw className="mr-1.5 h-4 w-4" /> Rescan
                    </>
                  )}
                </button>
                <Link href={`/admin/ingestion/${f.id}`} className="btn-ghost h-9 px-3 text-sm">
                  <FolderSearch className="mr-1.5 h-4 w-4" /> Files
                </Link>
                <button
                  onClick={() => del(f.id)}
                  className="btn-ghost h-9 px-3 text-sm hover:!border-red-500/40 hover:!text-red-300"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const color =
    status === 'processing' || status === 'scanning'
      ? 'bg-gold-500/15 text-gold-300 border-gold-500/40 animate-pulse'
      : status === 'error'
        ? 'bg-red-500/15 text-red-300 border-red-500/40'
        : 'bg-navy-800 text-navy-100 border-navy-600';
  return (
    <span
      className={`rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize ${color}`}
    >
      {status}
    </span>
  );
}
