'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import type { Order, OrderStatus, Customer, Invoice } from '@/lib/types';
import { formatCurrency, formatDate, getStatusColor, cn, formatAddress, formatPhone } from '@/lib/utils';
import { adminFetch } from '@/lib/admin-fetch';

const SIZE_LABELS: Record<string, string> = {
  '1/2bbl': '1/2 Barrel',
  '1/4bbl': '1/4 Barrel',
  '1/6bbl': '1/6 Barrel',
};

// Allowed forward transitions from each status. Cancel is always allowed
// from pending or confirmed; complete only from confirmed; confirm only
// from pending. Mirrors the rules in /admin/orders list view so admin
// gets identical affordances either place.
const NEXT_STATUSES: Record<OrderStatus, OrderStatus[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

const STATUS_VERBS: Record<OrderStatus, string> = {
  pending: 'Confirm',
  confirmed: 'Mark completed',
  completed: 'Mark completed',
  cancelled: 'Cancel',
};

export default function OrderDetailPage() {
  const params = useParams<{ id: string }>();
  const orderId = params.id;
  const router = useRouter();

  const [order, setOrder] = useState<Order | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updating, setUpdating] = useState<OrderStatus | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);

  // Fetch the order, its customer, and any linked invoice in parallel.
  // The orders/customers/invoices APIs all return arrays; we find by id.
  // Why not a dedicated /api/orders/[id]? The existing list endpoint is
  // already cached + paginated nowhere; one extra round trip on detail
  // page entry is fine and avoids new server code.
  const load = useCallback(async () => {
    try {
      const [ordersRes, customersRes, invoicesRes] = await Promise.all([
        adminFetch('/api/orders'),
        adminFetch('/api/customers?includeArchived=true'),
        adminFetch('/api/invoices'),
      ]);
      const orders: Order[] = await ordersRes.json();
      const customers: Customer[] = await customersRes.json();
      const invoices: Invoice[] = await invoicesRes.json();

      const o = orders.find((x) => x.id === orderId) || null;
      if (!o) {
        setError('Order not found.');
        return;
      }
      setOrder(o);
      setCustomer(customers.find((c) => c.id === o.customerId) || null);
      // Latest invoice for this order — most orders have exactly one.
      const inv = invoices
        .filter((i) => i.orderId === o.id)
        .sort((a, b) => b.issuedAt.localeCompare(a.issuedAt))[0]
        || null;
      setInvoice(inv);
    } catch (err) {
      console.error('Failed to load order', err);
      setError('Could not load this order. Try refreshing.');
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => { load(); }, [load]);

  // Refetch when nav-refresh fires (e.g., another tab confirmed an order
  // or kegs got reconciled).
  useEffect(() => {
    const onRefresh = () => load();
    window.addEventListener('guidon:nav-refresh', onRefresh);
    return () => window.removeEventListener('guidon:nav-refresh', onRefresh);
  }, [load]);

  const handleStatusChange = async (newStatus: OrderStatus) => {
    if (!order) return;
    setUpdating(newStatus);
    try {
      const res = await adminFetch('/api/orders', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: order.id, status: newStatus }),
      });
      if (res.ok) {
        const updated = await res.json().catch(() => null);
        setOrder(updated ?? { ...order, status: newStatus });
        // Re-fetch invoice / customer in case the status change rippled
        // (confirm creates an invoice; cancel may cascade).
        load();
        // Update sidebar badge counts everywhere.
        window.dispatchEvent(new Event('guidon:nav-refresh'));
      } else {
        const data = await res.json().catch(() => ({}));
        const rawErr = data?.error;
        const msg = typeof rawErr === 'string' && rawErr ? rawErr : `Status change failed (HTTP ${res.status})`;
        alert(msg);
      }
    } catch {
      alert('Network error changing status. Please retry.');
    } finally {
      setUpdating(null);
      setConfirmCancel(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-8 w-1/3" />
        <div className="skeleton h-32 w-full" />
        <div className="skeleton h-48 w-full" />
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="card text-center max-w-md mx-auto mt-12">
        <p className="text-sm" style={{ color: 'var(--ruby)' }}>{error || 'Order not found.'}</p>
        <Link href="/admin/orders" className="btn-primary mt-4 inline-block">
          ← Back to all orders
        </Link>
      </div>
    );
  }

  const itemsSubtotal = order.items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
  const depositsSubtotal = order.items.reduce((s, i) => s + i.deposit * i.quantity, 0);
  const returnsCredit = order.kegReturns.reduce((s, r) => {
    // Lookup the deposit for this size from the FIRST item with the same
    // size (deposit is set per product+size on the order, so any item
    // with that size has the right value). Fallback to 0 if the customer
    // returned a size they didn't order — shouldn't happen but defensive.
    const matching = order.items.find((i) => i.size === r.size);
    return s + (matching?.deposit ?? 0) * r.quantity;
  }, 0);
  const totalKegsOut = order.items.reduce((s, i) => s + i.quantity, 0);
  const totalReturns = order.kegReturns.reduce((s, r) => s + r.quantity, 0);
  const allowed = NEXT_STATUSES[order.status] || [];

  return (
    <div className="space-y-6">
      {/* Top breadcrumb / back link */}
      <div className="flex items-center gap-2 text-sm">
        <Link href="/admin/orders" className="hover:underline" style={{ color: 'var(--brass)' }}>
          ← All orders
        </Link>
      </div>

      {/* Header */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <span className="section-label mb-1 block">Order</span>
          <h2
            className="font-display"
            style={{
              fontSize: '2.5rem',
              fontVariationSettings: "'opsz' 72",
              color: 'var(--ink)',
              fontWeight: 500,
            }}
          >
            {order.id}
          </h2>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm" style={{ color: 'var(--muted)' }}>
            <span className={cn('badge-sm', getStatusColor(order.status))}>{order.status}</span>
            <span>Placed <strong style={{ color: 'var(--ink)' }}>{formatDate(order.createdAt)}</strong></span>
            <span>·</span>
            <span>{totalKegsOut} keg{totalKegsOut === 1 ? '' : 's'} out</span>
            {totalReturns > 0 && (
              <>
                <span>·</span>
                <span style={{ color: 'var(--pine)' }}>{totalReturns} return{totalReturns === 1 ? '' : 's'}</span>
              </>
            )}
          </div>
        </div>

        {/* Status action buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {allowed.map((next) => {
            // Cancel is destructive — gate behind a confirm step.
            if (next === 'cancelled') {
              return confirmCancel ? (
                <div key="cancel-confirm" className="flex items-center gap-2">
                  <button
                    onClick={() => handleStatusChange('cancelled')}
                    disabled={updating !== null}
                    className="text-xs font-heading font-bold px-3 py-2 rounded-lg transition-all disabled:opacity-50"
                    style={{ color: 'var(--ruby)', background: 'color-mix(in srgb, var(--ruby) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--ruby) 45%, transparent)' }}
                  >
                    {updating === 'cancelled' ? 'Cancelling…' : 'Confirm cancel'}
                  </button>
                  <button
                    onClick={() => setConfirmCancel(false)}
                    className="text-xs font-heading font-bold px-3 py-2"
                    style={{ color: 'var(--muted)' }}
                  >
                    Keep
                  </button>
                </div>
              ) : (
                <button
                  key="cancel"
                  onClick={() => setConfirmCancel(true)}
                  className="text-xs font-heading font-bold px-3 py-2 rounded-lg transition-all"
                  style={{ color: 'var(--ruby)', background: 'color-mix(in srgb, var(--ruby) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--ruby) 45%, transparent)' }}
                >
                  Cancel order
                </button>
              );
            }
            // Forward transitions — single click.
            const verb = next === 'confirmed' ? 'Confirm' : next === 'completed' ? 'Mark completed' : STATUS_VERBS[next];
            const color = next === 'completed' ? 'var(--brass)' : 'var(--pine)';
            return (
              <button
                key={next}
                onClick={() => handleStatusChange(next)}
                disabled={updating !== null}
                className="text-xs font-heading font-bold px-3 py-2 rounded-lg transition-all disabled:opacity-50"
                style={{ color, background: `color-mix(in srgb, ${color} 12%, transparent)`, border: `1px solid color-mix(in srgb, ${color} 45%, transparent)` }}
              >
                {updating === next ? `${verb}…` : verb}
              </button>
            );
          })}
          {allowed.length === 0 && (
            <span className="text-xs italic" style={{ color: 'var(--muted)' }}>
              No further status changes (order is {order.status}).
            </span>
          )}
        </div>
      </header>

      {/* Customer block */}
      <section className="card">
        <span className="section-label mb-3 block">Customer</span>
        {customer ? (
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <Link href={`/admin/customers/${customer.id}`}
                className="font-display hover:underline"
                style={{ fontSize: '1.25rem', fontVariationSettings: "'opsz' 24", color: 'var(--ink)', fontWeight: 500 }}>
                {customer.businessName}
              </Link>
              <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
                {customer.contactName}
                {customer.email && (
                  <> · <a href={`mailto:${customer.email}`} style={{ color: 'var(--brass)' }}>{customer.email}</a></>
                )}
                {customer.phone && (
                  <> · <span className="font-variant-tabular">{formatPhone(customer.phone)}</span></>
                )}
              </p>
              {formatAddress(customer) && (
                <p className="text-sm italic mt-1" style={{ color: 'var(--muted)' }}>
                  {formatAddress(customer)}
                </p>
              )}
              <p className="text-xs mt-1" style={{ color: 'var(--faint)' }}>
                ID <span className="font-mono">{customer.id}</span>
                {customer.abcPermitNumber && <> · ABC <span className="font-mono">{customer.abcPermitNumber}</span></>}
                {customer.preferredPaymentMethod && customer.preferredPaymentMethod !== 'no_preference' && (
                  <> · Payment {customer.preferredPaymentMethod === 'check' ? 'Check' : 'Fintech'}</>
                )}
              </p>
            </div>
            <Link href={`/admin/customers/${customer.id}`} className="btn-secondary text-xs px-3 py-2">
              Customer profile →
            </Link>
          </div>
        ) : (
          <p className="text-sm italic" style={{ color: 'var(--muted)' }}>
            Customer record not found (may be deleted).
          </p>
        )}
      </section>

      {/* Items + totals */}
      <section className="card">
        <span className="section-label mb-3 block">Items</span>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--divider)' }}>
                <th className="text-left text-xs uppercase tracking-wider font-semibold py-2" style={{ color: 'var(--muted)' }}>Product</th>
                <th className="text-left text-xs uppercase tracking-wider font-semibold py-2" style={{ color: 'var(--muted)' }}>Size</th>
                <th className="text-right text-xs uppercase tracking-wider font-semibold py-2" style={{ color: 'var(--muted)' }}>Qty</th>
                <th className="text-right text-xs uppercase tracking-wider font-semibold py-2" style={{ color: 'var(--muted)' }}>Unit</th>
                <th className="text-right text-xs uppercase tracking-wider font-semibold py-2" style={{ color: 'var(--muted)' }}>Deposit</th>
                <th className="text-right text-xs uppercase tracking-wider font-semibold py-2" style={{ color: 'var(--muted)' }}>Line total</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((item) => (
                <tr key={`${item.productId}-${item.size}`} style={{ borderBottom: '1px dotted var(--divider)' }}>
                  <td className="py-2 text-sm font-medium" style={{ color: 'var(--ink)' }}>{item.productName}</td>
                  <td className="py-2 text-sm italic" style={{ color: 'var(--muted)' }}>{SIZE_LABELS[item.size] || item.size}</td>
                  <td className="py-2 text-sm text-right font-variant-tabular">{item.quantity}</td>
                  <td className="py-2 text-sm text-right font-variant-tabular">{formatCurrency(item.unitPrice)}</td>
                  <td className="py-2 text-sm text-right font-variant-tabular">{formatCurrency(item.deposit * item.quantity)}</td>
                  <td className="py-2 text-sm text-right font-semibold font-variant-tabular">
                    {formatCurrency(item.unitPrice * item.quantity + item.deposit * item.quantity)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Keg returns block */}
        {order.kegReturns.length > 0 && (
          <div className="mt-4 rounded-xl px-4 py-3" style={{ background: 'color-mix(in srgb, var(--pine) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--pine) 30%, transparent)' }}>
            <span className="section-label mb-1 block" style={{ color: 'var(--pine)' }}>Keg Returns</span>
            <ul className="text-sm">
              {order.kegReturns.map((r) => (
                <li key={r.size} style={{ color: 'var(--pine)' }}>
                  <span className="font-semibold font-variant-tabular inline-block w-6">{r.quantity}</span>
                  <span className="italic" style={{ color: 'var(--muted)' }}>{SIZE_LABELS[r.size] || r.size}</span>
                  <span className="ml-2" style={{ color: 'var(--muted)' }}>(deposit credit applied to net)</span>
                </li>
              ))}
            </ul>
            <p className="text-[10px] italic mt-1" style={{ color: 'var(--muted)' }}>
              Returns become balance credits only after admin manually approves them in the Keg Tracker.
            </p>
          </div>
        )}

        {/* Totals */}
        <div className="mt-4 pt-3 border-t border-divider grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div className="space-y-1" style={{ color: 'var(--muted)' }}>
            {order.notes && (
              <div>
                <span className="section-label mb-0.5 block">Notes</span>
                <p className="text-sm italic" style={{ color: 'var(--ink)' }}>{order.notes}</p>
              </div>
            )}
          </div>
          <div className="ml-auto w-full sm:max-w-xs space-y-1">
            <div className="flex justify-between">
              <span style={{ color: 'var(--muted)' }}>Items subtotal</span>
              <span className="font-variant-tabular" style={{ color: 'var(--ink)' }}>{formatCurrency(itemsSubtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span style={{ color: 'var(--muted)' }}>Deposits out</span>
              <span className="font-variant-tabular" style={{ color: 'var(--ink)' }}>{formatCurrency(depositsSubtotal)}</span>
            </div>
            {returnsCredit > 0 && (
              <div className="flex justify-between">
                <span style={{ color: 'var(--pine)' }}>Returns credit</span>
                <span className="font-variant-tabular" style={{ color: 'var(--pine)' }}>−{formatCurrency(returnsCredit)}</span>
              </div>
            )}
            <div className="flex justify-between pt-2 border-t border-divider">
              <span style={{ color: 'var(--ink)', fontWeight: 600 }}>Total due on delivery</span>
              <span className="font-display font-variant-tabular" style={{ fontSize: '1.25rem', color: 'var(--brass)', fontVariationSettings: "'opsz' 24", fontWeight: 500 }}>
                {formatCurrency(order.total)}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Invoice block (if any) */}
      <section className="card">
        <div className="flex items-center justify-between mb-2">
          <span className="section-label">Invoice</span>
          {invoice && (
            <Link href="/admin/invoices" className="text-xs italic" style={{ color: 'var(--brass)' }}>
              All invoices →
            </Link>
          )}
        </div>
        {invoice ? (
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <div>
              <p className="font-semibold" style={{ color: 'var(--ink)' }}>
                {invoice.id}{' '}
                <span className={cn('badge-sm', getStatusColor(invoice.status))}>{invoice.status}</span>
              </p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
                Issued {formatDate(invoice.issuedAt)}
                {invoice.sentAt && <> · sent {formatDate(invoice.sentAt)}</>}
                {invoice.paidAt && <> · paid {formatDate(invoice.paidAt)}</>}
              </p>
            </div>
            <div className="font-variant-tabular text-right">
              <p className="font-semibold" style={{ color: 'var(--ink)' }}>{formatCurrency(invoice.total)}</p>
            </div>
          </div>
        ) : (
          <p className="text-sm italic" style={{ color: 'var(--muted)' }}>
            No invoice yet. {order.status === 'pending' && 'Confirm the order to auto-generate one.'}
          </p>
        )}
      </section>

      {/* Bottom navigation */}
      <div className="flex justify-between text-sm pt-2">
        <Link href="/admin/orders" className="hover:underline" style={{ color: 'var(--muted)' }}>
          ← All orders
        </Link>
        <button
          onClick={() => router.refresh()}
          className="hover:underline"
          style={{ color: 'var(--muted)' }}
        >
          Refresh
        </button>
      </div>
    </div>
  );
}
