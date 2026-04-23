'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronDown, X, Search } from 'lucide-react';

export interface ComboItem {
  id: string | number;
  label: string;
  sub?: string;
}

export function MultiCombobox({
  items,
  selectedIds,
  onChange,
  placeholder = 'Select...',
  searchPlaceholder = 'Type to filter...',
  emptyText = 'No results',
  maxHeight = 260,
}: {
  items: ComboItem[];
  selectedIds: Array<string | number>;
  onChange: (ids: Array<string | number>) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  maxHeight?: number;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const selectedItems = useMemo(
    () => items.filter((i) => selectedIds.includes(i.id)),
    [items, selectedIds],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => {
      const hay = `${i.label} ${i.sub ?? ''}`.toLowerCase();
      // Prioritize prefix matches, fall back to contains
      return hay.includes(q);
    });
  }, [items, query]);

  function toggle(id: string | number) {
    if (selectedIds.includes(id)) onChange(selectedIds.filter((x) => x !== id));
    else onChange([...selectedIds, id]);
  }

  function removeOne(id: string | number) {
    onChange(selectedIds.filter((x) => x !== id));
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="input-field flex min-h-[44px] w-full items-center justify-between gap-2 text-left"
      >
        <div className="flex flex-1 flex-wrap gap-1">
          {selectedItems.length === 0 && (
            <span className="text-navy-300">{placeholder}</span>
          )}
          {selectedItems.slice(0, 6).map((it) => (
            <span
              key={it.id}
              onClick={(e) => {
                e.stopPropagation();
                removeOne(it.id);
              }}
              className="inline-flex cursor-pointer items-center gap-1 rounded-full bg-gold-500/15 px-2 py-0.5 text-xs text-gold-300 hover:bg-gold-500/25"
            >
              {it.label}
              <X className="h-3 w-3" />
            </span>
          ))}
          {selectedItems.length > 6 && (
            <span className="rounded-full bg-navy-800 px-2 py-0.5 text-xs text-navy-200">
              +{selectedItems.length - 6} more
            </span>
          )}
        </div>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-navy-300 transition ${open ? 'rotate-180' : ''}`}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="absolute left-0 right-0 z-30 mt-1 overflow-hidden rounded-xl border border-navy-700 bg-navy-900/95 shadow-navy backdrop-blur"
          >
            <div className="border-b border-navy-700 p-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-navy-300" />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={searchPlaceholder}
                  className="w-full rounded-lg bg-navy-950 py-2 pl-9 pr-3 text-sm text-navy-50 focus:outline-none focus:ring-1 focus:ring-gold-500"
                />
              </div>
              <div className="mt-2 flex items-center justify-between px-1 text-xs text-navy-300">
                <span>
                  {filtered.length} match{filtered.length === 1 ? '' : 'es'} · {selectedItems.length}{' '}
                  selected
                </span>
                {selectedItems.length > 0 && (
                  <button
                    type="button"
                    onClick={() => onChange([])}
                    className="hover:text-gold-300"
                  >
                    Clear all
                  </button>
                )}
              </div>
            </div>
            <div className="overflow-y-auto" style={{ maxHeight }}>
              {filtered.length === 0 ? (
                <div className="p-4 text-center text-sm text-navy-300">{emptyText}</div>
              ) : (
                filtered.map((it) => {
                  const checked = selectedIds.includes(it.id);
                  return (
                    <button
                      type="button"
                      key={it.id}
                      onClick={() => toggle(it.id)}
                      className={`flex w-full items-center justify-between px-4 py-2 text-left text-sm transition ${
                        checked ? 'bg-gold-500/10 text-gold-300' : 'text-navy-100 hover:bg-navy-800/60'
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <span
                          className={`flex h-4 w-4 items-center justify-center rounded border ${
                            checked
                              ? 'border-gold-500 bg-gold-500 text-navy-950'
                              : 'border-navy-600'
                          }`}
                        >
                          {checked && <Check className="h-3 w-3" />}
                        </span>
                        <span>{it.label}</span>
                      </span>
                      {it.sub && <span className="text-xs text-navy-400">{it.sub}</span>}
                    </button>
                  );
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
