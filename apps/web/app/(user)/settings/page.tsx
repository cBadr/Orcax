'use client';
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Shield, ShieldCheck, ShieldOff, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/store';
import { useToast } from '@/components/ui/Toast';

export default function SettingsPage() {
  const toast = useToast();
  const user = useAuth((s) => s.user);
  const refresh = useAuth((s) => s.refresh);
  const [me, setMe] = useState<{ twoFaEnabled: boolean } | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function loadMe() {
    const m = await api<{ twoFaEnabled: boolean }>('/auth/me');
    setMe(m);
  }
  useEffect(() => {
    loadMe();
  }, []);

  async function setup() {
    setLoading(true);
    try {
      const r = await api<{ qrDataUrl: string; secret: string }>('/2fa/setup', {
        method: 'POST',
      });
      setQr(r.qrDataUrl);
      setSecret(r.secret);
    } catch (err) {
      toast.push((err as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  }

  async function enable() {
    try {
      await api('/2fa/enable', {
        method: 'POST',
        body: JSON.stringify({ code }),
      });
      toast.push('2FA enabled', 'success');
      setQr(null);
      setSecret('');
      setCode('');
      await loadMe();
      await refresh();
    } catch (err) {
      toast.push((err as Error).message, 'error');
    }
  }

  async function disable() {
    try {
      await api('/2fa/disable', {
        method: 'POST',
        body: JSON.stringify({ password }),
      });
      toast.push('2FA disabled', 'info');
      setPassword('');
      await loadMe();
      await refresh();
    } catch (err) {
      toast.push((err as Error).message, 'error');
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold text-gradient-gold">Account Settings</h1>
        <p className="mt-2 text-navy-200">Profile and security.</p>
      </div>

      <div className="card">
        <h2 className="font-display text-lg font-bold text-gold-300">Profile</h2>
        <div className="mt-4 space-y-2 text-sm">
          <Row label="Email" value={user?.email ?? ''} />
          <Row label="Referral code" value={user?.referralCode ?? ''} />
          <Row label="Role" value={user?.role ?? ''} />
          <Row label="Balance" value={`${Number(user?.balancePoints ?? 0).toLocaleString()} pts`} />
        </div>
      </div>

      <div className="card">
        <div className="flex items-center gap-3">
          {me?.twoFaEnabled ? (
            <ShieldCheck className="h-6 w-6 text-emerald-400" />
          ) : (
            <Shield className="h-6 w-6 text-gold-400" />
          )}
          <h2 className="font-display text-lg font-bold text-gold-300">
            Two-factor authentication
          </h2>
        </div>
        <p className="mt-2 text-sm text-navy-200">
          {me?.twoFaEnabled
            ? '2FA is active. A 6-digit code is required at login.'
            : 'Add a second factor with Google Authenticator, Authy, or any TOTP app.'}
        </p>

        {!me?.twoFaEnabled && !qr && (
          <button onClick={setup} disabled={loading} className="btn-gold mt-4">
            {loading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Shield className="mr-2 h-5 w-5" />}
            Enable 2FA
          </button>
        )}

        {qr && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 space-y-4 rounded-xl border border-gold-500/40 bg-gold-500/5 p-4"
          >
            <div className="flex items-start gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qr} alt="QR" className="h-40 w-40 rounded-lg bg-white p-2" />
              <div className="flex-1 text-sm text-navy-100">
                <p>Scan this QR code with your authenticator app, or enter the secret manually:</p>
                <code className="mt-2 block break-all rounded bg-navy-950 p-2 font-mono text-xs text-gold-300">
                  {secret}
                </code>
              </div>
            </div>
            <div>
              <label className="label">Enter 6-digit code</label>
              <div className="flex gap-2">
                <input
                  className="input-field font-mono"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                />
                <button onClick={enable} className="btn-gold">
                  Verify
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {me?.twoFaEnabled && (
          <div className="mt-4 rounded-xl border border-red-500/40 bg-red-500/5 p-4">
            <div className="text-sm text-red-200">Disable 2FA (requires password)</div>
            <div className="mt-2 flex gap-2">
              <input
                type="password"
                className="input-field"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Your password"
              />
              <button onClick={disable} className="btn-ghost text-red-200">
                <ShieldOff className="mr-2 h-5 w-5" />
                Disable
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-navy-700/40 py-2 last:border-none">
      <span className="text-navy-300">{label}</span>
      <span className="font-mono text-navy-50">{value}</span>
    </div>
  );
}
