'use client';
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Bell, Check } from 'lucide-react';
import { api } from '@/lib/api';

interface Notif {
  id: string;
  type: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
}

export function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notif[]>([]);
  const [unread, setUnread] = useState(0);

  async function load() {
    try {
      const r = await api<{ unreadCount: number; items: Notif[] }>(
        '/notifications?limit=20',
      );
      setItems(r.items);
      setUnread(r.unreadCount);
    } catch {
      // unauth or offline, ignore
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);

  async function readAll() {
    await api('/notifications/read-all', { method: 'POST' });
    await load();
  }

  async function readOne(id: string) {
    await api(`/notifications/${id}/read`, { method: 'POST' });
    await load();
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-xl border border-navy-600 bg-navy-800/50 p-2 text-navy-100 hover:text-gold-400"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-gold-500 px-1 text-[10px] font-bold text-navy-950">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
      <AnimatePresence>
        {open && (
          <>
            <div
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-30"
              aria-hidden
            />
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="absolute right-0 z-40 mt-2 w-80 overflow-hidden rounded-xl border border-navy-700 bg-navy-900/95 shadow-navy backdrop-blur"
            >
              <div className="flex items-center justify-between border-b border-navy-700 px-4 py-3">
                <span className="font-display font-bold text-gold-300">Notifications</span>
                {unread > 0 && (
                  <button onClick={readAll} className="text-xs text-navy-200 hover:text-gold-300">
                    <Check className="mr-1 inline h-3 w-3" /> Mark all read
                  </button>
                )}
              </div>
              <div className="max-h-96 overflow-y-auto">
                {items.length === 0 ? (
                  <div className="p-6 text-center text-sm text-navy-300">No notifications</div>
                ) : (
                  items.map((n) => (
                    <button
                      key={n.id}
                      onClick={() => !n.readAt && readOne(n.id)}
                      className={`block w-full border-b border-navy-800 px-4 py-3 text-left text-sm transition hover:bg-navy-800/60 ${
                        !n.readAt ? 'bg-gold-500/5' : ''
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-medium text-navy-50">{n.title}</span>
                        {!n.readAt && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-gold-500" />}
                      </div>
                      <div className="mt-0.5 text-xs text-navy-300">{n.body}</div>
                      <div className="mt-1 text-[10px] uppercase tracking-wider text-navy-400">
                        {new Date(n.createdAt).toLocaleString()}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
