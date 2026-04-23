'use client';
import { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { api } from '@/lib/api';
import { useBranding } from '@/lib/store';
import { useToast } from '@/components/ui/Toast';

type Form = Record<string, unknown>;

const FIELDS: Array<{
  section: string;
  items: Array<{
    key: string;
    label: string;
    type: 'text' | 'number' | 'bool' | 'password' | 'list' | 'color';
    hint?: string;
  }>;
}> = [
  {
    section: 'Branding',
    items: [
      { key: 'site_name', label: 'Site name', type: 'text' },
      { key: 'site_tagline', label: 'Tagline', type: 'text' },
      { key: 'logo_url', label: 'Logo URL', type: 'text', hint: 'Absolute URL to a square image' },
      { key: 'favicon_url', label: 'Favicon URL', type: 'text' },
      { key: 'primary_color', label: 'Primary color', type: 'color' },
      { key: 'accent_color', label: 'Accent color', type: 'color' },
      { key: 'support_telegram', label: 'Support Telegram handle', type: 'text', hint: 'e.g. @support' },
    ],
  },
  {
    section: 'Security',
    items: [
      { key: 'captcha_enabled', label: 'CAPTCHA enabled', type: 'bool' },
      { key: 'captcha_site_key', label: 'hCaptcha site key', type: 'text' },
      { key: 'captcha_secret', label: 'hCaptcha secret', type: 'password' },
      { key: 'two_fa_enabled', label: 'Allow 2FA', type: 'bool' },
      { key: 'email_verification_required', label: 'Require email verification', type: 'bool' },
      { key: 'google_oauth_enabled', label: 'Google OAuth enabled', type: 'bool' },
      { key: 'max_login_attempts', label: 'Max login attempts', type: 'number' },
      { key: 'lockout_minutes', label: 'Lockout duration (minutes)', type: 'number' },
      { key: 'session_ttl_minutes', label: 'Session TTL (minutes)', type: 'number' },
    ],
  },
  {
    section: 'Economy',
    items: [
      { key: 'points_per_dollar', label: 'Points per $1 USD', type: 'number' },
      { key: 'min_topup_usd', label: 'Min top-up (USD)', type: 'number' },
      { key: 'max_topup_usd', label: 'Max top-up (USD)', type: 'number' },
      { key: 'coinpayments_currencies', label: 'Accepted currencies (comma-separated)', type: 'list' },
    ],
  },
  {
    section: 'CoinPayments',
    items: [
      { key: 'coinpayments_client_id', label: 'Client ID', type: 'text' },
      { key: 'coinpayments_client_secret', label: 'Client Secret (also used to verify IPN)', type: 'password' },
    ],
  },
  {
    section: 'GoFile',
    items: [
      { key: 'gofile_account_id', label: 'Account ID', type: 'text' },
      { key: 'gofile_account_token', label: 'Account Token', type: 'password' },
      { key: 'auto_upload_to_gofile', label: 'Auto-upload exports', type: 'bool' },
    ],
  },
  {
    section: 'Search & Reservations',
    items: [
      { key: 'reservation_ttl_minutes', label: 'Reservation TTL (minutes)', type: 'number' },
      { key: 'demo_emails_count', label: 'Demo emails per search', type: 'number' },
      { key: 'max_search_results', label: 'Max search results', type: 'number' },
      { key: 'max_export_size', label: 'Max export size', type: 'number' },
      { key: 'cooldown_days_after_sale', label: 'Cooldown days after sale', type: 'number' },
    ],
  },
  {
    section: 'Referral & Exports',
    items: [
      { key: 'referral_enabled', label: 'Referral enabled', type: 'bool' },
      { key: 'referral_commission_pct', label: 'Referral commission %', type: 'number' },
      { key: 'export_local_retention_days', label: 'Export local retention (days)', type: 'number' },
    ],
  },
];

export default function AdminSettingsPage() {
  const toast = useToast();
  const reloadBranding = useBranding((s) => s.reload);
  const [form, setForm] = useState<Form>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api<Form>('/admin/settings').then(setForm);
  }, []);

  function upd(k: string, v: unknown) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function save() {
    setSaving(true);
    try {
      await api('/admin/settings', { method: 'PUT', body: JSON.stringify(form) });
      toast.push('Settings saved', 'success');
      // Refresh branding immediately so changes (site name, logo, colors) show up
      await reloadBranding();
    } catch (err) {
      toast.push((err as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold text-gradient-gold">Settings</h1>
          <p className="mt-2 text-navy-200">
            All values here are hot-loaded — changes apply without restart.
          </p>
        </div>
        <button onClick={save} disabled={saving} className="btn-gold">
          <Save className="mr-2 h-5 w-5" /> {saving ? 'Saving...' : 'Save all'}
        </button>
      </div>

      {FIELDS.map((g) => (
        <div key={g.section} className="card">
          <h2 className="mb-4 font-display text-lg font-bold text-gold-300">{g.section}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {g.items.map((f) => (
              <Field key={f.key} f={f} value={form[f.key]} onChange={(v) => upd(f.key, v)} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function Field({
  f,
  value,
  onChange,
}: {
  f: {
    key: string;
    label: string;
    type: 'text' | 'number' | 'bool' | 'password' | 'list' | 'color';
    hint?: string;
  };
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const hint = f.hint ? <p className="mt-1 text-xs text-navy-300">{f.hint}</p> : null;

  if (f.type === 'bool') {
    return (
      <div>
        <label className="flex cursor-pointer items-center justify-between rounded-xl border border-navy-700 bg-navy-950/60 px-4 py-3">
          <span className="text-sm text-navy-100">{f.label}</span>
          <input
            type="checkbox"
            checked={!!value}
            onChange={(e) => onChange(e.target.checked)}
            className="h-5 w-5 accent-gold-500"
          />
        </label>
        {hint}
      </div>
    );
  }
  if (f.type === 'number') {
    return (
      <div>
        <label className="label">{f.label}</label>
        <input
          type="number"
          className="input-field"
          value={(value as number | string | undefined) ?? ''}
          onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        />
        {hint}
      </div>
    );
  }
  if (f.type === 'list') {
    const arr = Array.isArray(value) ? (value as string[]) : [];
    return (
      <div>
        <label className="label">{f.label}</label>
        <input
          className="input-field"
          value={arr.join(', ')}
          onChange={(e) =>
            onChange(
              e.target.value
                .split(',')
                .map((x) => x.trim())
                .filter(Boolean),
            )
          }
        />
        {hint}
      </div>
    );
  }
  if (f.type === 'color') {
    const color = (value as string | undefined) ?? '#000000';
    return (
      <div>
        <label className="label">{f.label}</label>
        <div className="flex gap-2">
          <input
            type="color"
            className="input-field h-11 w-16 shrink-0 p-1"
            value={color}
            onChange={(e) => onChange(e.target.value)}
          />
          <input
            type="text"
            className="input-field font-mono"
            value={color}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
        {hint}
      </div>
    );
  }
  return (
    <div>
      <label className="label">{f.label}</label>
      <input
        type={f.type === 'password' ? 'password' : 'text'}
        className="input-field"
        value={(value as string | undefined) ?? ''}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint}
    </div>
  );
}
