import { Logo } from '@/components/ui/Logo';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="p-6">
        <Logo />
      </header>
      <main className="flex-1 flex items-center justify-center px-4 py-8">{children}</main>
      <footer className="p-6 text-center text-xs text-navy-300">
        © {new Date().getFullYear()} · All rights reserved
      </footer>
    </div>
  );
}
