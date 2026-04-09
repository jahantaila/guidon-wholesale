'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import type { Customer, Order, KegLedgerEntry, KegSize, KegBalance } from '@/lib/types';
import { formatCurrency, formatDate, cn, getStatusColor } from '@/lib/utils';

const KEG_LABELS: Record<KegSize, string> = {
  '1/2bbl': '1/2 Barrel', '1/4bbl': '1/4 Barrel', '1/6bbl': '1/6 Barrel',
};

const KEG_ICONS: Record<KegSize, string> = {
  '1/2bbl': 'L', '1/4bbl': 'M', '1/6bbl': 'S',
};

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
  return customer ? (
    <Dashboard customer={customer} onLogout={() => setCustomer(null)} />
  ) : (
    <LoginScreen onLogin={setCustomer} />
  );
}

/* ================================================================== */
/*  LOGIN SCREEN                                                      */
/* ================================================================== */

function LoginScreen({ onLogin }: { onLogin: (c: Customer) => void }) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch('/api/customers')
      .then((r) => r.json())
      .then((data: Customer[]) => { setCustomers(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!selectedId) { setError('Please select a business.'); return; }
    if (!email.trim()) { setError('Please enter your email address.'); return; }
    setSubmitting(true);
    const match = customers.find((c) => c.id === selectedId);
    if (!match) { setError('Business not found.'); setSubmitting(false); return; }
    if (match.email.toLowerCase() !== email.trim().toLowerCase()) {
      setError('Email does not match the selected business on file.');
      setSubmitting(false); return;
    }
    setTimeout(() => { setSubmitting(false); onLogin(match); }, 300);
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
            <label htmlFor="business" className="block text-sm font-semibold text-cream/60 mb-1.5">Business Name</label>
            {loading ? <div className="skeleton h-11 w-full rounded-lg" /> : (
              <select id="business" className="input" value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
                <option value="">Select your business</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.businessName}</option>)}
              </select>
            )}
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-semibold text-cream/60 mb-1.5">Email Address</label>
            <input id="email" type="email" className="input" placeholder="you@example.com"
              value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>

          {error && <p className="text-sm text-red-400 bg-red-500/10 rounded-lg px-3 py-2 border border-red-500/20">{error}</p>}

          <button type="submit" className="btn-primary w-full py-3" disabled={submitting}>
            {submitting ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <p className="text-center mt-6 text-cream/20 text-xs">
          <Link href="/" className="hover:text-cream/40 transition-colors">&larr; Back to Guidon Brewing</Link>
        </p>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  DASHBOARD                                                         */
/* ================================================================== */

function Dashboard({ customer, onLogout }: { customer: Customer; onLogout: () => void }) {
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
            <div className="w-10 h-10 bg-gold-gradient rounded-lg flex items-center justify-center shadow-gold">
              <span className="text-charcoal font-heading font-black text-xl">G</span>
            </div>
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

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-10">
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
          <Link href="/order" className="btn-primary text-center py-3">Place New Order</Link>
          <button onClick={() => setShowReturnModal(true)} className="btn-secondary text-center py-3">Request Keg Return</button>
        </section>

        {/* Order History */}
        <section className="animate-fade-in">
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
              {/* Desktop table */}
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
              {/* Mobile cards */}
              <div className="md:hidden divide-y divide-white/[0.06]">
                {orders.map((order) => (
                  <OrderCardMobile key={order.id} order={order}
                    expanded={expandedOrderId === order.id}
                    onToggle={() => setExpandedOrderId(expandedOrderId === order.id ? null : order.id)} />
                ))}
              </div>
            </div>
          )}
        </section>
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
