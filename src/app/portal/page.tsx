'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import type { Customer, Order, OrderItem, Invoice, KegLedgerEntry, KegSize, KegBalance, Product, ProductSize, CartItem, KegReturn, RecurringOrder } from '@/lib/types';
import { KEG_DEPOSITS } from '@/lib/types';
import { formatCurrency, formatDate, cn, getStatusColor } from '@/lib/utils';
import { useBodyScrollLock } from '@/lib/use-body-scroll-lock';

const KEG_LABELS: Record<string, string> = {
  '1/2bbl': '1/2 Barrel', '1/4bbl': '1/4 Barrel', '1/6bbl': '1/6 Barrel',
};

const SIZE_SHORT_LEGACY: Record<string, string> = { '1/2bbl': 'Half', '1/4bbl': 'Quarter', '1/6bbl': 'Sixth' };

// Admin-defined custom sizes ("Mixed Case", "1 Barrel", etc.) show the raw
// name; the three legacy kegs show friendly shortnames for density.
function sizeShort(size: KegSize): string {
  return SIZE_SHORT_LEGACY[size] ?? size;
}

// Back-compat alias so existing call sites work — legacy keys hit the lookup
// table, unknown keys fall through to the raw size string.
const SIZE_SHORT = new Proxy({} as Record<string, string>, {
  get: (_t, prop: string) => sizeShort(prop),
});

function balanceColor(n: number): string {
  if (n <= 5) return 'border-emerald-500/30 bg-emerald-500/5';
  if (n <= 10) return 'border-gold/30 bg-gold/5';
  return 'border-red-500/30 bg-red-500/5';
}

function balanceTextColor(n: number): string {
  if (n <= 5) return 'text-emerald-400';
  if (n <= 10) return 'text-gold';
  return 'text-red-400';
}

export default function PortalPage() {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    fetch('/api/portal/login')
      .then((r) => { if (r.ok) return r.json(); return null; })
      .then((data) => { if (data && data.id) setCustomer(data); })
      .catch(() => {})
      .finally(() => setCheckingSession(false));
  }, []);

  const handleLogout = async () => {
    await fetch('/api/portal/login', { method: 'DELETE' });
    setCustomer(null);
  };

  if (checkingSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-charcoal">
        <Image src="/logo.png" alt="Guidon Brewing" width={350} height={194} priority className="h-10 w-auto rounded-xl animate-pulse-slow" />
      </div>
    );
  }

  return customer ? (
    <Dashboard customer={customer} onLogout={handleLogout} />
  ) : (
    <LoginScreen onLogin={setCustomer} />
  );
}

/* ================================================================== */
/*  LOGIN SCREEN                                                      */
/* ================================================================== */

function LoginScreen({ onLogin }: { onLogin: (c: Customer) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!email.trim()) { setError('Please enter your email address.'); return; }
    if (!password) { setError('Please enter your password.'); return; }
    setSubmitting(true);
    try {
      const res = await fetch('/api/portal/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error || 'Login failed.');
        return;
      }
      const customer: Customer = await res.json();
      onLogin(customer);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-charcoal px-4 animate-fade-in">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-3 mb-6">
            <Image src="/logo.png" alt="Guidon Brewing" width={350} height={194} className="h-8 w-auto rounded-lg" />
            <span className="font-heading font-bold text-sm text-cream tracking-wide">GUIDON BREWING</span>
          </Link>
          <h1 className="text-display-sm font-heading text-cream">Sign In</h1>
          <p className="mt-2 text-cream/30 text-sm">Access your wholesale account.</p>
        </div>

        <form onSubmit={handleSubmit} className="card space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-cream/40 mb-1.5">Email</label>
            <input id="email" type="email" autoComplete="username" autoFocus className="input" placeholder="you@example.com"
              value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>

          <div>
            <div className="flex items-baseline justify-between mb-1.5">
              <label htmlFor="password" className="block text-sm font-medium text-cream/40">Password</label>
              <button
                type="button"
                onClick={async () => {
                  const addr = email.trim();
                  if (!addr) {
                    setError('Enter your email above first, then click Forgot password.');
                    return;
                  }
                  setError('');
                  try {
                    await fetch('/api/portal/reset-password', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ email: addr }),
                    });
                    setResetSent(true);
                    window.setTimeout(() => setResetSent(false), 6000);
                  } catch {
                    setError('Could not send reset email. Please try again.');
                  }
                }}
                className="text-xs italic underline-offset-2"
                style={{ color: 'var(--brass)' }}
              >
                Forgot password?
              </button>
            </div>
            <input id="password" type="password" autoComplete="current-password" className="input" placeholder="Enter your password"
              value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>

          {error && <p className="text-sm text-red-400 bg-red-500/10 rounded-xl px-4 py-2.5 border border-red-500/20">{error}</p>}
          {resetSent && (
            <p className="text-sm" style={{ color: 'var(--pine)', background: 'color-mix(in srgb, var(--pine) 8%, transparent)', padding: '8px 12px', borderRadius: '4px', border: '1px solid var(--pine)' }}>
              If an account exists for <strong>{email.trim()}</strong>, a reset email is on the way. Check your inbox.
            </p>
          )}

          <button type="submit" className="btn-primary w-full py-3" disabled={submitting}>
            {submitting ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <p className="text-center mt-6 text-cream/15 text-xs">
          <Link href="/" className="hover:text-cream/30 transition-colors">&larr; Back to Guidon Brewing</Link>
          {' '}&bull;{' '}
          <Link href="/apply" className="hover:text-cream/30 transition-colors">Apply for Account</Link>
        </p>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  DASHBOARD                                                         */
/* ================================================================== */

type Tab = 'overview' | 'products' | 'orders' | 'invoices' | 'settings';

function Dashboard({ customer, onLogout }: { customer: Customer; onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>('overview');
  const [orders, setOrders] = useState<Order[]>([]);
  const [balances, setBalances] = useState<KegBalance | null>(null);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [loadingBalances, setLoadingBalances] = useState(true);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loadingInvoices, setLoadingInvoices] = useState(true);
  const [recurring, setRecurring] = useState<RecurringOrder[]>([]);

  const fetchRecurring = useCallback(() => {
    fetch(`/api/recurring-orders?customerId=${customer.id}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setRecurring(data); })
      .catch(() => { /* ignore */ });
  }, [customer.id]);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [showReturnModal, setShowReturnModal] = useState(false);
  useBodyScrollLock(showReturnModal);

  const fetchInvoices = useCallback(() => {
    setLoadingInvoices(true);
    fetch(`/api/invoices?customerId=${customer.id}`)
      .then((r) => r.json())
      .then((data: Invoice[]) => { setInvoices(Array.isArray(data) ? data : []); setLoadingInvoices(false); })
      .catch(() => setLoadingInvoices(false));
  }, [customer.id]);

  const fetchOrders = useCallback(() => {
    setLoadingOrders(true);
    fetch(`/api/orders?customerId=${customer.id}`)
      .then((r) => r.json())
      .then((data: Order[]) => { setOrders(data); setLoadingOrders(false); })
      .catch(() => setLoadingOrders(false));
  }, [customer.id]);

  const fetchBalances = useCallback(() => {
    setLoadingBalances(true);
    fetch(`/api/keg-ledger?customerId=${customer.id}`)
      .then((r) => r.json())
      .then((entries: KegLedgerEntry[]) => {
        const bal: KegBalance = { '1/2bbl': 0, '1/4bbl': 0, '1/6bbl': 0 };
        entries.forEach((e) => {
          if (e.type === 'deposit') bal[e.size] += e.quantity;
          else if (e.type === 'return') bal[e.size] -= e.quantity;
        });
        (Object.keys(bal) as KegSize[]).forEach((k) => { if (bal[k] < 0) bal[k] = 0; });
        setBalances(bal);
        setLoadingBalances(false);
      })
      .catch(() => setLoadingBalances(false));
  }, [customer.id]);

  useEffect(() => { fetchOrders(); fetchBalances(); fetchInvoices(); fetchRecurring(); }, [fetchOrders, fetchBalances, fetchInvoices, fetchRecurring]);

  const cancelOrder = useCallback(async (orderId: string) => {
    if (!window.confirm('Cancel this order? You can place a new one anytime.')) return;
    try {
      // No authEmail in body — server reads portal_session cookie for auth,
      // which is set by /api/portal/login and can't be spoofed by a client.
      const res = await fetch('/api/portal/cancel-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId }),
      });
      if (res.ok) {
        setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status: 'cancelled' } : o)));
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data?.error || 'Failed to cancel.');
      }
    } catch {
      alert('Failed to cancel.');
    }
  }, []);

  const toggleRecurringActive = useCallback(async (rec: RecurringOrder) => {
    try {
      const res = await fetch('/api/recurring-orders', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: rec.id, active: !rec.active }),
      });
      if (res.ok) {
        const updated = await res.json();
        setRecurring((prev) => prev.map((r) => (r.id === rec.id ? updated : r)));
      }
    } catch { /* ignore */ }
  }, []);

  // Reorder-to-cart. Adds the most recent order's items to the ProductsTab
  // cart and switches to that tab so the user can review, adjust, add
  // returns, pick a delivery date, and checkout. Prevents accidental
  // one-click reorders (the prior implementation placed the order directly,
  // which was dangerous if a customer misclicked).
  const [reorderToast, setReorderToast] = useState<string>('');
  // Seed payload handed to ProductsTab. Bumps a nonce on every reorder
  // click so the child effect can detect re-triggers even if the items
  // array is identical.
  const [reorderSeed, setReorderSeed] = useState<{ nonce: number; items: OrderItem[] } | null>(null);
  // Reorder accepts an optional orderId so the per-row Reorder buttons can
  // seed from any past order, not just the most recent one. Defaults to
  // the latest order when called with no argument (used by the hero
  // "Reorder Last" button).
  const handleReorder = useCallback((orderId?: string) => {
    if (orders.length === 0) return;
    const target = orderId
      ? orders.find((o) => o.id === orderId)
      : [...orders].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
    if (!target) return;
    setReorderSeed({ nonce: Date.now(), items: target.items });
    setTab('products');
    setReorderToast(
      `Added ${target.items.length} item${target.items.length === 1 ? '' : 's'} from ${target.id} to your cart. Review and checkout when ready.`,
    );
    window.setTimeout(() => setReorderToast(''), 5000);
  }, [orders]);

  const totalSpent = useMemo(() => orders.reduce((sum, o) => sum + o.total, 0), [orders]);
  const totalKegsOut = useMemo(() => {
    if (!balances) return 0;
    return balances['1/2bbl'] + balances['1/4bbl'] + balances['1/6bbl'];
  }, [balances]);

  return (
    <div className="min-h-screen bg-charcoal font-body">
      {/* Header — brewery branding first, customer context second */}
      <header className="border-b border-divider">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="flex items-center gap-3">
              <Image src="/logo.png" alt="Guidon Brewing" width={350} height={194} className="h-10 w-auto" />
              <div>
                <h1 className="font-display text-lg sm:text-xl" style={{ fontVariationSettings: "'opsz' 24", color: 'var(--ink)', fontWeight: 500, letterSpacing: '-0.01em' }}>
                  Guidon Brewing
                </h1>
                <p className="section-label">Wholesale Portal</p>
              </div>
            </Link>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{customer.businessName}</p>
              <p className="text-xs italic" style={{ color: 'var(--muted)' }}>Welcome back, {customer.contactName}</p>
            </div>
            <button onClick={onLogout} className="btn-ghost text-xs">
              Log Out
            </button>
          </div>
        </div>
      </header>

      {/* Tab Navigation */}
      <div className="border-b border-white/[0.06]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex gap-1">
          {([
            { key: 'overview', label: 'Overview' },
            { key: 'products', label: 'Browse & Order' },
            { key: 'orders', label: 'Order History' },
            { key: 'invoices', label: 'Invoices' },
            { key: 'settings', label: 'Account' },
          ] as { key: Tab; label: string }[]).map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={cn(
                'px-5 py-3.5 text-sm font-heading font-bold transition-all border-b-2',
                tab === t.key
                  ? 'text-gold border-gold'
                  : 'text-cream/25 border-transparent hover:text-cream/40'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Reorder toast */}
      {reorderToast && (
        <div className="toast">
          <span>{reorderToast}</span>
        </div>
      )}

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {tab === 'overview' && (
          <OverviewTab
            balances={balances}
            loadingBalances={loadingBalances}
            orders={orders}
            loadingOrders={loadingOrders}
            expandedOrderId={expandedOrderId}
            setExpandedOrderId={setExpandedOrderId}
            onShowReturn={() => setShowReturnModal(true)}
            onSwitchTab={setTab}
            totalSpent={totalSpent}
            totalKegsOut={totalKegsOut}
            onReorder={handleReorder}
          />
        )}
        {tab === 'products' && (
          <ProductsTab
            customerId={customer.id}
            onOrderPlaced={() => { fetchOrders(); fetchBalances(); setTab('orders'); }}
            seedCart={reorderSeed}
            onSeedConsumed={() => setReorderSeed(null)}
            balances={balances}
          />
        )}
        {tab === 'orders' && (
          <OrdersTab
            orders={orders}
            loadingOrders={loadingOrders}
            expandedOrderId={expandedOrderId}
            setExpandedOrderId={setExpandedOrderId}
            onReorder={handleReorder}
            onCancel={cancelOrder}
            recurring={recurring}
            onToggleRecurring={toggleRecurringActive}
          />
        )}
        {tab === 'invoices' && (
          <InvoicesTab invoices={invoices} loading={loadingInvoices} customer={customer} />
        )}
        {tab === 'settings' && (
          <SettingsTab customer={customer} onLogout={onLogout} />
        )}
      </main>

      {showReturnModal && (
        <KegReturnModal customerId={customer.id}
          onClose={() => setShowReturnModal(false)}
          onSuccess={() => { setShowReturnModal(false); fetchBalances(); }} />
      )}
    </div>
  );
}

/* ================================================================== */
/*  OVERVIEW TAB                                                      */
/* ================================================================== */

function OverviewTab({
  balances, loadingBalances, orders, loadingOrders, expandedOrderId, setExpandedOrderId, onShowReturn, onSwitchTab, totalSpent, totalKegsOut, onReorder,
}: {
  balances: KegBalance | null;
  loadingBalances: boolean;
  orders: Order[];
  loadingOrders: boolean;
  expandedOrderId: string | null;
  setExpandedOrderId: (id: string | null) => void;
  onShowReturn: () => void;
  onSwitchTab: (tab: Tab) => void;
  totalSpent: number;
  totalKegsOut: number;
  onReorder: (orderId?: string) => void;
}) {
  const recentOrders = orders.slice(0, 5);

  return (
    <div className="space-y-8">
      {/* Quick stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="card">
          <span className="section-label">Total Orders</span>
          <p className="text-2xl font-heading font-black text-cream mt-1">{orders.length}</p>
        </div>
        <div className="card">
          <span className="section-label">Total Spent</span>
          <p className="text-2xl font-heading font-black text-gold mt-1">{formatCurrency(totalSpent)}</p>
        </div>
        <div className="card">
          <span className="section-label">Kegs Outstanding</span>
          <p className={cn('text-2xl font-heading font-black mt-1', totalKegsOut > 10 ? 'text-red-400' : totalKegsOut > 5 ? 'text-gold' : 'text-emerald-400')}>
            {totalKegsOut}
          </p>
        </div>
        <div className="card">
          <span className="section-label">Last Order</span>
          <p className="text-2xl font-heading font-black text-cream mt-1">
            {orders.length > 0 ? formatDate(orders[0].createdAt) : 'N/A'}
          </p>
        </div>
      </div>

      {/* Keg Balances */}
      <section>
        <span className="section-label mb-4 block">Keg Balances</span>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {loadingBalances
            ? (['1/2bbl', '1/4bbl', '1/6bbl'] as KegSize[]).map((size) => (
                <div key={size} className="card"><div className="skeleton h-4 w-24 mb-3" /><div className="skeleton h-10 w-16" /></div>
              ))
            : balances && (['1/2bbl', '1/4bbl', '1/6bbl'] as KegSize[]).map((size, idx) => (
                <div key={size}
                  className={cn('rounded-2xl border-2 p-5 animate-slide-up transition-all', balanceColor(balances[size]))}
                  style={{ animationDelay: `${idx * 80}ms` }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-heading font-bold text-cream/50">{KEG_LABELS[size]}</p>
                    <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-heading font-black', balanceColor(balances[size]), balanceTextColor(balances[size]))}>
                      {SIZE_SHORT[size][0]}
                    </div>
                  </div>
                  <p className={cn('text-3xl font-heading font-black', balanceTextColor(balances[size]))}>{balances[size]}</p>
                  <p className="text-xs text-cream/25 mt-1">
                    {balances[size] === 0 ? 'All returned' : `${balances[size]} outstanding`}
                  </p>
                </div>
              ))
          }
        </div>
      </section>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-3">
        <button onClick={() => onSwitchTab('products')} className="btn-primary py-3 px-6">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4" /></svg>
          Browse &amp; Order
        </button>
        <button onClick={onShowReturn} className="btn-secondary py-3 px-6">
          Request Keg Return
        </button>
        {orders.length > 0 && (
          <button onClick={() => onReorder()} className="btn-outline py-3 px-6">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
            Reorder Last
          </button>
        )}
      </div>

      {/* Recent Orders */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <span className="section-label">Recent Orders</span>
          {orders.length > 5 && (
            <button onClick={() => onSwitchTab('orders')} className="text-xs font-heading font-bold text-gold/60 hover:text-gold transition-colors">
              View all &rarr;
            </button>
          )}
        </div>

        {loadingOrders ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => <div key={i} className="skeleton h-14 w-full rounded-xl" />)}
          </div>
        ) : recentOrders.length === 0 ? (
          <div className="card text-center text-cream/25 py-10">
            <p>No orders yet. Browse our products to place your first order.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {recentOrders.map((order) => (
              <div key={order.id}
                onClick={() => setExpandedOrderId(expandedOrderId === order.id ? null : order.id)}
                className="card-interactive cursor-pointer p-4"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-heading font-bold text-cream">{order.id}</span>
                    <span className="text-xs text-cream/20">{formatDate(order.createdAt)}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={cn('badge-sm', getStatusColor(order.status))}>{order.status}</span>
                    <span className="text-sm font-heading font-bold text-cream">{formatCurrency(order.total)}</span>
                  </div>
                </div>
                <p className="text-xs text-cream/20 mt-1 truncate">{order.items.map((i) => i.productName).join(', ')}</p>
                {expandedOrderId === order.id && (
                  <div className="mt-3 pt-3 border-t border-white/[0.04] animate-fade-in">
                    <OrderDetail order={order} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/* ================================================================== */
/*  PRODUCTS TAB (Browse & Order)                                     */
/* ================================================================== */

const KEG_SIZES: KegSize[] = ['1/2bbl', '1/4bbl', '1/6bbl'];

const BEER_COLORS: Record<string, string> = {
  'Ale': 'from-amber-600/30 to-amber-800/20',
  'Stout': 'from-stone-700/40 to-stone-900/30',
  'IPA': 'from-orange-500/25 to-amber-700/20',
  'Wheat': 'from-yellow-500/25 to-amber-600/15',
  'Porter': 'from-stone-600/35 to-stone-800/25',
  'Lager': 'from-yellow-400/20 to-amber-500/15',
};

function ProductsTab({
  customerId,
  onOrderPlaced,
  seedCart,
  onSeedConsumed,
  balances,
}: {
  customerId: string;
  onOrderPlaced: () => void;
  seedCart?: { nonce: number; items: OrderItem[] } | null;
  onSeedConsumed?: () => void;
  balances?: KegBalance | null;
}) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sizeFilter, setSizeFilter] = useState<string>('All');
  const [categoryFilter, setCategoryFilter] = useState<string>('All');
  // Cart persists per-customer in localStorage so closing the tab + returning
  // doesn't wipe a half-built order. Scoped by customerId to avoid leaking
  // between accounts on shared devices. Initialized lazily via a function so
  // we only hit localStorage once on mount.
  const cartStorageKey = `guidon_cart_${customerId}`;
  const [cart, setCart] = useState<CartItem[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const raw = window.localStorage.getItem(cartStorageKey);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  });
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      if (cart.length === 0) window.localStorage.removeItem(cartStorageKey);
      else window.localStorage.setItem(cartStorageKey, JSON.stringify(cart));
    } catch { /* storage full, ignore */ }
  }, [cart, cartStorageKey]);
  const [kegReturns, setKegReturns] = useState<KegReturn[]>([]);
  const [selections, setSelections] = useState<Record<string, { size: KegSize; quantity: number }>>({});
  const [showCheckout, setShowCheckout] = useState(false);
  useBodyScrollLock(showCheckout);
  const [templates, setTemplates] = useState<Array<{ id: string; name: string; items: OrderItem[]; createdAt: string }>>([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  useBodyScrollLock(showSaveTemplate);
  const [templateName, setTemplateName] = useState('');
  const [savingTemplate, setSavingTemplate] = useState(false);

  const refreshTemplates = useCallback(async () => {
    try {
      const res = await fetch(`/api/order-templates?customerId=${customerId}`, { cache: 'no-store' });
      const data = await res.json();
      if (Array.isArray(data)) setTemplates(data);
    } catch { /* non-fatal */ }
    finally { setTemplatesLoading(false); }
  }, [customerId]);
  useEffect(() => { refreshTemplates(); }, [refreshTemplates]);

  const saveTemplate = useCallback(async () => {
    const name = templateName.trim();
    if (!name || cart.length === 0) return;
    setSavingTemplate(true);
    try {
      const res = await fetch('/api/order-templates', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId,
          name,
          items: cart.map((c) => ({ productId: c.productId, productName: c.productName, size: c.size, quantity: c.quantity, unitPrice: c.unitPrice, deposit: c.deposit })),
        }),
      });
      if (res.ok) {
        setShowSaveTemplate(false);
        setTemplateName('');
        setToastMsg(`Saved template "${name}". Load it next time from the Templates section.`);
        await refreshTemplates();
      } else {
        const data = await res.json().catch(() => ({}));
        setToastMsg(data?.error || 'Failed to save template.');
      }
    } catch { setToastMsg('Failed to save template.'); }
    finally { setSavingTemplate(false); }
  }, [cart, customerId, templateName, refreshTemplates]);

  const loadTemplate = useCallback((t: { name: string; items: OrderItem[] }) => {
    setCart((prev) => {
      const next = [...prev];
      for (const item of t.items) {
        const existing = next.find((c) => c.productId === item.productId && c.size === item.size);
        if (existing) existing.quantity += item.quantity;
        else next.push({ productId: item.productId, productName: item.productName, size: item.size, quantity: item.quantity, unitPrice: item.unitPrice, deposit: item.deposit });
      }
      return next;
    });
    setToastMsg(`Added items from "${t.name}" to your cart.`);
  }, []);

  const deleteTemplate = useCallback(async (id: string) => {
    try {
      const res = await fetch('/api/order-templates', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (res.ok) await refreshTemplates();
    } catch { /* ignore */ }
  }, [refreshTemplates]);
  const [deliveryDate, setDeliveryDate] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [toastMsg, setToastMsg] = useState('');

  // Delivery schedule from admin settings. Used to build the list of valid
  // delivery slots instead of a free-form date input. Falls back to Tue/Thu
  // with a 2-day lead time if the fetch fails so checkout never locks up.
  const [deliveryDays, setDeliveryDays] = useState<number[]>([2, 4]);
  const [deliveryLeadDays, setDeliveryLeadDays] = useState<number>(2);
  useEffect(() => {
    fetch('/api/delivery-schedule', { cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data?.deliveryDays) && data.deliveryDays.length > 0) setDeliveryDays(data.deliveryDays);
        if (typeof data?.deliveryLeadDays === 'number') setDeliveryLeadDays(data.deliveryLeadDays);
      })
      .catch(() => { /* keep defaults */ });
  }, []);
  // Compute up to the next 6 valid delivery dates based on schedule.
  const deliverySlots = useMemo(() => {
    const slots: string[] = [];
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() + Math.max(0, deliveryLeadDays));
    for (let i = 0; i < 60 && slots.length < 6; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      if (deliveryDays.includes(d.getDay())) {
        slots.push(d.toISOString().slice(0, 10));
      }
    }
    return slots;
  }, [deliveryDays, deliveryLeadDays]);

  // Consume reorder seed: merge the seeded items into the cart.
  // Keyed by nonce so repeated reorders trigger even if the items array
  // is reference-identical.
  useEffect(() => {
    if (!seedCart) return;
    setCart((prev) => {
      const next = [...prev];
      for (const item of seedCart.items) {
        const existing = next.find((c) => c.productId === item.productId && c.size === item.size);
        if (existing) {
          existing.quantity += item.quantity;
        } else {
          next.push({
            productId: item.productId,
            productName: item.productName,
            size: item.size,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            deposit: item.deposit,
          });
        }
      }
      return next;
    });
    onSeedConsumed?.();
  }, [seedCart?.nonce]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetch('/api/products', { cache: 'no-store' })
      .then((r) => r.json())
      .then((data: Product[]) => { setProducts(data.filter((p) => p.available)); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const categories = useMemo(() => {
    const cats = new Set(products.map((p) => p.category));
    return ['All', ...Array.from(cats).sort()];
  }, [products]);

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchesSearch = !search ||
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.style.toLowerCase().includes(search.toLowerCase());
      const matchesSize = sizeFilter === 'All' || p.sizes.some((s) => s.size === sizeFilter);
      const matchesCategory = categoryFilter === 'All' || p.category === categoryFilter;
      return matchesSearch && matchesSize && matchesCategory;
    });
  }, [products, search, sizeFilter, categoryFilter]);

  const subtotal = useMemo(() => cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0), [cart]);
  const depositFromItems = useMemo(() => cart.reduce((sum, item) => sum + item.deposit * item.quantity, 0), [cart]);
  const depositFromReturns = useMemo(() => kegReturns.reduce((sum, ret) => sum + KEG_DEPOSITS[ret.size] * ret.quantity, 0), [kegReturns]);
  const totalDeposit = depositFromItems - depositFromReturns;
  const total = subtotal + totalDeposit;
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  const getSelection = useCallback((productId: string, sizes: ProductSize[]) => {
    return selections[productId] || { size: sizes[0]?.size || '1/2bbl', quantity: 1 };
  }, [selections]);

  const updateSelection = (productId: string, field: 'size' | 'quantity', value: string | number) => {
    setSelections((prev) => {
      const existing = prev[productId] || { size: '1/2bbl' as KegSize, quantity: 1 };
      return { ...prev, [productId]: { ...existing, [field]: value } };
    });
  };

  const addToCart = (product: Product) => {
    const sel = getSelection(product.id, product.sizes);
    const sizeInfo = product.sizes.find((s) => s.size === sel.size);
    if (!sizeInfo || sel.quantity < 1) return;
    setCart((prev) => {
      const existingIdx = prev.findIndex((item) => item.productId === product.id && item.size === sel.size);
      if (existingIdx >= 0) {
        const updated = [...prev];
        updated[existingIdx] = { ...updated[existingIdx], quantity: updated[existingIdx].quantity + sel.quantity };
        return updated;
      }
      return [...prev, {
        productId: product.id, productName: product.name, size: sel.size,
        quantity: sel.quantity, unitPrice: sizeInfo.price, deposit: sizeInfo.deposit,
      }];
    });
    setSelections((prev) => ({ ...prev, [product.id]: { ...sel, quantity: 1 } }));
    setToastMsg(`${product.name} added to cart`);
  };

  const removeFromCart = (index: number) => setCart((prev) => prev.filter((_, i) => i !== index));
  const updateCartQty = (index: number, qty: number) => {
    if (qty < 1) return;
    setCart((prev) => prev.map((item, i) => (i === index ? { ...item, quantity: qty } : item)));
  };

  const addKegReturn = (size: KegSize) => {
    setKegReturns((prev) => {
      const existing = prev.find((r) => r.size === size);
      if (existing) return prev.map((r) => r.size === size ? { ...r, quantity: r.quantity + 1 } : r);
      return [...prev, { size, quantity: 1 }];
    });
  };

  const removeReturn = (size: KegSize) => setKegReturns((prev) => prev.filter((r) => r.size !== size));
  const updateReturnQty = (size: KegSize, qty: number) => {
    if (qty < 1) { removeReturn(size); return; }
    setKegReturns((prev) => prev.map((r) => (r.size === size ? { ...r, quantity: qty } : r)));
  };

  const minDate = new Date();
  minDate.setDate(minDate.getDate() + 1);
  const minDateStr = minDate.toISOString().split('T')[0];

  // Next Thursday/Friday (in local time). Customer doesn't pick a date —
  // we auto-schedule to the next delivery slot. If the cron job needs
  // admin-configurable days later, this can read from /api/delivery-schedule;
  // for now Guidon delivers Thu + Fri so we hardcode.
  const nextDeliveryDate = (): string => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    // Start looking tomorrow (min 1 day lead time).
    d.setDate(d.getDate() + 1);
    for (let i = 0; i < 14; i++) {
      const day = d.getDay();
      if (day === 4 || day === 5) return d.toISOString().slice(0, 10);
      d.setDate(d.getDate() + 1);
    }
    return d.toISOString().slice(0, 10); // fallback
  };

  const handleSubmitOrder = async () => {
    setSubmitError('');
    setSubmitting(true);
    try {
      const autoDate = deliveryDate || nextDeliveryDate();
      const items = cart.map((item) => ({
        productId: item.productId, productName: item.productName, size: item.size,
        quantity: item.quantity, unitPrice: item.unitPrice, deposit: item.deposit,
      }));
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId, items, kegReturns, subtotal, totalDeposit, total, deliveryDate: autoDate, notes }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || `Failed to place order (HTTP ${res.status})`);
      }
      setCart([]); setKegReturns([]); setShowCheckout(false); setDeliveryDate(''); setNotes('');
      onOrderPlaced();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="animate-fade-in">
      {/* Toast */}
      {toastMsg && <Toast message={toastMsg} onClose={() => setToastMsg('')} />}

      <div className="flex items-center justify-between mb-8">
        <div>
          <span className="section-label mb-1 block">Craft Beer Catalog</span>
          <h2 className="font-display text-4xl md:text-5xl" style={{ fontVariationSettings: "'opsz' 72", color: 'var(--ink)', fontWeight: 500 }}>
            Browse Products
          </h2>
        </div>
        <div className="flex items-center gap-2">
          {cartCount > 0 && (
            <button onClick={() => setShowSaveTemplate(true)} className="btn-secondary text-sm" title="Save current cart as a reusable template">
              Save as Template
            </button>
          )}
          {cartCount > 0 && (
            <button onClick={() => setShowCheckout(true)} className="btn-primary">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4" />
              </svg>
              Review Cart &middot; {cartCount} &middot; {formatCurrency(total)}
            </button>
          )}
        </div>
      </div>

      {/* Templates shelf — one-click reload of saved carts. Hidden when
          the customer has never saved one (so first-time users don't see
          an empty shelf). */}
      {!templatesLoading && templates.length > 0 && (
        <div className="mb-8 card p-4">
          <div className="flex items-baseline justify-between mb-3">
            <span className="section-label">Your Templates</span>
            <span className="text-xs italic" style={{ color: 'var(--muted)' }}>
              Click to add all items to cart
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {templates.map((t) => (
              <div key={t.id} className="flex items-center gap-1 bg-charcoal-200 border border-white/[0.06] rounded-full pl-3 pr-1 py-1 text-sm">
                <button
                  onClick={() => loadTemplate(t)}
                  className="font-semibold hover:underline"
                  style={{ color: 'var(--brass)' }}
                  title={`${t.items.length} items, saved ${formatDate(t.createdAt)}`}
                >
                  {t.name}
                  <span className="ml-2 text-xs text-cream/40 font-normal">({t.items.length})</span>
                </button>
                <button
                  onClick={() => deleteTemplate(t.id)}
                  className="ml-1 w-5 h-5 rounded-full text-cream/30 hover:text-red-400 hover:bg-red-500/10 flex items-center justify-center text-xs leading-none"
                  title="Delete template"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="mb-8 space-y-3">
        <div className="relative max-w-md">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: 'var(--muted)' }}>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input type="text" placeholder="Search beers..." value={search}
            onChange={(e) => setSearch(e.target.value)} className="input pl-10" />
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          {categories.length > 2 && categories.map((c) => (
            <button key={c} onClick={() => setCategoryFilter(c)}
              className="px-4 py-1.5 text-xs font-semibold font-ui border transition-colors"
              style={{
                borderRadius: '3px',
                borderColor: categoryFilter === c ? 'var(--brass-dim)' : 'var(--divider)',
                background: categoryFilter === c ? 'var(--brass)' : 'transparent',
                color: categoryFilter === c ? 'var(--paper)' : 'var(--ink)',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
              }}>
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Product Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card"><div className="skeleton h-5 w-3/4 mb-3" /><div className="skeleton h-3 w-1/2 mb-4" /><div className="skeleton h-12 w-full" /></div>
          ))}
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="text-center py-16" style={{ color: 'var(--muted)' }}>
          <p className="text-base mb-4 italic">No products found.</p>
          <button onClick={() => { setSearch(''); setSizeFilter('All'); setCategoryFilter('All'); }} className="btn-ghost text-sm">Clear Filters</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredProducts.map((product) => {
            const sel = getSelection(product.id, product.sizes);
            const currentSizeInfo = product.sizes.find((s) => s.size === sel.size);
            const stockForSize = currentSizeInfo?.inventoryCount ?? 0;
            const isOutOfStock = stockForSize === 0;
            const isLowStock = stockForSize > 0 && stockForSize < 3;
            return (
              <article key={product.id} className="card-product flex flex-col">
                {/* Product image — rendered only if the admin supplied an
                    imageUrl. Letterpress overlay preserves the serif aesthetic
                    so photos don't feel shoehorned into SaaS-land. */}
                {product.imageUrl && (
                  <div
                    className="w-full h-40 bg-charcoal-200 overflow-hidden relative"
                    style={{ borderBottom: '1px solid var(--divider)' }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={product.imageUrl}
                      alt={product.name}
                      className="w-full h-full object-cover"
                      loading="lazy"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  </div>
                )}
                {/* Typographic label header — matches /order catalog */}
                <header className="px-5 pt-5 pb-4 border-b border-divider">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <span className="section-label">{product.style}</span>
                    <div className="flex gap-1.5 shrink-0">
                      {product.newRelease && (
                        <span className="badge-sm" style={{ color: 'var(--brass)', borderColor: 'var(--brass)' }}>
                          New
                        </span>
                      )}
                      {product.limitedRelease && (
                        <span className="badge-sm" style={{ color: 'var(--ruby)', borderColor: 'var(--ruby)' }}>
                          Limited
                        </span>
                      )}
                    </div>
                  </div>
                  <h3
                    className="font-display leading-tight"
                    style={{
                      fontSize: product.name.length > 20 ? '1.25rem' : '1.5rem',
                      fontVariationSettings: "'opsz' 32",
                      color: 'var(--ink)',
                      fontWeight: 500,
                    }}
                  >
                    {product.name}
                  </h3>
                  <div className="flex items-baseline gap-3 mt-2 text-sm">
                    <span className="font-variant-tabular font-semibold" style={{ color: 'var(--brass)' }}>
                      {product.abv}% ABV
                    </span>
                    {product.ibu != null && (
                      <span className="font-variant-tabular" style={{ color: 'var(--muted)' }}>
                        {product.ibu} IBU
                      </span>
                    )}
                    {isOutOfStock ? (
                      <span className="ml-auto section-label" style={{ color: 'var(--ruby)' }}>Out</span>
                    ) : isLowStock ? (
                      <span className="ml-auto section-label" style={{ color: 'var(--ember)' }}>{stockForSize} left</span>
                    ) : (
                      <span className="ml-auto section-label" style={{ color: 'var(--pine)' }}>In Stock</span>
                    )}
                  </div>
                  {product.awards && product.awards.length > 0 && (
                    <ul className="mt-3 text-xs italic" style={{ color: 'var(--olive)', fontFamily: "'Source Serif 4', serif" }}>
                      {product.awards.slice(0, 2).map((award) => (
                        <li key={award}>&#9670; {award}</li>
                      ))}
                    </ul>
                  )}
                </header>
                {/* Content */}
                <div className="p-5 flex flex-col flex-1">
                  <p className="text-sm mb-4 line-clamp-3 leading-relaxed flex-1" style={{ color: 'var(--muted)' }}>
                    {product.description}
                  </p>
                  {currentSizeInfo && (
                    <div className="mb-4 pb-3 border-b border-divider flex items-baseline gap-2">
                      <span className="font-display font-variant-tabular" style={{ fontSize: '1.375rem', color: 'var(--ink)', fontVariationSettings: "'opsz' 24", fontWeight: 500 }}>
                        {formatCurrency(currentSizeInfo.price)}
                      </span>
                      <span className="text-xs" style={{ color: 'var(--muted)' }}>per keg</span>
                      <span className="text-xs ml-auto font-variant-tabular" style={{ color: 'var(--muted)' }}>
                        +{formatCurrency(currentSizeInfo.deposit)} dep.
                      </span>
                    </div>
                  )}
                  {/* Size selector — 3-slot row. Unavailable sizes stay
                      visible but disabled with native tooltip + strike-
                      through, per admin-side availability flag. */}
                  <div className="flex gap-0 mb-3 border border-divider" style={{ borderRadius: '3px', overflow: 'hidden' }}>
                    {[...product.sizes]
                      .sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999))
                      .map((sizeData) => {
                        const kegSize = sizeData.size;
                        const offered = sizeData.available !== false;
                        const existsButUnavailable = sizeData.available === false;
                        const title = existsButUnavailable
                          ? `Not currently offered for ${product.name}`
                          : undefined;
                        return (
                          <button
                            key={kegSize}
                            onClick={() => offered && updateSelection(product.id, 'size', kegSize)}
                            disabled={!offered}
                            title={title}
                            className="flex-1 py-1.5 text-xs font-semibold font-ui transition-colors"
                            style={{
                              background: sel.size === kegSize && offered ? 'var(--brass)' : 'transparent',
                              color: sel.size === kegSize && offered ? 'var(--paper)' : !offered ? 'var(--faint)' : 'var(--ink)',
                              cursor: offered ? 'pointer' : 'not-allowed',
                              opacity: offered ? 1 : 0.4,
                              textDecoration: existsButUnavailable ? 'line-through' : 'none',
                            }}
                          >
                            {sizeShort(kegSize)}
                          </button>
                        );
                      })}
                  </div>
                  <div className="flex gap-2 items-stretch">
                    <div className="flex items-center border border-divider" style={{ borderRadius: '3px', overflow: 'hidden' }}>
                      <button onClick={() => updateSelection(product.id, 'quantity', Math.max(1, sel.quantity - 1))}
                        className="px-3 py-2" style={{ color: 'var(--muted)' }}>
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeWidth={2} d="M20 12H4" /></svg>
                      </button>
                      <span className="px-3 py-2 text-sm font-semibold font-variant-tabular min-w-[2.5rem] text-center" style={{ color: 'var(--ink)' }}>
                        {sel.quantity}
                      </span>
                      <button onClick={() => updateSelection(product.id, 'quantity', sel.quantity + 1)}
                        className="px-3 py-2" style={{ color: 'var(--muted)' }}>
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                      </button>
                    </div>
                    <button onClick={() => addToCart(product)} className="btn-primary flex-1" disabled={isOutOfStock}>
                      {isOutOfStock ? 'Out of Stock' : 'Add to Cart'}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Checkout Modal */}
      {showSaveTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in" onClick={() => setShowSaveTemplate(false)} />
          <div className="relative bg-charcoal-100 border border-white/[0.08] rounded-2xl w-full max-w-md p-6 space-y-5 animate-scale-in">
            <h3 className="text-lg font-heading font-bold text-cream">Save cart as template</h3>
            <p className="text-xs text-cream/40 italic">
              Give this a name you&rsquo;ll recognize. Next time, one click adds these {cartCount} item{cartCount === 1 ? '' : 's'} to your cart &mdash; delivery date + notes still fresh each time.
            </p>
            <input
              type="text"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder="e.g. Tuesday Regular, Weekly Kegs"
              className="input w-full"
              autoFocus
            />
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setShowSaveTemplate(false)} className="btn-secondary px-4 py-2">Cancel</button>
              <button onClick={saveTemplate} disabled={savingTemplate || !templateName.trim()} className="btn-primary">
                {savingTemplate ? 'Saving...' : 'Save Template'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showCheckout && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in" onClick={() => setShowCheckout(false)} />
          <div className="relative bg-charcoal-100 rounded-2xl border border-white/[0.08] w-full max-w-lg max-h-[90vh] overflow-y-auto animate-scale-in">
            <div className="px-6 py-5 border-b border-white/[0.06]">
              <h3 className="font-heading text-xl font-bold text-cream">Review &amp; Place Order</h3>
              <p className="text-sm text-cream/25 mt-1">{cart.length} item{cart.length !== 1 ? 's' : ''}</p>
            </div>

            <div className="px-6 py-5 space-y-5">
              {/* Cart Items */}
              <div className="space-y-2">
                {cart.map((item, idx) => (
                  <div key={`${item.productId}-${item.size}`} className="flex items-center gap-3 p-3 rounded-xl bg-charcoal-200">
                    <div className="flex-1 min-w-0">
                      <p className="font-heading font-bold text-cream text-sm truncate">{item.productName}</p>
                      <p className="text-xs text-cream/25">{SIZE_SHORT[item.size]} &middot; {formatCurrency(item.unitPrice)}</p>
                    </div>
                    <div className="flex items-center border border-white/[0.08] rounded-lg overflow-hidden">
                      <button onClick={() => updateCartQty(idx, item.quantity - 1)} className="px-2 py-1 text-cream/30 hover:text-cream text-xs">-</button>
                      <span className="px-2 py-1 text-xs font-bold text-cream bg-charcoal-300 min-w-[1.8rem] text-center">{item.quantity}</span>
                      <button onClick={() => updateCartQty(idx, item.quantity + 1)} className="px-2 py-1 text-cream/30 hover:text-cream text-xs">+</button>
                    </div>
                    <button onClick={() => removeFromCart(idx)} className="p-1 text-cream/15 hover:text-red-400" aria-label="Remove">
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                ))}
              </div>

              {/* Keg Returns — rows are derived from the customer's
                  outstanding-keg balance (each size they actually have
                  out). Falls back to the legacy 3 sizes if they have no
                  outstanding kegs yet. */}
              <div>
                <span className="section-label mb-2 block">Keg Returns</span>
                <p className="text-xs text-cream/35 mb-2">Enter how many empty kegs you&rsquo;re returning this delivery (0 if none).</p>
                <div className="space-y-2">
                  {(() => {
                    const outstandingSizes = balances
                      ? Object.entries(balances).filter(([, n]) => (n as number) > 0).map(([k]) => k)
                      : [];
                    const sizesToRender = outstandingSizes.length > 0
                      ? outstandingSizes
                      : ['1/2bbl', '1/4bbl', '1/6bbl'];
                    return sizesToRender;
                  })().map((size) => {
                    const existing = kegReturns.find((r) => r.size === size);
                    const qty = existing?.quantity ?? 0;
                    const setQty = (n: number) => {
                      if (n <= 0) {
                        setKegReturns((prev) => prev.filter((r) => r.size !== size));
                      } else if (existing) {
                        updateReturnQty(size, n);
                      } else {
                        setKegReturns((prev) => [...prev, { size, quantity: n }]);
                      }
                    };
                    return (
                      <div key={size} className="flex items-center gap-3">
                        <span className="text-sm text-cream/60 flex-1">
                          {SIZE_SHORT[size]}{' '}
                          <span className="text-xs text-emerald-400/60">(-{formatCurrency(KEG_DEPOSITS[size])}/ea)</span>
                        </span>
                        <div className="flex items-center border border-white/[0.08] rounded-lg overflow-hidden">
                          <button type="button" onClick={() => setQty(qty - 1)} disabled={qty === 0} className="px-2 py-1 text-cream/30 hover:text-cream text-xs disabled:opacity-30">-</button>
                          <span className="px-2 py-1 text-xs font-bold text-cream bg-charcoal-300 min-w-[1.8rem] text-center">{qty}</span>
                          <button type="button" onClick={() => setQty(qty + 1)} className="px-2 py-1 text-cream/30 hover:text-cream text-xs">+</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Delivery — auto-assigned to the next Thursday or Friday.
                  Customer doesn't pick a date. They just see the info note. */}
              <div>
                <span className="section-label mb-2 block">Delivery</span>
                <div
                  className="text-sm p-3 rounded-lg border"
                  style={{ borderColor: 'var(--divider)', background: 'color-mix(in srgb, var(--brass) 4%, transparent)' }}
                >
                  <p style={{ color: 'var(--ink)' }}>
                    Guidon Brewing delivers on <strong>Thursdays and Fridays</strong>.
                  </p>
                  <p className="text-xs italic mt-1" style={{ color: 'var(--muted)' }}>
                    We&rsquo;ll schedule your order for the next available delivery day and email you confirmation.
                  </p>
                </div>
                {false && (
                  <div className="flex flex-wrap gap-2">
                    {deliverySlots.map((iso) => {
                      const on = deliveryDate === iso;
                      const d = new Date(iso);
                      const label = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
                      return (
                        <button
                          key={iso}
                          type="button"
                          onClick={() => setDeliveryDate(iso)}
                          className="px-3 py-2 text-xs font-semibold font-ui border transition-colors"
                          style={{
                            borderRadius: '3px',
                            borderColor: on ? 'var(--brass-dim)' : 'var(--divider)',
                            background: on ? 'var(--brass)' : 'transparent',
                            color: on ? 'var(--paper)' : 'var(--ink)',
                            textTransform: 'uppercase',
                            letterSpacing: '0.04em',
                          }}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div>
                <span className="section-label mb-2 block">Order Notes</span>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
                  placeholder="Special instructions..." rows={2} className="input resize-none" />
              </div>

              {/* Summary */}
              <div className="bg-charcoal-200 border border-white/[0.06] rounded-xl p-4 space-y-1.5">
                <div className="flex justify-between text-sm"><span className="text-cream/30">Subtotal</span><span className="text-cream/60">{formatCurrency(subtotal)}</span></div>
                <div className="flex justify-between text-sm"><span className="text-cream/30">Keg Deposits</span><span className="text-cream/60">{formatCurrency(depositFromItems)}</span></div>
                {depositFromReturns > 0 && (
                  <div className="flex justify-between text-sm"><span className="text-emerald-400/60">Return Credits</span><span className="text-emerald-400">-{formatCurrency(depositFromReturns)}</span></div>
                )}
                <div className="flex justify-between font-heading font-bold text-cream pt-2 border-t border-white/[0.06]">
                  <span>Total Due on Delivery</span><span className="text-gold">{formatCurrency(total)}</span>
                </div>
              </div>

              {submitError && <p className="text-red-400 text-sm bg-red-500/10 rounded-xl px-4 py-2.5 border border-red-500/20">{submitError}</p>}
            </div>

            <div className="px-6 py-4 border-t border-white/[0.06] flex gap-3">
              <button onClick={() => setShowCheckout(false)} className="btn-secondary flex-1 text-center">Back</button>
              <button onClick={handleSubmitOrder} disabled={submitting || cart.length === 0}
                className={cn('btn-primary flex-1', submitting && 'opacity-60 cursor-not-allowed')}>
                {submitting ? 'Placing Order...' : 'Place Order'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ================================================================== */
/*  TOAST                                                             */
/* ================================================================== */

function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 2500);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div className="toast">
      <svg className="w-5 h-5 text-emerald-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>
      <span>{message}</span>
    </div>
  );
}

/* ================================================================== */
/*  ORDERS TAB                                                        */
/* ================================================================== */

function OrdersTab({
  orders, loadingOrders, expandedOrderId, setExpandedOrderId, onReorder, onCancel,
  recurring, onToggleRecurring,
}: {
  orders: Order[];
  loadingOrders: boolean;
  expandedOrderId: string | null;
  setExpandedOrderId: (id: string | null) => void;
  onReorder: (orderId?: string) => void;
  onCancel: (orderId: string) => void;
  recurring: RecurringOrder[];
  onToggleRecurring: (r: RecurringOrder) => void;
}) {
  return (
    <div className="animate-fade-in space-y-8">
      {recurring.length > 0 && (
        <div>
          <span className="section-label mb-3 block">Your Recurring Orders</span>
          <div className="space-y-2">
            {recurring.map((r) => (
              <div key={r.id} className="card p-4 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <p className="font-heading font-bold text-cream text-sm">
                    {r.name}
                    {!r.active && (
                      <span className="ml-2 text-xs font-normal italic text-cream/30">(paused)</span>
                    )}
                  </p>
                  <p className="text-xs text-cream/30 mt-0.5">
                    Every {r.intervalDays} days &middot; {r.items.length} item{r.items.length === 1 ? '' : 's'}
                    {r.active && <> &middot; next delivery {formatDate(r.nextRunAt)}</>}
                  </p>
                </div>
                <button
                  onClick={() => onToggleRecurring(r)}
                  className="text-xs font-heading font-bold text-gold/60 hover:text-gold px-3 py-1 rounded-lg hover:bg-gold/10"
                >
                  {r.active ? 'Pause' : 'Resume'}
                </button>
              </div>
            ))}
          </div>
          <p className="text-[11px] italic text-cream/20 mt-2">
            Paused? We won&rsquo;t auto-create the next order. Resume anytime to re-schedule from the date you click.
          </p>
        </div>
      )}

      <div>
      <span className="section-label mb-4 block">All Orders</span>

      {loadingOrders ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <div key={i} className="skeleton h-14 w-full rounded-xl" />)}
        </div>
      ) : orders.length === 0 ? (
        <div className="card text-center text-cream/25 py-12">
          <p>No orders yet. Place your first order to get started.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {orders.map((order) => (
            <div key={order.id} className="card-interactive p-4 cursor-pointer"
              onClick={() => setExpandedOrderId(expandedOrderId === order.id ? null : order.id)}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-heading font-bold text-cream">{order.id}</span>
                  <span className="text-xs text-cream/20">{formatDate(order.createdAt)}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className={cn('badge-sm', getStatusColor(order.status))}>{order.status}</span>
                  <span className="text-sm font-heading font-bold text-cream">{formatCurrency(order.total)}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); onReorder(order.id); }}
                    className="text-[10px] font-heading font-bold text-gold/50 hover:text-gold px-2 py-1 rounded-lg hover:bg-gold/10 transition-all"
                    title={`Add items from ${order.id} to cart`}
                  >
                    Reorder
                  </button>
                  {order.status === 'pending' && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onCancel(order.id); }}
                      className="text-[10px] font-heading font-bold text-red-400/50 hover:text-red-400 px-2 py-1 rounded-lg hover:bg-red-500/10 transition-all"
                      title="Cancel this order"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </div>
              <p className="text-xs text-cream/20 mt-1 truncate">{order.items.map((i) => i.productName).join(', ')}</p>
              {expandedOrderId === order.id && (
                <div className="mt-3 pt-3 border-t border-white/[0.04] animate-fade-in">
                  <OrderDetail order={order} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      </div>
    </div>
  );
}

/* ================================================================== */
/*  ORDER DETAIL                                                      */
/* ================================================================== */

function OrderDetail({ order }: { order: Order }) {
  return (
    <div className="space-y-3 text-sm">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div><span className="text-cream/30">Delivery:</span>{' '}<span className="text-cream/60">{formatDate(order.deliveryDate)}</span></div>
        {order.notes && <div><span className="text-cream/30">Notes:</span>{' '}<span className="text-cream/60">{order.notes}</span></div>}
      </div>
      <div className="space-y-1">
        {order.items.map((item, idx) => (
          <div key={idx} className="flex justify-between">
            <span className="text-cream/40">{item.productName} ({item.size}) x{item.quantity}</span>
            <span className="text-cream/60 font-medium">{formatCurrency(item.unitPrice * item.quantity)}</span>
          </div>
        ))}
      </div>
      <div className="flex justify-end gap-4 pt-1 text-xs">
        <span className="text-cream/30">Subtotal: {formatCurrency(order.subtotal)}</span>
        <span className="text-cream/30">Deposit: {formatCurrency(order.totalDeposit)}</span>
        <span className="text-gold font-heading font-bold">Total: {formatCurrency(order.total)}</span>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  INVOICES TAB                                                      */
/* ================================================================== */

function InvoicesTab({ invoices, loading, customer }: { invoices: Invoice[]; loading: boolean; customer: Customer }) {
  // Drafts are admin-internal; customer shouldn't see an unsent bill.
  const visible = invoices.filter((i) => i.status !== 'draft');
  const sorted = [...visible].sort((a, b) => new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime());
  const [printing, setPrinting] = useState<Invoice | null>(null);

  if (printing) {
    return (
      <div>
        <div className="no-print mb-6 flex items-center gap-4">
          <button onClick={() => setPrinting(null)} className="btn-secondary px-4 py-2">
            &larr; Back to invoices
          </button>
          <button onClick={() => window.print()} className="btn-primary">Print / Download PDF</button>
        </div>

        <div className="bg-white max-w-3xl mx-auto p-8 sm:p-12 rounded-xl shadow-dark-lg print:shadow-none print:rounded-none">
          <div className="flex justify-between items-start mb-8">
            <div>
              <h1 className="font-heading text-2xl font-black text-gray-900">GUIDON BREWING</h1>
              <p className="text-[10px] uppercase tracking-[0.3em] text-gray-500 font-semibold">Veteran-Owned Craft Brewery</p>
              <div className="text-sm text-gray-500 space-y-0.5 mt-3">
                <p>415 8th Ave. E., Hendersonville, NC 28792</p>
                <p>info@guidonbrewing.com</p>
              </div>
            </div>
            <div className="text-right">
              <h2 className="font-heading text-3xl font-black text-gray-900">INVOICE</h2>
              <p className="text-sm text-gray-500">{printing.id}</p>
              <p className="text-sm text-gray-500">Date: {formatDate(printing.issuedAt)}</p>
            </div>
          </div>
          <div className="h-1 bg-gradient-to-r from-gray-900 via-amber-600 to-gray-900 rounded mb-6" />
          <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
            <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.2em] mb-2">Bill To</h3>
            <p className="font-bold text-gray-900 text-lg">{customer.businessName}</p>
            <p className="text-sm text-gray-600">{customer.contactName}</p>
            <p className="text-sm text-gray-500">{customer.address}</p>
          </div>
          <table className="w-full mb-6">
            <thead>
              <tr className="border-b-2 border-gray-900">
                <th className="text-left py-2 text-xs font-bold text-gray-900 uppercase">Product</th>
                <th className="text-left py-2 text-xs font-bold text-gray-900 uppercase">Size</th>
                <th className="text-right py-2 text-xs font-bold text-gray-900 uppercase">Qty</th>
                <th className="text-right py-2 text-xs font-bold text-gray-900 uppercase">Price</th>
                <th className="text-right py-2 text-xs font-bold text-gray-900 uppercase">Deposit</th>
                <th className="text-right py-2 text-xs font-bold text-gray-900 uppercase">Total</th>
              </tr>
            </thead>
            <tbody>
              {printing.items.map((item, idx) => (
                <tr key={idx} className="border-b border-gray-200">
                  <td className="py-2 text-sm text-gray-800">{item.productName}</td>
                  <td className="py-2 text-sm text-gray-600">{item.size}</td>
                  <td className="py-2 text-sm text-right text-gray-600">{item.quantity}</td>
                  <td className="py-2 text-sm text-right text-gray-600">{formatCurrency(item.unitPrice)}</td>
                  <td className="py-2 text-sm text-right text-gray-600">{formatCurrency(item.deposit)}</td>
                  <td className="py-2 text-sm text-right font-semibold text-gray-900">{formatCurrency((item.unitPrice + item.deposit) * item.quantity)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex justify-end">
            <div className="w-72 space-y-2">
              <div className="flex justify-between text-sm"><span className="text-gray-500">Subtotal</span><span>{formatCurrency(printing.subtotal)}</span></div>
              <div className="flex justify-between text-sm"><span className="text-gray-500">Keg Deposits</span><span>{formatCurrency(printing.totalDeposit)}</span></div>
              <div className="flex justify-between font-black text-xl border-t-2 border-gray-900 pt-2 mt-2"><span>Total</span><span>{formatCurrency(printing.total)}</span></div>
            </div>
          </div>
          {printing.paidAt && (
            <div className="mt-6 text-center py-3 bg-emerald-50 rounded-lg border border-emerald-200">
              <p className="text-sm text-emerald-700 font-semibold">Paid on {formatDate(printing.paidAt)}</p>
            </div>
          )}
          <div className="mt-8 pt-4 border-t border-gray-200 text-center text-xs text-gray-400">
            <p>Guidon Brewing Company &bull; Veteran-Owned &bull; 415 8th Ave. E., Hendersonville, NC 28792</p>
          </div>
          <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-center gap-2 text-[10px] text-gray-400">
            <span>Powered by</span>
            <span className="font-bold tracking-wider text-gray-500">DERBY DIGITAL</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <span className="section-label mb-4 block">Billing</span>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <div key={i} className="skeleton h-14 w-full rounded-xl" />)}
        </div>
      ) : sorted.length === 0 ? (
        <div className="card text-center text-cream/25 py-10">
          <p>No invoices yet. Invoices are sent when orders are confirmed.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sorted.map((inv) => (
            <div key={inv.id} className="card p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-heading font-bold text-cream text-sm">{inv.id}</p>
                  <p className="text-xs text-cream/20 mt-0.5">Order: {inv.orderId} &middot; {formatDate(inv.issuedAt)}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={cn('badge-sm', getStatusColor(inv.status))}>{inv.status}</span>
                  <span className="text-sm font-heading font-bold text-cream">{formatCurrency(inv.total)}</span>
                  <button
                    onClick={() => setPrinting(inv)}
                    className="text-[10px] font-heading font-bold text-gold/60 hover:text-gold px-2 py-1 rounded-lg hover:bg-gold/10 transition-all"
                    title="View / print / download PDF"
                  >
                    View PDF
                  </button>
                </div>
              </div>
              {inv.paidAt && (
                <p className="text-xs text-cream/20 mt-2">Paid: {formatDate(inv.paidAt)}</p>
              )}
              <div className="mt-3 pt-3 border-t border-white/[0.04] space-y-1">
                {inv.items.map((item, idx) => (
                  <div key={idx} className="flex justify-between text-xs">
                    <span className="text-cream/35">{item.productName} ({item.size}) x{item.quantity}</span>
                    <span className="text-cream/50">{formatCurrency(item.unitPrice * item.quantity)}</span>
                  </div>
                ))}
                <div className="flex justify-between text-xs pt-1 border-t border-white/[0.04]">
                  <span className="text-cream/25">Total</span>
                  <span className="text-gold font-heading font-bold">{formatCurrency(inv.total)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ================================================================== */
/*  SETTINGS TAB                                                      */
/* ================================================================== */

function SettingsTab({ customer, onLogout }: { customer: Customer; onLogout: () => void }) {
  const [form, setForm] = useState({
    contactName: customer.contactName,
    phone: customer.phone,
    address: customer.address,
  });
  const [passwordForm, setPasswordForm] = useState({ current: '', newPassword: '', confirm: '' });
  const [saving, setSaving] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [message, setMessage] = useState('');
  const [passwordMessage, setPasswordMessage] = useState('');

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      const res = await fetch('/api/customers', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: customer.id, ...form }),
      });
      if (res.ok) setMessage('Settings updated.');
    } catch { setMessage('Failed to save.'); }
    finally { setSaving(false); }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordForm.newPassword !== passwordForm.confirm) {
      setPasswordMessage('Passwords do not match.');
      return;
    }
    if (passwordForm.newPassword.length < 6) {
      setPasswordMessage('Password must be at least 6 characters.');
      return;
    }
    setSavingPassword(true);
    setPasswordMessage('');
    try {
      const res = await fetch('/api/customers', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: customer.id, password: passwordForm.newPassword }),
      });
      if (res.ok) {
        setPasswordMessage('Password updated.');
        setPasswordForm({ current: '', newPassword: '', confirm: '' });
      }
    } catch { setPasswordMessage('Failed to update password.'); }
    finally { setSavingPassword(false); }
  };

  return (
    <div className="animate-fade-in max-w-lg space-y-8">
      <div>
        <span className="section-label mb-4 block">Account Information</span>
        <form onSubmit={handleSave} className="card space-y-4">
          <div>
            <label className="block text-sm font-medium text-cream/40 mb-1.5">Business Name</label>
            <input className="input opacity-50 cursor-not-allowed" value={customer.businessName} disabled />
          </div>
          <div>
            <label className="block text-sm font-medium text-cream/40 mb-1.5">Email</label>
            <input className="input opacity-50 cursor-not-allowed" value={customer.email} disabled />
          </div>
          <div>
            <label className="block text-sm font-medium text-cream/40 mb-1.5">Contact Name</label>
            <input className="input" value={form.contactName} onChange={e => setForm(p => ({ ...p, contactName: e.target.value }))} />
          </div>
          <div>
            <label className="block text-sm font-medium text-cream/40 mb-1.5">Phone</label>
            <input className="input" value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} />
          </div>
          <div>
            <label className="block text-sm font-medium text-cream/40 mb-1.5">Address</label>
            <input className="input" value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))} />
          </div>
          {message && <p className="text-sm text-emerald-400">{message}</p>}
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </form>
      </div>

      <div>
        <span className="section-label mb-4 block">Change Password</span>
        <form onSubmit={handlePasswordChange} className="card space-y-4">
          <div>
            <label className="block text-sm font-medium text-cream/40 mb-1.5">New Password</label>
            <input type="password" className="input" placeholder="Min 6 characters" value={passwordForm.newPassword}
              onChange={e => setPasswordForm(p => ({ ...p, newPassword: e.target.value }))} required />
          </div>
          <div>
            <label className="block text-sm font-medium text-cream/40 mb-1.5">Confirm Password</label>
            <input type="password" className="input" placeholder="Confirm new password" value={passwordForm.confirm}
              onChange={e => setPasswordForm(p => ({ ...p, confirm: e.target.value }))} required />
          </div>
          {passwordMessage && <p className={cn('text-sm', passwordMessage.includes('updated') ? 'text-emerald-400' : 'text-red-400')}>{passwordMessage}</p>}
          <button type="submit" disabled={savingPassword} className="btn-primary">
            {savingPassword ? 'Updating...' : 'Update Password'}
          </button>
        </form>
      </div>

      <div>
        <button onClick={onLogout} className="btn-danger w-full py-3">
          Log Out
        </button>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  KEG RETURN MODAL                                                  */
/* ================================================================== */

function KegReturnModal({ customerId, onClose, onSuccess }: { customerId: string; onClose: () => void; onSuccess: () => void }) {
  const [size, setSize] = useState<KegSize>('1/2bbl');
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (quantity < 1) { setError('Quantity must be at least 1.'); return; }
    setSubmitting(true); setError('');
    try {
      const res = await fetch('/api/keg-ledger', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId, type: 'return', size, quantity, notes }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || `Request failed with status ${res.status}`);
      }
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit return request.');
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <form onSubmit={handleSubmit}
        className="relative bg-charcoal-100 border border-white/[0.08] rounded-2xl w-full max-w-md p-6 space-y-5 animate-scale-in">
        <h3 className="text-lg font-heading font-bold text-cream">Request Keg Return</h3>

        <div>
          <span className="section-label mb-2 block">Keg Size</span>
          <select id="return-size" className="input" value={size} onChange={(e) => setSize(e.target.value as KegSize)}>
            <option value="1/2bbl">1/2 Barrel</option>
            <option value="1/4bbl">1/4 Barrel</option>
            <option value="1/6bbl">1/6 Barrel</option>
          </select>
        </div>

        <div>
          <span className="section-label mb-2 block">Quantity</span>
          <input id="return-qty" type="number" className="input" min={1} value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} />
        </div>

        <div>
          <span className="section-label mb-2 block">Notes (optional)</span>
          <textarea id="return-notes" className="input resize-none" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        {error && <p className="text-sm text-red-400 bg-red-500/10 rounded-xl px-4 py-2.5 border border-red-500/20">{error}</p>}

        <div className="flex gap-3 justify-end">
          <button type="button" onClick={onClose} className="btn-secondary px-4 py-2" disabled={submitting}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting ? 'Submitting...' : 'Submit Return'}
          </button>
        </div>
      </form>
    </div>
  );
}
