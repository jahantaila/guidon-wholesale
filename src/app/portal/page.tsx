'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import type {
  Customer,
  Order,
  KegLedgerEntry,
  KegSize,
  KegBalance,
} from '@/lib/types';
import { formatCurrency, formatDate, cn, getStatusColor } from '@/lib/utils';

/* ------------------------------------------------------------------ */
/*  Keg Balance Card                                                  */
/* ------------------------------------------------------------------ */

function balanceColor(n: number): string {
  if (n <= 5) return 'bg-green-50 border-green-300 text-green-800';
  if (n <= 10) return 'bg-amber-50 border-amber-300 text-amber-800';
  return 'bg-red-50 border-red-300 text-red-800';
}

function balanceBadge(n: number): string {
  if (n <= 5) return 'bg-green-100 text-green-700';
  if (n <= 10) return 'bg-amber-100 text-amber-700';
  return 'bg-red-100 text-red-700';
}

const KEG_LABELS: Record<KegSize, string> = {
  '1/2bbl': '1/2 Barrel',
  '1/4bbl': '1/4 Barrel',
  '1/6bbl': '1/6 Barrel',
};

/* ------------------------------------------------------------------ */
/*  Main page component                                               */
/* ------------------------------------------------------------------ */

export default function PortalPage() {
  // Auth state
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
      .then((data: Customer[]) => {
        setCustomers(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!selectedId) {
      setError('Please select a business.');
      return;
    }
    if (!email.trim()) {
      setError('Please enter your email address.');
      return;
    }

    setSubmitting(true);
    const match = customers.find((c) => c.id === selectedId);
    if (!match) {
      setError('Business not found.');
      setSubmitting(false);
      return;
    }
    if (match.email.toLowerCase() !== email.trim().toLowerCase()) {
      setError('Email does not match the selected business on file.');
      setSubmitting(false);
      return;
    }

    // Simulate brief async for UX
    setTimeout(() => {
      setSubmitting(false);
      onLogin(match);
    }, 300);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-cream px-4 animate-fade-in">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-heading font-bold text-brown">
            Customer Portal
          </h1>
          <p className="mt-2 text-brown/60 font-body">
            Sign in to manage your orders and keg balances.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="card space-y-5">
          {/* Business selector */}
          <div>
            <label
              htmlFor="business"
              className="block text-sm font-medium text-brown mb-1"
            >
              Business Name
            </label>
            {loading ? (
              <div className="skeleton h-11 w-full" />
            ) : (
              <select
                id="business"
                className="input"
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
              >
                <option value="">Select your business</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.businessName}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Email */}
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-brown mb-1"
            >
              Email Address
            </label>
            <input
              id="email"
              type="email"
              className="input"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            className="btn-primary w-full"
            disabled={submitting}
          >
            {submitting ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  DASHBOARD                                                         */
/* ================================================================== */

function Dashboard({
  customer,
  onLogout,
}: {
  customer: Customer;
  onLogout: () => void;
}) {
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
      .then((data: Order[]) => {
        setOrders(data);
        setLoadingOrders(false);
      })
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
        // Clamp to zero
        (Object.keys(bal) as KegSize[]).forEach((k) => {
          if (bal[k] < 0) bal[k] = 0;
        });
        setBalances(bal);
        setLoadingBalances(false);
      })
      .catch(() => setLoadingBalances(false));
  }, [customer.id]);

  useEffect(() => {
    fetchOrders();
    fetchBalances();
  }, [fetchOrders, fetchBalances]);

  return (
    <div className="min-h-screen bg-cream font-body">
      {/* Header */}
      <header className="bg-olive text-white shadow-md animate-fade-in">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl sm:text-2xl font-heading font-bold">
              {customer.businessName}
            </h1>
            <p className="text-olive-200 text-sm hidden sm:block">
              Welcome back, {customer.contactName}
            </p>
          </div>
          <button
            onClick={onLogout}
            className="text-sm border border-white/30 rounded-lg px-4 py-2 hover:bg-white/10 transition-colors"
          >
            Log Out
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-10">
        {/* Keg Balances */}
        <section className="animate-fade-in">
          <h2 className="text-xl font-heading font-semibold text-brown mb-4">
            Keg Balances
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {loadingBalances
              ? (['1/2bbl', '1/4bbl', '1/6bbl'] as KegSize[]).map((size) => (
                  <div key={size} className="card animate-slide-up">
                    <div className="skeleton h-4 w-24 mb-3" />
                    <div className="skeleton h-10 w-16" />
                  </div>
                ))
              : balances &&
                (['1/2bbl', '1/4bbl', '1/6bbl'] as KegSize[]).map(
                  (size, idx) => (
                    <div
                      key={size}
                      className={cn(
                        'rounded-xl border-2 p-6 animate-slide-up',
                        balanceColor(balances[size])
                      )}
                      style={{ animationDelay: `${idx * 80}ms` }}
                    >
                      <p className="text-sm font-medium opacity-70">
                        {KEG_LABELS[size]}
                      </p>
                      <p className="text-3xl font-bold mt-1">
                        {balances[size]}
                      </p>
                      <span
                        className={cn(
                          'badge mt-2',
                          balanceBadge(balances[size])
                        )}
                      >
                        {balances[size] === 0
                          ? 'All returned'
                          : `${balances[size]} out`}
                      </span>
                    </div>
                  )
                )}
          </div>
        </section>

        {/* Actions */}
        <section className="flex flex-col sm:flex-row gap-3 animate-fade-in">
          <Link href="/order" className="btn-primary text-center">
            Place New Order
          </Link>
          <button
            onClick={() => setShowReturnModal(true)}
            className="btn-secondary text-center"
          >
            Request Keg Return
          </button>
        </section>

        {/* Order History */}
        <section className="animate-fade-in">
          <h2 className="text-xl font-heading font-semibold text-brown mb-4">
            Order History
          </h2>

          {loadingOrders ? (
            <div className="card p-0 overflow-hidden">
              <div className="space-y-0 divide-y divide-cream-200">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="px-4 py-4 flex gap-4 items-center">
                    <div className="skeleton h-4 w-20" />
                    <div className="skeleton h-4 w-24" />
                    <div className="skeleton h-4 flex-1" />
                    <div className="skeleton h-5 w-20 rounded-full" />
                    <div className="skeleton h-4 w-16" />
                  </div>
                ))}
              </div>
            </div>
          ) : orders.length === 0 ? (
            <div className="card text-center text-brown/50 py-12">
              No orders yet. Place your first order to get started.
            </div>
          ) : (
            <div className="card p-0 overflow-hidden">
              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-cream-100">
                    <tr>
                      <th className="table-header">Order ID</th>
                      <th className="table-header">Date</th>
                      <th className="table-header">Items</th>
                      <th className="table-header">Status</th>
                      <th className="table-header text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-cream-200">
                    {orders.map((order) => (
                      <OrderRow
                        key={order.id}
                        order={order}
                        expanded={expandedOrderId === order.id}
                        onToggle={() =>
                          setExpandedOrderId(
                            expandedOrderId === order.id ? null : order.id
                          )
                        }
                      />
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="md:hidden divide-y divide-cream-200">
                {orders.map((order) => (
                  <OrderCardMobile
                    key={order.id}
                    order={order}
                    expanded={expandedOrderId === order.id}
                    onToggle={() =>
                      setExpandedOrderId(
                        expandedOrderId === order.id ? null : order.id
                      )
                    }
                  />
                ))}
              </div>
            </div>
          )}
        </section>
      </main>

      {/* Keg Return Modal */}
      {showReturnModal && (
        <KegReturnModal
          customerId={customer.id}
          onClose={() => setShowReturnModal(false)}
          onSuccess={() => {
            setShowReturnModal(false);
            fetchBalances();
          }}
        />
      )}
    </div>
  );
}

/* ================================================================== */
/*  ORDER ROW (desktop)                                               */
/* ================================================================== */

function OrderRow({
  order,
  expanded,
  onToggle,
}: {
  order: Order;
  expanded: boolean;
  onToggle: () => void;
}) {
  const itemsSummary = order.items.map((i) => i.productName).join(', ');

  return (
    <>
      <tr
        onClick={onToggle}
        className="cursor-pointer hover:bg-cream-50 transition-colors"
      >
        <td className="table-cell font-medium">{order.id}</td>
        <td className="table-cell">{formatDate(order.createdAt)}</td>
        <td className="table-cell max-w-xs truncate">{itemsSummary}</td>
        <td className="table-cell">
          <span className={cn('badge', getStatusColor(order.status))}>
            {order.status}
          </span>
        </td>
        <td className="table-cell text-right font-medium">
          {formatCurrency(order.total)}
        </td>
      </tr>
      {expanded && (
        <tr className="animate-fade-in">
          <td colSpan={5} className="px-4 py-4 bg-cream-50">
            <OrderDetail order={order} />
          </td>
        </tr>
      )}
    </>
  );
}

/* ================================================================== */
/*  ORDER CARD (mobile)                                               */
/* ================================================================== */

function OrderCardMobile({
  order,
  expanded,
  onToggle,
}: {
  order: Order;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className="px-4 py-4 cursor-pointer hover:bg-cream-50 transition-colors"
      onClick={onToggle}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="font-medium text-sm text-brown">{order.id}</span>
        <span className={cn('badge', getStatusColor(order.status))}>
          {order.status}
        </span>
      </div>
      <div className="flex items-center justify-between text-sm text-brown/60">
        <span>{formatDate(order.createdAt)}</span>
        <span className="font-medium text-brown">
          {formatCurrency(order.total)}
        </span>
      </div>
      <p className="text-xs text-brown/50 mt-1 truncate">
        {order.items.map((i) => i.productName).join(', ')}
      </p>
      {expanded && (
        <div className="mt-3 animate-fade-in">
          <OrderDetail order={order} />
        </div>
      )}
    </div>
  );
}

/* ================================================================== */
/*  ORDER DETAIL (expanded view)                                      */
/* ================================================================== */

function OrderDetail({ order }: { order: Order }) {
  return (
    <div className="space-y-3 text-sm">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div>
          <span className="font-medium text-brown/70">Delivery Date:</span>{' '}
          {formatDate(order.deliveryDate)}
        </div>
        {order.notes && (
          <div>
            <span className="font-medium text-brown/70">Notes:</span>{' '}
            {order.notes}
          </div>
        )}
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-cream-200">
            <th className="text-left py-1 font-medium text-brown/70">
              Product
            </th>
            <th className="text-left py-1 font-medium text-brown/70">Size</th>
            <th className="text-right py-1 font-medium text-brown/70">Qty</th>
            <th className="text-right py-1 font-medium text-brown/70">
              Price
            </th>
            <th className="text-right py-1 font-medium text-brown/70">
              Subtotal
            </th>
          </tr>
        </thead>
        <tbody>
          {order.items.map((item, idx) => (
            <tr key={idx} className="border-b border-cream-100">
              <td className="py-1">{item.productName}</td>
              <td className="py-1">{item.size}</td>
              <td className="py-1 text-right">{item.quantity}</td>
              <td className="py-1 text-right">
                {formatCurrency(item.unitPrice)}
              </td>
              <td className="py-1 text-right">
                {formatCurrency(item.unitPrice * item.quantity)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex justify-end gap-6 pt-1 font-medium">
        <span>Subtotal: {formatCurrency(order.subtotal)}</span>
        <span>Deposit: {formatCurrency(order.totalDeposit)}</span>
        <span className="text-olive font-bold">
          Total: {formatCurrency(order.total)}
        </span>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  KEG RETURN MODAL                                                  */
/* ================================================================== */

function KegReturnModal({
  customerId,
  onClose,
  onSuccess,
}: {
  customerId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [size, setSize] = useState<KegSize>('1/2bbl');
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (quantity < 1) {
      setError('Quantity must be at least 1.');
      return;
    }
    setSubmitting(true);
    setError('');

    try {
      const res = await fetch('/api/keg-ledger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId,
          type: 'return',
          size,
          quantity,
          notes,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(
          data?.error || `Request failed with status ${res.status}`
        );
      }

      onSuccess();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to submit return request.'
      );
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 animate-fade-in"
        onClick={onClose}
      />

      {/* Modal */}
      <form
        onSubmit={handleSubmit}
        className="relative bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-5 animate-slide-up"
      >
        <h3 className="text-lg font-heading font-semibold text-brown">
          Request Keg Return
        </h3>

        {/* Size */}
        <div>
          <label
            htmlFor="return-size"
            className="block text-sm font-medium text-brown mb-1"
          >
            Keg Size
          </label>
          <select
            id="return-size"
            className="input"
            value={size}
            onChange={(e) => setSize(e.target.value as KegSize)}
          >
            <option value="1/2bbl">1/2 Barrel</option>
            <option value="1/4bbl">1/4 Barrel</option>
            <option value="1/6bbl">1/6 Barrel</option>
          </select>
        </div>

        {/* Quantity */}
        <div>
          <label
            htmlFor="return-qty"
            className="block text-sm font-medium text-brown mb-1"
          >
            Quantity
          </label>
          <input
            id="return-qty"
            type="number"
            className="input"
            min={1}
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value))}
          />
        </div>

        {/* Notes */}
        <div>
          <label
            htmlFor="return-notes"
            className="block text-sm font-medium text-brown mb-1"
          >
            Notes (optional)
          </label>
          <textarea
            id="return-notes"
            className="input"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <div className="flex gap-3 justify-end">
          <button
            type="button"
            onClick={onClose}
            className="btn-outline"
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="btn-primary"
            disabled={submitting}
          >
            {submitting ? 'Submitting...' : 'Submit Return'}
          </button>
        </div>
      </form>
    </div>
  );
}
