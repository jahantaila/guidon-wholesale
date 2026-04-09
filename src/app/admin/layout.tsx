'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const navItems = [
  { href: '/admin', label: 'Dashboard', icon: DashboardIcon },
  { href: '/admin/orders', label: 'Orders', icon: OrdersIcon },
  { href: '/admin/kegs', label: 'Keg Tracker', icon: KegsIcon },
  { href: '/admin/customers', label: 'Customers', icon: CustomersIcon },
  { href: '/admin/invoices', label: 'Invoices', icon: InvoicesIcon },
];

function DashboardIcon({ className }: { className?: string }) {
  return (
    <svg className={cn('w-5 h-5', className)} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
    </svg>
  );
}

function OrdersIcon({ className }: { className?: string }) {
  return (
    <svg className={cn('w-5 h-5', className)} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
    </svg>
  );
}

function KegsIcon({ className }: { className?: string }) {
  return (
    <svg className={cn('w-5 h-5', className)} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
    </svg>
  );
}

function CustomersIcon({ className }: { className?: string }) {
  return (
    <svg className={cn('w-5 h-5', className)} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function InvoicesIcon({ className }: { className?: string }) {
  return (
    <svg className={cn('w-5 h-5', className)} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" />
    </svg>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [authenticated, setAuthenticated] = useState(false);
  const [checking, setChecking] = useState(true);
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const hasAuth = document.cookie.includes('admin_session');
    setAuthenticated(hasAuth);
    setChecking(false);
  }, []);

  const handleLogin = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setLoggingIn(true);
    setLoginError('');
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (res.ok) setAuthenticated(true);
      else {
        const data = await res.json();
        setLoginError(data.error || 'Invalid password');
      }
    } catch { setLoginError('Login failed. Please try again.'); }
    finally { setLoggingIn(false); }
  }, [password]);

  const handleLogout = useCallback(async () => {
    await fetch('/api/admin/login', { method: 'DELETE' });
    setAuthenticated(false);
    setPassword('');
  }, []);

  if (checking) {
    return (
      <div className="min-h-screen bg-charcoal flex items-center justify-center">
        <div className="skeleton w-10 h-10 rounded-full" />
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-charcoal flex items-center justify-center p-4 relative">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/3 right-1/3 w-96 h-96 bg-gold/[0.02] rounded-full blur-3xl" />
        </div>
        <div className="relative card max-w-sm w-full">
          <div className="text-center mb-6">
            <div className="w-12 h-12 bg-gold-gradient rounded-xl flex items-center justify-center shadow-gold mx-auto mb-4">
              <span className="text-charcoal font-heading font-black text-xl">G</span>
            </div>
            <h1 className="text-2xl font-heading font-black text-cream mb-1">Admin Panel</h1>
            <p className="text-sm text-cream/30">Enter your password to continue</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder="Admin password" className="input" autoFocus />
            {loginError && <p className="text-red-400 text-sm bg-red-500/10 rounded-lg px-3 py-2 border border-red-500/20">{loginError}</p>}
            <button type="submit" disabled={loggingIn} className="btn-primary w-full py-3">
              {loggingIn ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-charcoal">
      {/* Mobile overlay */}
      {sidebarOpen && <div className="fixed inset-0 bg-black/60 z-30 lg:hidden animate-fade-in" onClick={() => setSidebarOpen(false)} />}

      {/* Sidebar */}
      <aside className={cn(
        'fixed lg:static inset-y-0 left-0 z-40 w-64 bg-charcoal-700 border-r border-white/[0.06] text-white flex flex-col transition-transform duration-300 lg:translate-x-0',
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      )}>
        <div className="p-6 border-b border-white/[0.06]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gold-gradient rounded-lg flex items-center justify-center shadow-gold">
              <span className="text-charcoal font-heading font-black text-lg">G</span>
            </div>
            <div>
              <h2 className="font-heading text-base font-bold text-gold tracking-wide">GUIDON</h2>
              <p className="text-[10px] uppercase tracking-[0.2em] text-cream/25 font-semibold">Admin Panel</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 py-3">
          {navItems.map((item) => {
            const isActive = pathname === item.href || (item.href !== '/admin' && pathname.startsWith(item.href));
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href} onClick={() => setSidebarOpen(false)}
                className={cn(
                  'flex items-center gap-3 px-6 py-3 text-sm font-medium transition-all duration-200 mx-2 rounded-lg my-0.5',
                  isActive
                    ? 'bg-gold/10 text-gold border-l-2 border-gold'
                    : 'text-cream/40 hover:bg-white/[0.03] hover:text-cream/70'
                )}>
                <Icon className={isActive ? 'text-gold' : ''} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/[0.06]">
          <Link href="/" className="flex items-center gap-2 text-xs text-cream/20 hover:text-cream/40 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to Site
          </Link>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-h-screen">
        <header className="bg-charcoal/80 backdrop-blur-md border-b border-white/[0.06] px-4 lg:px-8 py-4 flex items-center justify-between no-print sticky top-0 z-20">
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden text-cream/40 hover:text-cream p-1 transition-colors">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <div className="hidden lg:block" />
          </div>
          <button onClick={handleLogout} className="btn-ghost text-xs border border-white/10 px-3 py-1.5 rounded-lg">
            Logout
          </button>
        </header>
        <main className="flex-1 p-4 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
