'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, MessageCircle, ChevronRight, Send } from 'lucide-react';
import { api } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';

interface Ticket {
  id: string;
  subject: string;
  status: string;
  priority: string;
  createdAt: string;
  updatedAt: string;
  _count: { messages: number };
}

export default function TicketsPage() {
  const toast = useToast();
  const [list, setList] = useState<Ticket[]>([]);
  const [creating, setCreating] = useState(false);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [priority, setPriority] = useState('normal');

  async function load() {
    setList(await api<Ticket[]>('/tickets'));
  }
  useEffect(() => {
    load();
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api('/tickets', {
        method: 'POST',
        body: JSON.stringify({ subject, message, priority }),
      });
      toast.push('Ticket created', 'success');
      setSubject('');
      setMessage('');
      setCreating(false);
      await load();
    } catch (err) {
      toast.push((err as Error).message, 'error');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold text-gradient-gold">Support</h1>
          <p className="mt-2 text-navy-200">Open a ticket and our team will get back to you.</p>
        </div>
        <button onClick={() => setCreating((v) => !v)} className="btn-gold">
          <Plus className="mr-2 h-5 w-5" /> New ticket
        </button>
      </div>

      {creating && (
        <form onSubmit={create} className="card space-y-4">
          <div>
            <label className="label">Subject</label>
            <input required className="input-field" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="label">Priority</label>
              <select className="input-field" value={priority} onChange={(e) => setPriority(e.target.value)}>
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
              </select>
            </div>
          </div>
          <div>
            <label className="label">Message</label>
            <textarea
              required
              rows={6}
              className="input-field resize-none"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setCreating(false)} className="btn-ghost">
              Cancel
            </button>
            <button className="btn-gold">
              <Send className="mr-2 h-5 w-5" /> Submit
            </button>
          </div>
        </form>
      )}

      <div className="card">
        {list.length === 0 ? (
          <div className="flex min-h-[160px] items-center justify-center text-center">
            <div>
              <MessageCircle className="mx-auto h-10 w-10 text-navy-300" />
              <div className="mt-3 text-navy-100">No tickets yet</div>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-navy-700/60">
            {list.map((t) => (
              <Link
                key={t.id}
                href={`/tickets/${t.id}`}
                className="flex items-center justify-between py-4 transition-colors hover:bg-navy-800/40"
              >
                <div>
                  <div className="font-display text-navy-50">{t.subject}</div>
                  <div className="mt-1 text-xs text-navy-300">
                    {t._count.messages} msgs ·{' '}
                    {new Date(t.updatedAt).toLocaleString()}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <StatusPill status={t.status} />
                  <ChevronRight className="h-5 w-5 text-navy-300" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const color =
    status === 'answered'
      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
      : status === 'closed'
        ? 'bg-navy-800 text-navy-300 border-navy-600'
        : 'bg-gold-500/15 text-gold-300 border-gold-500/40 animate-pulse';
  return (
    <span className={`rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${color}`}>
      {status}
    </span>
  );
}
