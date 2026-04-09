'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import type { Customer, Order, KegLedgerEntry, KegSize, KegBalance, Product, ProductSize, CartItem, KegReturn } from '@/lib/types';
import { KEG_DEPOSITS } from '@/lib/types';
import { formatCurrency, formatDate, cn, getStatusColor } from '@/lib/utils';

const KEG_LABELS: Record<KegSize, string> = {
  '1/2bbl': '1/2 Barrel', '1/4bbl': '1/4 Barrel', '1/6bbl': '1/6 Barrel',
};

const KEG_ICONS: Record<KegSize, string> = {
  '1/2bbl': 'L', '1/4bbl': 'M', '1/6bbl': 'S',
};

const SIZE_LABELS: Record<KegSize, string> = { '1/2bbl': '1/2 Barrel', '1/4bbl': '1/4 Barrel', '1/6bbl': '1/6 Barrel' };

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
      .then((r) => {
        if (r.ok) return r.json();
        return null;
      })
      .then((data) => {
        if (data && data.id) setCustomer(data);
      })
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
        <div className="w-14 h-14 bg-gold-gradient rounded-xl flex items-center justify-center shadow-gold animate-pulse-gold">
          <span className="text-charcoal font-heading font-black text-2xl">G</span>
        </div>
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
    <div className="min-h-screen flex items-center justify-center bg-charcoal px-4 animate-fade-in relative">
      {/* Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/3 left-1/3 w-96 h-96 bg-gold/[0.02] rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-md relative">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-gold-gradient rounded-xl flex items-center justify-center shadow-gold mx-auto mb-4">
            <span className="text-charcoal font-heading font-black text-2xl">G</span>
          </div>
          <h1 className="text-3xl font-heading font-black text-cream">Customer Portal</h1>
          <p className="mt-2 text-cream/30 text-sm">Sign in to manage your orders and keg balances.</p>
        </div>

        <form onSubmit={handleSubmit} className="card space-y-5">
          <div>
            <label htmlFor="email" className="block text-sm font-semibold text-cream/60 mb-1.5">Email Address</label>
            <input id="email" type="email" className="input" placeholder="you@example.com"
              value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-semibold text-cream/60 mb-1.5">Password</label>
            <input id="password" type="password" className="input" placeholder="Enter your password"
              value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>

          {error && <p className="text-sm text-red-400 bg-red-500/10 rounded-lg px-3 py-2 border border-red-500/20">{error}</p>}

          <button type="submit" className="btn-primary w-full py-3" disabled={submitting}>
            {submitting ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <p className="text-center mt-6 text-cream/20 text-xs">
          <Link href="/" className="hover:text-cream/40 transition-colors">&larr; Back to Guidon Brewing</Link>
          {' '}&bull;{' '}
          <Link href="/apply" className="hover:text-cream/40 transition-colors">Apply for an Account</Link>
        </p>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  DASHBOARD                                                         */
/* ================================================================== */

type Tab = 'overview' | 'products' | 'orders';

function Dashboard({ customer, onLogout }: { customer: Customer; onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>('overview');
  const [orders, setOrders] = useState<Order[]>([]);
  const [balances, setBalances] = useState<KegBalance | null>(null);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [loadingBalances, setLoadingBalances] = useState(true);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [showReturnModal, setShowReturnModal] = useState(false);

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

  useEffect(() => { fetchOrders(); fetchBalances(); }, [fetchOrders, fetchBalances]);

  return (
    <div className="min-h-screen bg-charcoal font-body">
      {/* Header */}
      <header className="border-b border-white/[0.06] animate-fade-in">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/">
              <div className="w-10 h-10 bg-gold-gradient rounded-lg flex items-center justify-center shadow-gold">
                <span className="text-charcoal font-heading font-black text-xl">G</span>
              </div>
            </Link>
            <div>
              <h1 className="text-xl sm:text-2xl font-heading font-black text-cream">{customer.businessName}</h1>
              <p className="text-cream/30 text-sm">Welcome back, {customer.contactName}</p>
            </div>
          </div>
          <button onClick={onLogout} className="btn-ghost text-sm border border-white/10 px-4 py-2 rounded-lg">
            Log Out
          </button>
        </div>
      </header>

      {/* Tab Navigation */}
      <div className="border-b border-white/[0.06]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex gap-1">
          {([
            { key: 'overview', label: 'Overview' },
            { key: 'products', label: 'Browse & Order' },
            { key: 'orders', label: 'Order History' },
          ] as { key: Tab; label: string }[]).map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={cn(
                'px-5 py-3 text-sm font-semibold transition-all border-b-2',
                tab === t.key
                  ? 'text-gold border-gold'
                  : 'text-cream/40 border-transparent hover:text-cream/60 hover:border-white/10'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

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
          />
        )}
        {tab === 'products' && (
          <ProductsTab customerId={customer.id} onOrderPlaced={() => { fetchOrders(); setTab('orders'); }} />
        )}
        {tab === 'orders' && (
          <OrdersTab
            orders={orders}
            loadingOrders={loadingOrders}
            expandedOrderId={expandedOrderId}
            setExpandedOrderId={setExpandedOrderId}
          />
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
  balances, loadingBalances, orders, loadingOrders, expandedOrderId, setExpandedOrderId, onShowReturn, onSwitchTab,
}: {
  balances: KegBalance | null;
  loadingBalances: boolean;
  orders: Order[];
  loadingOrders: boolean;
  expandedOrderId: string | null;
  setExpandedOrderId: (id: string | null) => void;
  onShowReturn: () => void;
  onSwitchTab: (tab: Tab) => void;
}) {
  const recentOrders = orders.slice(0, 5);

  return (
    <div className="space-y-10">
      {/* Keg Balances */}
      <section className="animate-fade-in">
        <div className="flex items-center gap-2 mb-5">
          <div className="w-1 h-5 bg-gold rounded-full" />
          <h2 className="text-xl font-heading font-bold text-cream">Keg Balances</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {loadingBalances
            ? (['1/2bbl', '1/4bbl', '1/6bbl'] as KegSize[]).map((size) => (
                <div key={size} className="card"><div className="skeleton h-4 w-24 mb-3" /><div className="skeleton h-12 w-16" /></div>
              ))
            : balances && (['1/2bbl', '1/4bbl', '1/6bbl'] as KegSize[]).map((size, idx) => (
                <div key={size}
                  className={cn('rounded-xl border-2 p-6 animate-slide-up transition-all duration-300', balanceColor(balances[size]))}
                  style={{ animationDelay: `${idx * 100}ms` }}
                >
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-semibold text-cream/50">{KEG_LABELS[size]}</p>
                    <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black', balanceColor(balances[size]), balanceTextColor(balances[size]))}>
                      {KEG_ICONS[size]}
                    </div>
                  </div>
                  <p className={cn('text-4xl font-black', balanceTextColor(balances[size]))}>{balances[size]}</p>
                  <p className="text-xs text-cream/30 mt-1">
                    {balances[size] === 0 ? 'All returned' : `${balances[size]} keg${balances[size] !== 1 ? 's' : ''} outstanding`}
                  </p>
                </div>
              ))
          }
        </div>
      </section>

      {/* Actions */}
      <section className="flex flex-col sm:flex-row gap-3 animate-fade-in">
        <button onClick={() => onSwitchTab('products')} className="btn-primary text-center py-3">Browse &amp; Place Order</button>
        <button onClick={onShowReturn} className="btn-secondary text-center py-3">Request Keg Return</button>
      </section>

      {/* Recent Orders */}
      <section className="animate-fade-in">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <div className="w-1 h-5 bg-gold rounded-full" />
            <h2 className="text-xl font-heading font-bold text-cream">Recent Orders</h2>
          </div>
          {orders.length > 5 && (
            <button onClick={() => onSwitchTab('orders')} className="text-sm text-gold/70 hover:text-gold transition-colors">
              View all &rarr;
            </button>
          )}
        </div>

        {loadingOrders ? (
          <div className="card p-0 overflow-hidden">
            <div className="space-y-0 divide-y divide-white/[0.06]">
              {[1, 2, 3].map((i) => (
                <div key={i} className="px-4 py-4 flex gap-4 items-center">
                  <div className="skeleton h-4 w-20" /><div className="skeleton h-4 w-24" />
                  <div className="skeleton h-4 flex-1" /><div className="skeleton h-5 w-20 rounded-full" />
                  <div className="skeleton h-4 w-16" />
                </div>
              ))}
            </div>
          </div>
        ) : recentOrders.length === 0 ? (
          <div className="card text-center text-cream/30 py-12">
            <p>No orders yet. Browse our products to place your first order.</p>
          </div>
        ) : (
          <div className="card p-0 overflow-hidden">
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead className="bg-white/[0.02]">
                  <tr>
                    <th className="table-header">Order ID</th>
                    <th className="table-header">Date</th>
                    <th className="table-header">Items</th>
                    <th className="table-header">Status</th>
                    <th className="table-header text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06]">
                  {recentOrders.map((order) => (
                    <OrderRow key={order.id} order={order}
                      expanded={expandedOrderId === order.id}
                      onToggle={() => setExpandedOrderId(expandedOrderId === order.id ? null : order.id)} />
                  ))}
                </tbody>
              </table>
            </div>
            <div className="md:hidden divide-y divide-white/[0.06]">
              {recentOrders.map((order) => (
                <OrderCardMobile key={order.id} order={order}
                  expanded={expandedOrderId === order.id}
                  onToggle={() => setExpandedOrderId(expandedOrderId === order.id ? null : order.id)} />
              ))}
            </div>
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

function ProductsTab({ customerId, onOrderPlaced }: { customerId: string; onOrderPlaced: () => void }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sizeFilter, setSizeFilter] = useState<string>('All');
  const [categoryFilter, setCategoryFilter] = useState<string>('All');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [kegReturns, setKegReturns] = useState<KegReturn[]>([]);
  const [selections, setSelections] = useState<Record<string, { size: KegSize; quantity: number }>>({});
  const [showCheckout, setShowCheckout] = useState(false);
  const [deliveryDate, setDeliveryDate] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  useEffect(() => {
    fetch('/api/products')
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

  const handleSubmitOrder = async () => {
    setSubmitError('');
    if (!deliveryDate) { setSubmitError('Please select a delivery date.'); return; }
    setSubmitting(true);
    try {
      const items = cart.map((item) => ({
        productId: item.productId, productName: item.productName, size: item.size,
        quantity: item.quantity, unitPrice: item.unitPrice, deposit: item.deposit,
      }));
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId, items, kegReturns, subtotal, totalDeposit, total, deliveryDate, notes }),
      });
      if (!res.ok) throw new Error('Failed to place order');
      setCart([]);
      setKegReturns([]);
      setShowCheckout(false);
      setDeliveryDate('');
      setNotes('');
      onOrderPlaced();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="font-heading text-2xl font-black text-cream">Browse Products</h2>
          <p className="text-cream/40 text-sm">Select kegs and add them to your order.</p>
        </div>
        {cartCount > 0 && (
          <button onClick={() => setShowCheckout(true)}
            className="btn-primary flex items-center gap-2 py-2.5 px-5">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
            </svg>
            Cart ({cartCount}) &middot; {formatCurrency(total)}
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="mb-6 space-y-3">
        <div className="relative max-w-md">
          <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-cream/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input type="text" placeholder="Search beers..." value={search}
            onChange={(e) => setSearch(e.target.value)} className="input pl-10" />
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-[10px] font-bold text-gold/60 uppercase tracking-[0.2em] mr-1">Size:</span>
          {(['All', ...KEG_SIZES] as const).map((s) => (
            <button key={s} onClick={() => setSizeFilter(s)}
              className={cn('px-3 py-1.5 rounded-full text-xs font-semibold transition-all duration-200',
                sizeFilter === s ? 'bg-gold text-charcoal shadow-gold' : 'bg-white/5 text-cream/50 border border-white/10 hover:border-gold/30')}>
              {s}
            </button>
          ))}
          {categories.length > 2 && (
            <>
              <div className="w-px h-6 bg-white/10 mx-2" />
              <span className="text-[10px] font-bold text-gold/60 uppercase tracking-[0.2em] mr-1">Style:</span>
              {categories.map((c) => (
                <button key={c} onClick={() => setCategoryFilter(c)}
                  className={cn('px-3 py-1.5 rounded-full text-xs font-semibold transition-all duration-200',
                    categoryFilter === c ? 'bg-olive text-cream' : 'bg-white/5 text-cream/50 border border-white/10 hover:border-olive/30')}>
                  {c}
                </button>
              ))}
            </>
          )}
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
        <div className="text-center py-16 text-cream/30">
          <p className="text-lg mb-4">No products found.</p>
          <button onClick={() => { setSearch(''); setSizeFilter('All'); setCategoryFilter('All'); }} className="btn-outline text-sm">Clear Filters</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredProducts.map((product, idx) => {
            const sel = getSelection(product.id, product.sizes);
            const currentSizeInfo = product.sizes.find((s) => s.size === sel.size);
            return (
              <div key={product.id} className="card flex flex-col animate-slide-up group"
                style={{ animationDelay: `${Math.min(idx * 50, 300)}ms` }}>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-heading text-lg font-bold text-cream leading-tight group-hover:text-gold transition-colors">{product.name}</h3>
                    <p className="text-xs font-bold text-gold/70 uppercase tracking-widest mt-1">{product.style}</p>
                  </div>
                  <span className="badge bg-olive/30 text-olive-300 border border-olive/30 ml-2 shrink-0">{product.abv}%</span>
                </div>
                <p className="text-sm text-cream/40 mb-4 flex-1 line-clamp-2 leading-relaxed">{product.description}</p>
                {currentSizeInfo && (
                  <div className="mb-4 p-3 rounded-lg bg-white/[0.03] border border-white/[0.04]">
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-black text-cream">{formatCurrency(currentSizeInfo.price)}</span>
                      <span className="text-xs text-cream/30">per keg</span>
                    </div>
                    <p className="text-xs text-gold/50 mt-0.5">+ {formatCurrency(currentSizeInfo.deposit)} refundable deposit</p>
                  </div>
                )}
                <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    <label className="text-[10px] font-bold text-cream/30 uppercase tracking-wider block mb-1">Size</label>
                    <select value={sel.size} onChange={(e) => updateSelection(product.id, 'size', e.target.value as KegSize)} className="input text-sm py-2">
                      {product.sizes.map((s) => <option key={s.size} value={s.size}>{SIZE_LABELS[s.size]}</option>)}
                    </select>
                  </div>
                  <div className="w-20">
                    <label className="text-[10px] font-bold text-cream/30 uppercase tracking-wider block mb-1">Qty</label>
                    <input type="number" min={1} value={sel.quantity}
                      onChange={(e) => updateSelection(product.id, 'quantity', Math.max(1, parseInt(e.target.value) || 1))}
                      className="input text-sm py-2 text-center" />
                  </div>
                  <button onClick={() => addToCart(product)} className="btn-primary text-sm py-2 px-5 whitespace-nowrap rounded-lg">
                    Add
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Checkout Modal */}
      {showCheckout && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in" onClick={() => setShowCheckout(false)} />
          <div className="relative bg-charcoal-100 rounded-2xl shadow-dark-lg border border-white/[0.06] w-full max-w-lg max-h-[90vh] overflow-y-auto animate-scale-in">
            <div className="px-6 py-5 border-b border-white/[0.06]">
              <h3 className="font-heading text-xl font-bold text-cream">Review &amp; Place Order</h3>
              <p className="text-sm text-cream/30 mt-1">{cart.length} item{cart.length !== 1 ? 's' : ''}</p>
            </div>

            <div className="px-6 py-5 space-y-5">
              {/* Cart Items */}
              <div className="space-y-3">
                {cart.map((item, idx) => (
                  <div key={`${item.productId}-${item.size}`} className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-cream text-sm truncate">{item.productName}</p>
                      <p className="text-xs text-cream/30">{item.size} &middot; {formatCurrency(item.unitPrice)} + {formatCurrency(item.deposit)} dep.</p>
                    </div>
                    <input type="number" min={1} value={item.quantity}
                      onChange={(e) => updateCartQty(idx, parseInt(e.target.value) || 1)}
                      className="w-16 input text-sm py-1 text-center" />
                    <button onClick={() => removeFromCart(idx)} className="p-1 text-red-400/60 hover:text-red-400" aria-label="Remove">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>

              {/* Keg Returns */}
              <div>
                <p className="text-xs font-bold text-cream/40 uppercase tracking-wider mb-2">Keg Returns (optional)</p>
                <div className="flex gap-2 mb-2">
                  {KEG_SIZES.map((size) => (
                    <button key={size} onClick={() => addKegReturn(size)}
                      className="btn-outline text-xs py-1 px-2 border-olive/30 text-olive-300 hover:bg-olive/10">+ {size}</button>
                  ))}
                </div>
                {kegReturns.map((ret) => (
                  <div key={ret.size} className="flex items-center gap-3 mb-1">
                    <span className="text-sm text-cream/70 flex-1">{ret.size} <span className="text-xs text-emerald-400/70">(-{formatCurrency(KEG_DEPOSITS[ret.size])}/ea)</span></span>
                    <input type="number" min={1} value={ret.quantity}
                      onChange={(e) => updateReturnQty(ret.size, parseInt(e.target.value) || 0)}
                      className="w-14 input text-sm py-1 text-center" />
                    <button onClick={() => removeReturn(ret.size)} className="p-1 text-red-400/60 hover:text-red-400">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>

              {/* Delivery */}
              <div>
                <label className="block text-sm font-semibold text-cream/70 mb-2">Delivery Date</label>
                <input type="date" value={deliveryDate} min={minDateStr}
                  onChange={(e) => setDeliveryDate(e.target.value)} className="input" />
              </div>

              <div>
                <label className="block text-sm font-semibold text-cream/70 mb-2">Order Notes</label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
                  placeholder="Special instructions..." rows={2} className="input resize-none" />
              </div>

              {/* Summary */}
              <div className="bg-white/[0.03] border border-white/[0.06] rounded-lg p-4 space-y-1.5">
                <div className="flex justify-between text-sm"><span className="text-cream/40">Subtotal</span><span className="text-cream/70">{formatCurrency(subtotal)}</span></div>
                <div className="flex justify-between text-sm"><span className="text-cream/40">Keg Deposits</span><span className="text-cream/70">{formatCurrency(depositFromItems)}</span></div>
                {depositFromReturns > 0 && (
                  <div className="flex justify-between text-sm"><span className="text-emerald-400/70">Return Credits</span><span className="text-emerald-400">-{formatCurrency(depositFromReturns)}</span></div>
                )}
                <div className="flex justify-between font-bold text-cream pt-2 border-t border-white/[0.06]">
                  <span>Total</span><span className="text-gold">{formatCurrency(total)}</span>
                </div>
              </div>

              {submitError && <p className="text-red-400 text-sm bg-red-500/10 rounded-lg px-3 py-2 border border-red-500/20">{submitError}</p>}
            </div>

            <div className="px-6 py-4 border-t border-white/[0.06] flex gap-3">
              <button onClick={() => setShowCheckout(false)} className="btn-outline flex-1 text-center">Back</button>
              <button onClick={handleSubmitOrder} disabled={submitting || cart.length === 0}
                className={cn('btn-primary flex-1 text-center', submitting && 'opacity-60 cursor-not-allowed')}>
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
/*  ORDERS TAB                                                        */
/* ================================================================== */

function OrdersTab({
  orders, loadingOrders, expandedOrderId, setExpandedOrderId,
}: {
  orders: Order[];
  loadingOrders: boolean;
  expandedOrderId: string | null;
  setExpandedOrderId: (id: string | null) => void;
}) {
  return (
    <div className="animate-fade-in">
      <div className="flex items-center gap-2 mb-5">
        <div className="w-1 h-5 bg-gold rounded-full" />
        <h2 className="text-xl font-heading font-bold text-cream">Order History</h2>
      </div>

      {loadingOrders ? (
        <div className="card p-0 overflow-hidden">
          <div className="space-y-0 divide-y divide-white/[0.06]">
            {[1, 2, 3].map((i) => (
              <div key={i} className="px-4 py-4 flex gap-4 items-center">
                <div className="skeleton h-4 w-20" /><div className="skeleton h-4 w-24" />
                <div className="skeleton h-4 flex-1" /><div className="skeleton h-5 w-20 rounded-full" />
                <div className="skeleton h-4 w-16" />
              </div>
            ))}
          </div>
        </div>
      ) : orders.length === 0 ? (
        <div className="card text-center text-cream/30 py-12">
          <p>No orders yet. Place your first order to get started.</p>
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full">
              <thead className="bg-white/[0.02]">
                <tr>
                  <th className="table-header">Order ID</th>
                  <th className="table-header">Date</th>
                  <th className="table-header">Items</th>
                  <th className="table-header">Status</th>
                  <th className="table-header text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {orders.map((order) => (
                  <OrderRow key={order.id} order={order}
                    expanded={expandedOrderId === order.id}
                    onToggle={() => setExpandedOrderId(expandedOrderId === order.id ? null : order.id)} />
                ))}
              </tbody>
            </table>
          </div>
          <div className="md:hidden divide-y divide-white/[0.06]">
            {orders.map((order) => (
              <OrderCardMobile key={order.id} order={order}
                expanded={expandedOrderId === order.id}
                onToggle={() => setExpandedOrderId(expandedOrderId === order.id ? null : order.id)} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ================================================================== */
/*  ORDER ROW                                                         */
/* ================================================================== */

function OrderRow({ order, expanded, onToggle }: { order: Order; expanded: boolean; onToggle: () => void }) {
  return (
    <>
      <tr onClick={onToggle} className="cursor-pointer hover:bg-white/[0.02] transition-colors">
        <td className="table-cell font-semibold text-cream">{order.id}</td>
        <td className="table-cell">{formatDate(order.createdAt)}</td>
        <td className="table-cell max-w-xs truncate">{order.items.map((i) => i.productName).join(', ')}</td>
        <td className="table-cell"><span className={cn('badge', getStatusColor(order.status))}>{order.status}</span></td>
        <td className="table-cell text-right font-semibold text-cream">{formatCurrency(order.total)}</td>
      </tr>
      {expanded && (
        <tr className="animate-fade-in">
          <td colSpan={5} className="px-4 py-4 bg-white/[0.02]"><OrderDetail order={order} /></td>
        </tr>
      )}
    </>
  );
}

function OrderCardMobile({ order, expanded, onToggle }: { order: Order; expanded: boolean; onToggle: () => void }) {
  return (
    <div className="px-4 py-4 cursor-pointer hover:bg-white/[0.02] transition-colors" onClick={onToggle}>
      <div className="flex items-center justify-between mb-1">
        <span className="font-semibold text-sm text-cream">{order.id}</span>
        <span className={cn('badge', getStatusColor(order.status))}>{order.status}</span>
      </div>
      <div className="flex items-center justify-between text-sm text-cream/40">
        <span>{formatDate(order.createdAt)}</span>
        <span className="font-semibold text-cream">{formatCurrency(order.total)}</span>
      </div>
      <p className="text-xs text-cream/25 mt-1 truncate">{order.items.map((i) => i.productName).join(', ')}</p>
      {expanded && <div className="mt-3 animate-fade-in"><OrderDetail order={order} /></div>}
    </div>
  );
}

function OrderDetail({ order }: { order: Order }) {
  return (
    <div className="space-y-3 text-sm">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div><span className="font-semibold text-cream/50">Delivery Date:</span>{' '}<span className="text-cream/70">{formatDate(order.deliveryDate)}</span></div>
        {order.notes && <div><span className="font-semibold text-cream/50">Notes:</span>{' '}<span className="text-cream/70">{order.notes}</span></div>}
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-white/[0.06]">
            <th className="text-left py-1.5 font-semibold text-cream/40">Product</th>
            <th className="text-left py-1.5 font-semibold text-cream/40">Size</th>
            <th className="text-right py-1.5 font-semibold text-cream/40">Qty</th>
            <th className="text-right py-1.5 font-semibold text-cream/40">Price</th>
            <th className="text-right py-1.5 font-semibold text-cream/40">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          {order.items.map((item, idx) => (
            <tr key={idx} className="border-b border-white/[0.04]">
              <td className="py-1.5 text-cream/70">{item.productName}</td>
              <td className="py-1.5 text-cream/50">{item.size}</td>
              <td className="py-1.5 text-right text-cream/50">{item.quantity}</td>
              <td className="py-1.5 text-right text-cream/50">{formatCurrency(item.unitPrice)}</td>
              <td className="py-1.5 text-right text-cream/70">{formatCurrency(item.unitPrice * item.quantity)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex justify-end gap-6 pt-1 font-semibold text-cream/60">
        <span>Subtotal: {formatCurrency(order.subtotal)}</span>
        <span>Deposit: {formatCurrency(order.totalDeposit)}</span>
        <span className="text-gold font-bold">Total: {formatCurrency(order.total)}</span>
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
        className="relative bg-charcoal-100 border border-white/[0.06] rounded-xl shadow-dark-lg w-full max-w-md p-6 space-y-5 animate-scale-in">
        <h3 className="text-lg font-heading font-bold text-cream">Request Keg Return</h3>

        <div>
          <label htmlFor="return-size" className="block text-sm font-semibold text-cream/60 mb-1.5">Keg Size</label>
          <select id="return-size" className="input" value={size} onChange={(e) => setSize(e.target.value as KegSize)}>
            <option value="1/2bbl">1/2 Barrel</option>
            <option value="1/4bbl">1/4 Barrel</option>
            <option value="1/6bbl">1/6 Barrel</option>
          </select>
        </div>

        <div>
          <label htmlFor="return-qty" className="block text-sm font-semibold text-cream/60 mb-1.5">Quantity</label>
          <input id="return-qty" type="number" className="input" min={1} value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} />
        </div>

        <div>
          <label htmlFor="return-notes" className="block text-sm font-semibold text-cream/60 mb-1.5">Notes (optional)</label>
          <textarea id="return-notes" className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        {error && <p className="text-sm text-red-400 bg-red-500/10 rounded-lg px-3 py-2 border border-red-500/20">{error}</p>}

        <div className="flex gap-3 justify-end">
          <button type="button" onClick={onClose} className="btn-ghost border border-white/10 px-4 py-2" disabled={submitting}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting ? 'Submitting...' : 'Submit Return'}
          </button>
        </div>
      </form>
    </div>
  );
}
