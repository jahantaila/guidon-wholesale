'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import type { Customer, Order, Invoice, KegLedgerEntry, KegSize, KegBalance, Product, ProductSize, CartItem, KegReturn } from '@/lib/types';
import { KEG_DEPOSITS } from '@/lib/types';
import { formatCurrency, formatDate, cn, getStatusColor } from '@/lib/utils';

const KEG_LABELS: Record<KegSize, string> = {
  '1/2bbl': '1/2 Barrel', '1/4bbl': '1/4 Barrel', '1/6bbl': '1/6 Barrel',
};

const SIZE_SHORT: Record<KegSize, string> = { '1/2bbl': 'Half', '1/4bbl': 'Quarter', '1/6bbl': 'Sixth' };

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
            <input id="email" type="email" className="input" placeholder="you@example.com"
              value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-cream/40 mb-1.5">Password</label>
            <input id="password" type="password" className="input" placeholder="Enter your password"
              value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>

          {error && <p className="text-sm text-red-400 bg-red-500/10 rounded-xl px-4 py-2.5 border border-red-500/20">{error}</p>}

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
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [showReturnModal, setShowReturnModal] = useState(false);

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

  useEffect(() => { fetchOrders(); fetchBalances(); fetchInvoices(); }, [fetchOrders, fetchBalances, fetchInvoices]);

  // Quick reorder
  const handleReorder = useCallback(() => {
    setTab('products');
  }, []);

  const totalSpent = useMemo(() => orders.reduce((sum, o) => sum + o.total, 0), [orders]);
  const totalKegsOut = useMemo(() => {
    if (!balances) return 0;
    return balances['1/2bbl'] + balances['1/4bbl'] + balances['1/6bbl'];
  }, [balances]);

  return (
    <div className="min-h-screen bg-charcoal font-body">
      {/* Header */}
      <header className="border-b border-white/[0.06]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Image src="/logo.png" alt="Guidon Brewing" width={350} height={194} className="h-8 w-auto rounded-lg" />
            </Link>
            <div>
              <h1 className="text-lg sm:text-xl font-heading font-black text-cream">{customer.businessName}</h1>
              <p className="text-cream/25 text-xs">Welcome back, {customer.contactName}</p>
            </div>
          </div>
          <button onClick={onLogout} className="btn-ghost text-xs border border-white/[0.08] px-4 py-2 rounded-xl">
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
          <ProductsTab customerId={customer.id} onOrderPlaced={() => { fetchOrders(); setTab('orders'); }} />
        )}
        {tab === 'orders' && (
          <OrdersTab
            orders={orders}
            loadingOrders={loadingOrders}
            expandedOrderId={expandedOrderId}
            setExpandedOrderId={setExpandedOrderId}
            onReorder={handleReorder}
          />
        )}
        {tab === 'invoices' && (
          <InvoicesTab invoices={invoices} loading={loadingInvoices} />
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
  onReorder: () => void;
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
  const [toastMsg, setToastMsg] = useState('');

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

      <div className="flex items-center justify-between mb-6">
        <div>
          <span className="section-label mb-1 block">Craft Beer Catalog</span>
          <h2 className="font-heading text-2xl font-black text-cream">Browse Products</h2>
        </div>
        {cartCount > 0 && (
          <button onClick={() => setShowCheckout(true)}
            className="btn-primary py-2.5 px-5">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4" />
            </svg>
            Cart ({cartCount}) &middot; {formatCurrency(total)}
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="mb-6 space-y-3">
        <div className="relative max-w-md">
          <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-cream/25" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input type="text" placeholder="Search beers..." value={search}
            onChange={(e) => setSearch(e.target.value)} className="input pl-11" />
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          {categories.length > 2 && categories.map((c) => (
            <button key={c} onClick={() => setCategoryFilter(c)}
              className={cn('px-4 py-2 rounded-xl text-xs font-heading font-bold transition-all',
                categoryFilter === c ? 'bg-gold text-charcoal' : 'bg-charcoal-200 text-cream/40 border border-white/[0.08] hover:text-cream/60')}>
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
        <div className="text-center py-16 text-cream/25">
          <p className="text-base mb-4">No products found.</p>
          <button onClick={() => { setSearch(''); setSizeFilter('All'); setCategoryFilter('All'); }} className="btn-ghost text-sm text-gold">Clear Filters</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredProducts.map((product, idx) => {
            const sel = getSelection(product.id, product.sizes);
            const currentSizeInfo = product.sizes.find((s) => s.size === sel.size);
            const colorGrad = BEER_COLORS[product.category] || 'from-gold/20 to-amber-800/15';
            return (
              <div key={product.id} className="card-product flex flex-col animate-slide-up"
                style={{ animationDelay: `${Math.min(idx * 40, 250)}ms` }}>
                <div className={cn('h-24 bg-gradient-to-br relative', colorGrad)}>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-3xl font-heading font-black text-white/15">{product.abv}%</span>
                  </div>
                  <div className="absolute top-2.5 left-2.5">
                    <span className="badge-sm bg-black/40 text-white/80 backdrop-blur-sm">{product.category}</span>
                  </div>
                </div>
                <div className="p-4 flex flex-col flex-1">
                  <h3 className="font-heading text-sm font-bold text-cream mb-0.5">{product.name}</h3>
                  <p className="text-xs text-cream/30 mb-3">{product.style}</p>
                  {currentSizeInfo && (
                    <div className="mb-3 flex items-baseline gap-1.5">
                      <span className="text-lg font-heading font-black text-cream">{formatCurrency(currentSizeInfo.price)}</span>
                      <span className="text-[10px] text-cream/20">/ keg</span>
                    </div>
                  )}
                  {/* Size pills */}
                  <div className="flex gap-1 mb-3">
                    {product.sizes.map((s) => (
                      <button key={s.size} onClick={() => updateSelection(product.id, 'size', s.size)}
                        className={cn('flex-1 py-1.5 rounded-lg text-[10px] font-heading font-bold transition-all',
                          sel.size === s.size ? 'bg-gold text-charcoal' : 'bg-charcoal-300 text-cream/35 hover:text-cream/50')}>
                        {SIZE_SHORT[s.size]}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2 items-center">
                    <div className="flex items-center border border-white/[0.08] rounded-lg overflow-hidden">
                      <button onClick={() => updateSelection(product.id, 'quantity', Math.max(1, sel.quantity - 1))} className="px-2.5 py-1.5 text-cream/30 hover:text-cream text-xs">-</button>
                      <span className="px-2.5 py-1.5 text-xs font-bold text-cream bg-charcoal-200 min-w-[2rem] text-center">{sel.quantity}</span>
                      <button onClick={() => updateSelection(product.id, 'quantity', sel.quantity + 1)} className="px-2.5 py-1.5 text-cream/30 hover:text-cream text-xs">+</button>
                    </div>
                    <button onClick={() => addToCart(product)} className="btn-primary flex-1 py-2 text-xs">
                      Add
                    </button>
                  </div>
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

              {/* Keg Returns */}
              <div>
                <span className="section-label mb-2 block">Keg Returns (optional)</span>
                <div className="flex gap-2 mb-2">
                  {KEG_SIZES.map((size) => (
                    <button key={size} onClick={() => addKegReturn(size)}
                      className="flex-1 text-[10px] font-heading font-bold py-1.5 rounded-lg bg-charcoal-300 border border-white/[0.06] text-cream/35 hover:text-olive-300 hover:border-olive/30 transition-all">
                      + {SIZE_SHORT[size]}
                    </button>
                  ))}
                </div>
                {kegReturns.map((ret) => (
                  <div key={ret.size} className="flex items-center gap-3 mb-1">
                    <span className="text-sm text-cream/50 flex-1">{SIZE_SHORT[ret.size]} <span className="text-xs text-emerald-400/50">(-{formatCurrency(KEG_DEPOSITS[ret.size])}/ea)</span></span>
                    <div className="flex items-center border border-white/[0.08] rounded-lg overflow-hidden">
                      <button onClick={() => updateReturnQty(ret.size, ret.quantity - 1)} className="px-2 py-1 text-cream/30 text-xs">-</button>
                      <span className="px-2 py-1 text-xs font-bold text-cream bg-charcoal-300 min-w-[1.5rem] text-center">{ret.quantity}</span>
                      <button onClick={() => updateReturnQty(ret.size, ret.quantity + 1)} className="px-2 py-1 text-cream/30 text-xs">+</button>
                    </div>
                    <button onClick={() => removeReturn(ret.size)} className="p-1 text-cream/15 hover:text-red-400">
                      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                ))}
              </div>

              {/* Delivery */}
              <div>
                <span className="section-label mb-2 block">Delivery Date</span>
                <input type="date" value={deliveryDate} min={minDateStr}
                  onChange={(e) => setDeliveryDate(e.target.value)} className="input" />
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
  orders, loadingOrders, expandedOrderId, setExpandedOrderId, onReorder,
}: {
  orders: Order[];
  loadingOrders: boolean;
  expandedOrderId: string | null;
  setExpandedOrderId: (id: string | null) => void;
  onReorder: () => void;
}) {
  return (
    <div className="animate-fade-in">
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
                    onClick={(e) => { e.stopPropagation(); onReorder(); }}
                    className="text-[10px] font-heading font-bold text-gold/50 hover:text-gold px-2 py-1 rounded-lg hover:bg-gold/10 transition-all"
                    title="Reorder"
                  >
                    Reorder
                  </button>
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

function InvoicesTab({ invoices, loading }: { invoices: Invoice[]; loading: boolean }) {
  const sorted = [...invoices].sort((a, b) => new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime());

  return (
    <div className="animate-fade-in">
      <span className="section-label mb-4 block">Billing</span>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <div key={i} className="skeleton h-14 w-full rounded-xl" />)}
        </div>
      ) : sorted.length === 0 ? (
        <div className="card text-center text-cream/25 py-10">
          <p>No invoices yet. Invoices are generated when orders are delivered.</p>
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
