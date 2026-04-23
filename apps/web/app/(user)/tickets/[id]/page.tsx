'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ChevronLeft, Send, XCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';

interface Msg {
  id: string;
  body: string;
  authorType: string;
  authorEmail: string;
  authorRole: string;
  createdAt: string;
}
interface Ticket {
  id: string;
  subject: string;
  status: string;
  priority: string;
  createdAt: string;
  messages: Msg[];
}

export default function TicketDetailPage() {
  const params = useParams<{ id: string }>();
  const toast = useToast();
  const [t, setT] = useState<Ticket | null>(null);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);

  async function load() {
    setT(await api<Ticket>(`/tickets/${params.id}`));
  }
  useEffect(() => {
    load();
    const i = setInterval(load, 10000);
    return () => clearInterval(i);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    try {
      await api(`/tickets/${params.id}/reply`, {
        method: 'POST',
        body: JSON.stringify({ message: reply }),
      });
      setReply('');
      await load();
    } catch (err) {
      toast.push((err as Error).message, 'error');
    } finally {
      setSending(false);
    }
  }

  async function close() {
    if (!confirm('Close this ticket?')) return;
    await api(`/tickets/${params.id}/close`, { method: 'POST' });
    toast.push('Ticket closed', 'info');
    await load();
  }

  if (!t) return <div className="text-navy-300">Loading...</div>;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href="/tickets" className="inline-flex items-center text-sm text-navy-200 hover:text-gold-300">
        <ChevronLeft className="mr-1 h-4 w-4" /> Back
      </Link>
      <div>
        <div className="flex items-start justify-between gap-4">
          <h1 className="font-display text-2xl font-bold text-gradient-gold">{t.subject}</h1>
          {t.status !== 'closed' && (
            <button onClick={close} className="btn-ghost h-9 px-3 text-xs">
              <XCircle className="mr-1 h-4 w-4" /> Close
            </button>
          )}
        </div>
        <div className="mt-1 text-xs text-navy-300">
          {new Date(t.createdAt).toLocaleString()} · status: {t.status}
        </div>
      </div>

      <div className="space-y-3">
        {t.messages.map((m) => (
          <div
            key={m.id}
            className={`card ${m.authorType === 'staff' ? 'border-gold-500/40 bg-gold-500/5' : ''}`}
          >
            <div className="flex items-center justify-between text-xs text-navy-300">
              <span>
                <b className={m.authorType === 'staff' ? 'text-gold-300' : 'text-navy-100'}>
                  {m.authorType === 'staff' ? 'Support' : 'You'}
                </b>
                <span className="ml-2">{m.authorEmail}</span>
              </span>
              <span>{new Date(m.createdAt).toLocaleString()}</span>
            </div>
            <div className="mt-2 whitespace-pre-wrap text-navy-50">{m.body}</div>
          </div>
        ))}
      </div>

      {t.status !== 'closed' && (
        <form onSubmit={send} className="card space-y-3">
          <textarea
            required
            rows={4}
            className="input-field resize-none"
            placeholder="Your reply..."
            value={reply}
            onChange={(e) => setReply(e.target.value)}
          />
          <div className="flex justify-end">
            <button disabled={sending} className="btn-gold">
              <Send className="mr-2 h-5 w-5" />
              {sending ? 'Sending...' : 'Reply'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
