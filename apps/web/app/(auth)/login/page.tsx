'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { LogIn, Mail, Lock } from 'lucide-react';
import { useAuth } from '@/lib/store';
import { useToast } from '@/components/ui/Toast';

export default function LoginPage() {
  const router = useRouter();
  const { login, loading } = useAuth();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await login(email, password);
      toast.push('Welcome back!', 'success');
      const user = useAuth.getState().user;
      router.push(user && ['super_admin', 'admin', 'moderator'].includes(user.role) ? '/admin' : '/dashboard');
    } catch (err) {
      toast.push((err as Error).message, 'error');
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="w-full max-w-md"
    >
      <div className="card">
        <h1 className="font-display text-3xl font-bold text-gradient-gold">Welcome back</h1>
        <p className="mt-2 text-sm text-navy-200">Sign in to unlock premium email intelligence.</p>

        <form onSubmit={onSubmit} className="mt-8 space-y-5">
          <div>
            <label className="label">Email</label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-3 h-5 w-5 text-navy-300" />
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-field pl-10"
                placeholder="you@example.com"
              />
            </div>
          </div>
          <div>
            <label className="label">Password</label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-3 h-5 w-5 text-navy-300" />
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-field pl-10"
                placeholder="••••••••"
              />
            </div>
          </div>
          <button type="submit" disabled={loading} className="btn-gold w-full animate-pulse-gold">
            <LogIn className="mr-2 h-5 w-5" />
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        <div className="mt-6 flex items-center justify-between text-sm">
          <Link href="/register" className="text-gold-400 hover:text-gold-300">
            Create account
          </Link>
          <Link href="/forgot" className="text-navy-200 hover:text-gold-400">
            Forgot password?
          </Link>
        </div>
      </div>
    </motion.div>
  );
}
