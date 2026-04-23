'use client';
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Megaphone, X } from 'lucide-react';
import { api } from '@/lib/api';

interface Announcement {
  id: number;
  title: string;
  body: string;
  type: string;
}

export function AnnouncementsBanner() {
  const [items, setItems] = useState<Announcement[]>([]);
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());

  useEffect(() => {
    api<Announcement[]>('/announcements').then(setItems).catch(() => {});
    const stored = typeof window !== 'undefined' ? localStorage.getItem('dismissedAnn') : null;
    if (stored) {
      try {
        setDismissed(new Set(JSON.parse(stored)));
      } catch {
        // ignore
      }
    }
  }, []);

  function dismiss(id: number) {
    const next = new Set(dismissed);
    next.add(id);
    setDismissed(next);
    if (typeof window !== 'undefined') {
      localStorage.setItem('dismissedAnn', JSON.stringify([...next]));
    }
  }

  const visible = items.filter((a) => !dismissed.has(a.id));
  if (visible.length === 0) return null;

  return (
    <div className="space-y-2 p-4">
      <AnimatePresence>
        {visible.map((a) => (
          <motion.div
            key={a.id}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${
              a.type === 'warning'
                ? 'border-yellow-500/40 bg-yellow-500/5 text-yellow-100'
                : a.type === 'success'
                  ? 'border-emerald-500/40 bg-emerald-500/5 text-emerald-100'
                  : 'border-gold-500/40 bg-gold-500/5 text-gold-100'
            }`}
          >
            <Megaphone className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="flex-1">
              <div className="font-semibold">{a.title}</div>
              <div className="text-xs opacity-90">{a.body}</div>
            </div>
            <button onClick={() => dismiss(a.id)} className="opacity-60 hover:opacity-100">
              <X className="h-4 w-4" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
