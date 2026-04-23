'use client';
import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { UserPlus } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/store';
import { useToast } from '@/components/ui/Toast';

export default function RegisterPage() {
  return (
    <Suspense fallback={null}>
      <RegisterInner />
    </Suspense>
  );
}

function RegisterInner() {
  const router = useRouter();
  const toast = useToast();
  const params = useSearchParams();
  const login = useAuth((s) => s.login);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    country: 'US',
    telegram: '',
    referralCode: '',
  });

  useEffect(() => {
    const ref = params.get('ref');
    if (ref) setForm((f) => ({ ...f, referralCode: ref.toUpperCase() }));
  }, [params]);

  function set<K extends keyof typeof form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await api('/auth/register', {
        method: 'POST',
        auth: false,
        body: JSON.stringify({
          email: form.email,
          password: form.password,
          confirmPassword: form.confirmPassword,
          country: form.country,
          telegram: form.telegram || null,
          referralCode: form.referralCode || null,
        }),
      });
      toast.push('Account created. Signing you in...', 'success');
      await login(form.email, form.password);
      router.push('/dashboard');
    } catch (err) {
      toast.push((err as Error).message, 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="w-full max-w-lg"
    >
      <div className="card">
        <h1 className="font-display text-3xl font-bold text-gradient-gold">Create your account</h1>
        <p className="mt-2 text-sm text-navy-200">Join thousands buying premium email data.</p>

        <form onSubmit={onSubmit} className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label">Email</label>
            <input type="email" required className="input-field" value={form.email} onChange={(e) => set('email', e.target.value)} />
          </div>
          <div>
            <label className="label">Password</label>
            <input type="password" required className="input-field" value={form.password} onChange={(e) => set('password', e.target.value)} />
          </div>
          <div>
            <label className="label">Confirm Password</label>
            <input type="password" required className="input-field" value={form.confirmPassword} onChange={(e) => set('confirmPassword', e.target.value)} />
          </div>
          <div>
            <label className="label">Country (ISO)</label>
            <input maxLength={2} required className="input-field uppercase" value={form.country} onChange={(e) => set('country', e.target.value.toUpperCase())} />
          </div>
          <div>
            <label className="label">Telegram (optional)</label>
            <input className="input-field" placeholder="@username" value={form.telegram} onChange={(e) => set('telegram', e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Referral code (optional)</label>
            <input className="input-field uppercase" value={form.referralCode} onChange={(e) => set('referralCode', e.target.value.toUpperCase())} />
          </div>

          <button type="submit" disabled={loading} className="btn-gold sm:col-span-2">
            <UserPlus className="mr-2 h-5 w-5" />
            {loading ? 'Creating...' : 'Create account'}
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-navy-200">
          Already have an account?{' '}
          <Link href="/login" className="text-gold-400 hover:text-gold-300">
            Sign in
          </Link>
        </div>
      </div>
    </motion.div>
  );
}
