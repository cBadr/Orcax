'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, Send } from 'lucide-react';
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
  userEmail: string;
  createdAt: string;
  messages: Msg[];
}

export default function AdminTicketDetail() {
  const params = useParams<{ id: string }>();
  const toast = useToast();
  const [t, setT] = useState<Ticket | null>(null);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);

  async function load() {
    setT(await api<Ticket>(`/admin/tickets/${params.id}`));
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    try {
      await api(`/admin/tickets/${params.id}/reply`, {
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

  async function setStatus(status: string) {
    await api(`/admin/tickets/${params.id}/status`, {
      method: 'POST',
      body: JSON.stringify({ status }),
    });
    await load();
  }

  if (!t) return <div className="text-navy-300">Loading...</div>;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href="/admin/tickets" className="inline-flex items-center text-sm text-navy-200 hover:text-gold-300">
        <ChevronLeft className="mr-1 h-4 w-4" /> Back
      </Link>
      <div>
        <h1 className="font-display text-2xl font-bold text-gradient-gold">{t.subject}</h1>
        <div className="mt-1 text-xs text-navy-300">
          From: {t.userEmail} · Priority: {t.priority}
        </div>
        <div className="mt-3 flex gap-2">
          {['open', 'answered', 'closed'].map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={`rounded-full border px-3 py-1 text-xs font-medium capitalize ${
                t.status === s
                  ? 'border-gold-500 bg-gold-500/10 text-gold-300'
                  : 'border-navy-600 bg-navy-800 text-navy-200 hover:border-gold-500/40'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        {t.messages.map((m) => (
          <div key={m.id} className={`card ${m.authorType === 'staff' ? 'border-gold-500/40 bg-gold-500/5' : ''}`}>
            <div className="flex items-center justify-between text-xs text-navy-300">
              <span>
                <b className={m.authorType === 'staff' ? 'text-gold-300' : 'text-navy-100'}>
                  {m.authorType === 'staff' ? 'Support' : 'Customer'}
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
            rows={5}
            className="input-field resize-none"
            placeholder="Reply to customer..."
            value={reply}
            onChange={(e) => setReply(e.target.value)}
          />
          <div className="flex justify-end">
            <button disabled={sending} className="btn-gold">
              <Send className="mr-2 h-5 w-5" />
              {sending ? 'Sending...' : 'Send reply'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
