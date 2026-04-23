'use client';
import { useEffect, useState } from 'react';
import { Save, Shield } from 'lucide-react';
import { api } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';

interface Role {
  id: number;
  name: string;
  displayName: string;
  isSystem: boolean;
  usersCount: number;
  permissions: string[];
}
interface Permission {
  id: number;
  key: string;
  description: string | null;
}

export default function RolesPage() {
  const toast = useToast();
  const [roles, setRoles] = useState<Role[]>([]);
  const [perms, setPerms] = useState<Permission[]>([]);
  const [editing, setEditing] = useState<Role | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  async function load() {
    const [r, p] = await Promise.all([
      api<Role[]>('/admin/roles'),
      api<Permission[]>('/admin/permissions'),
    ]);
    setRoles(r);
    setPerms(p);
  }
  useEffect(() => {
    load();
  }, []);

  function edit(role: Role) {
    if (role.name === 'super_admin') {
      toast.push('Super admin cannot be modified', 'info');
      return;
    }
    setEditing(role);
    setSelected(new Set(role.permissions));
  }

  async function save() {
    if (!editing) return;
    try {
      await api(`/admin/roles/${editing.id}/permissions`, {
        method: 'PUT',
        body: JSON.stringify({ permissions: [...selected] }),
      });
      toast.push('Role updated', 'success');
      setEditing(null);
      await load();
    } catch (err) {
      toast.push((err as Error).message, 'error');
    }
  }

  // Group perms by prefix for display
  const grouped = perms.reduce<Record<string, Permission[]>>((acc, p) => {
    const key = p.key.split('.')[0] ?? 'misc';
    (acc[key] ??= []).push(p);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold text-gradient-gold">Roles & Permissions</h1>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {roles.map((r) => (
          <div key={r.id} className="card">
            <div className="flex items-center gap-3">
              <Shield className="h-5 w-5 text-gold-400" />
              <div>
                <div className="font-display text-lg font-bold text-navy-50">{r.displayName}</div>
                <div className="text-xs text-navy-300">
                  {r.usersCount} users · {r.permissions.length} permissions
                </div>
              </div>
            </div>
            <button
              onClick={() => edit(r)}
              disabled={r.name === 'super_admin'}
              className="btn-ghost mt-4 w-full disabled:opacity-40"
            >
              {r.name === 'super_admin' ? 'System (locked)' : 'Edit permissions'}
            </button>
          </div>
        ))}
      </div>

      {editing && (
        <div className="card">
          <h2 className="font-display text-lg font-bold text-gold-300">
            Editing: {editing.displayName}
          </h2>

          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(grouped).map(([group, list]) => (
              <div key={group} className="rounded-xl bg-navy-950/60 p-4">
                <div className="mb-2 text-xs uppercase tracking-wider text-navy-300">{group}</div>
                <div className="space-y-1">
                  {list.map((p) => {
                    const checked = selected.has(p.key);
                    return (
                      <label key={p.key} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs hover:bg-navy-800/60">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            const next = new Set(selected);
                            if (e.target.checked) next.add(p.key);
                            else next.delete(p.key);
                            setSelected(next);
                          }}
                          className="h-3.5 w-3.5 accent-gold-500"
                        />
                        <span className="font-mono text-navy-100">{p.key}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 flex justify-end gap-2">
            <button onClick={() => setEditing(null)} className="btn-ghost">
              Cancel
            </button>
            <button onClick={save} className="btn-gold">
              <Save className="mr-2 h-5 w-5" /> Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
