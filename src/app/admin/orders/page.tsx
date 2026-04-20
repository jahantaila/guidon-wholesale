'use client';

import { useState, useEffect, useCallback, useMemo, Fragment } from 'react';
import Link from 'next/link';
import { Order, OrderStatus, Customer, Invoice } from '@/lib/types';
import { formatCurrency, formatDate, getStatusColor, cn } from '@/lib/utils';
import { adminFetch } from '@/lib/admin-fetch';

const STATUS_FLOW: OrderStatus[] = ['pending', 'confirmed', 'delivered', 'completed'];

const STATUS_DESCRIPTIONS: Record<OrderStatus, string> = {
  pending: 'Customer placed the order. Awaiting admin review — inventory is not yet reserved.',
  confirmed: 'Admin has committed to delivering this order. Inventory is now reserved (kegs subtract from stock).',
  delivered: 'Kegs left the brewery and reached the customer. Keg deposits post to the customer\u2019s ledger; invoice becomes sendable.',
  completed: 'Order fully paid + kegs either returned or written off. Closed out.',
  cancelled: 'Order voided before delivery. Inventory was restored if it had been reserved. Invoice is left in draft for the admin to clean up.',
};

// What the next status action looks like on a button
const STATUS_ACTION: Record<OrderStatus, { next?: OrderStatus; label: string; color: string }> = {
  pending: { next: 'confirmed', label: 'Confirm order', color: 'var(--brass)' },
  confirmed: { next: 'delivered', label: 'Mark delivered', color: 'var(--pine)' },
  delivered: { next: 'completed', label: 'Mark completed', color: 'var(--olive)' },
  completed: { label: 'Completed', color: 'var(--muted)' },
  cancelled: { label: 'Cancelled', color: 'var(--muted)' },
};

type ViewMode = 'table' | 'kanban';

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<OrderStatus | 'all'>('all');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
  const [reminderToast, setReminderToast] = useState<string>('');
  const [view, setView] = useState<ViewMode>('table');

  useEffect(() => {
    async function load() {
      try {
        const [ordersRes, customersRes, invoicesRes] = await Promise.all([
          adminFetch('/api/orders', { cache: 'no-store' }),
          adminFetch('/api/customers', { cache: 'no-store' }),
          adminFetch('/api/invoices', { cache: 'no-store' }),
        ]);
        const ordersData = await ordersRes.json().catch(() => []);
        const customersData = await customersRes.json().catch(() => []);
        const invoicesData = await invoicesRes.json().catch(() => []);
        setOrders(Array.isArray(ordersData) ? ordersData : []);
        setCustomers(Array.isArray(customersData) ? customersData : []);
        setInvoices(Array.isArray(invoicesData) ? invoicesData : []);
      } catch (err) {
        console.error('Failed to load orders', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const customerMap = new Map(customers.map((c) => [c.id, c]));
  const invoiceByOrderId = useMemo(() => {
    const m = new Map<string, Invoice>();
    invoices.forEach((i) => m.set(i.orderId, i));
    return m;
  }, [invoices]);

  const handleStatusChange = useCallback(async (order: Order, newStatus: OrderStatus) => {
    setUpdating(order.id);
    try {
      const res = await adminFetch('/api/orders', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: order.id, status: newStatus }),
      });
      if (res.ok) {
        const updated = await res.json().catch(() => null);
        setOrders((prev) => prev.map((o) => (o.id === order.id ? (updated ?? { ...o, status: newStatus }) : o)));
      } else {
        // Surface the server's error so the user doesn't stare at a button
        // that silently does nothing. Most common causes: FK / keg_ledger
        // insert failure, or stale admin session.
        const data = await res.json().catch(() => ({}));
        setReminderToast(data?.error || `Failed to mark ${newStatus} (HTTP ${res.status}).`);
        window.setTimeout(() => setReminderToast(''), 6000);
      }
    } catch (err) {
      console.error('Failed to update order status', err);
      setReminderToast('Network error updating order.');
      window.setTimeout(() => setReminderToast(''), 6000);
    } finally {
      setUpdating(null);
    }
  }, []);

  // Inline delivery-date edit from the order expand row. Admin can change
  // when they'll deliver without touching Supabase.
  const updateDeliveryDate = useCallback(async (order: Order, newDate: string) => {
    if (!newDate || newDate === order.deliveryDate) return;
    setUpdating(order.id);
    try {
      const res = await adminFetch('/api/orders', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: order.id, deliveryDate: newDate }),
      });
      if (res.ok) {
        const updated = await res.json().catch(() => null);
        setOrders((prev) => prev.map((o) => (o.id === order.id ? (updated ?? { ...o, deliveryDate: newDate }) : o)));
        setReminderToast(`Delivery for ${order.id} moved to ${newDate}.`);
      } else {
        const data = await res.json().catch(() => ({}));
        setReminderToast(data?.error || `Failed to update delivery date.`);
      }
    } catch {
      setReminderToast('Network error updating delivery date.');
    } finally {
      setUpdating(null);
      window.setTimeout(() => setReminderToast(''), 4000);
    }
  }, []);

  const sendReminder = useCallback(async (order: Order) => {
    try {
      const res = await adminFetch('/api/admin/remind-kegs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order.id }),
      });
      if (res.ok) {
        setReminderToast(`Reminder email sent for ${order.id}.`);
      } else {
        const data = await res.json().catch(() => ({}));
        setReminderToast(data.error || 'Reminder failed.');
      }
    } catch {
      setReminderToast('Reminder failed.');
    } finally {
      window.setTimeout(() => setReminderToast(''), 3500);
    }
  }, []);

  const filtered = filter === 'all' ? orders : orders.filter((o) => o.status === filter);
  const searched = search
    ? filtered.filter((o) => {
        const cust = customerMap.get(o.customerId);
        const q = search.toLowerCase();
        return (
          o.id.toLowerCase().includes(q) ||
          (cust?.businessName || '').toLowerCase().includes(q)
        );
      })
    : filtered;
  const sorted = [...searched].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  return (
    <div className="space-y-6">
      {reminderToast && <div className="toast">{reminderToast}</div>}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <span className="section-label mb-1 block">Management</span>
          <h2
            className="font-display"
            style={{
              fontSize: '2.5rem',
              fontVariationSettings: "'opsz' 72",
              color: 'var(--ink)',
              fontWeight: 500,
            }}
          >
            Orders
          </h2>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="text"
            placeholder="Search orders..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input max-w-xs text-sm flex-1 sm:flex-initial"
          />
          {/* View toggle */}
          <div className="flex border border-divider" style={{ borderRadius: '3px', overflow: 'hidden' }}>
            <button
              onClick={() => setView('table')}
              className="px-3 py-1.5 text-xs font-ui font-semibold"
              style={{
                background: view === 'table' ? 'var(--brass)' : 'transparent',
                color: view === 'table' ? 'var(--paper)' : 'var(--ink)',
              }}
            >
              Table
            </button>
            <button
              onClick={() => setView('kanban')}
              className="px-3 py-1.5 text-xs font-ui font-semibold"
              style={{
                background: view === 'kanban' ? 'var(--brass)' : 'transparent',
                color: view === 'kanban' ? 'var(--paper)' : 'var(--ink)',
              }}
            >
              Kanban
            </button>
          </div>
          <a
            href="/api/orders/export"
            className="btn-ghost text-xs px-3 py-1.5 border border-divider"
            title="Download all orders as CSV"
            style={{ borderRadius: '3px' }}
          >
            Export CSV
          </a>
        </div>
      </div>

      {/* Status filter tabs with descriptions */}
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          {(['all', ...STATUS_FLOW] as const).map((status) => {
            const count =
              status === 'all' ? orders.length : orders.filter((o) => o.status === status).length;
            const desc =
              status === 'all'
                ? 'Every order across all stages.'
                : STATUS_DESCRIPTIONS[status];
            return (
              <button
                key={status}
                onClick={() => setFilter(status)}
                title={desc}
                className="px-3 py-1.5 text-xs font-ui font-semibold border transition-colors"
                style={{
                  borderRadius: '3px',
                  borderColor: filter === status ? 'var(--brass)' : 'var(--divider)',
                  background: filter === status ? 'var(--brass)' : 'transparent',
                  color: filter === status ? 'var(--paper)' : 'var(--ink)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                }}
              >
                {status === 'all' ? 'All' : status} <span style={{ opacity: 0.6 }}>({count})</span>
              </button>
            );
          })}
        </div>
        {/* Description for the currently active filter — gives new admins
            context on what each stage means. */}
        {filter !== 'all' && (
          <p className="text-sm italic" style={{ color: 'var(--muted)' }}>
            <strong style={{ color: 'var(--ink)', textTransform: 'capitalize' }}>{filter}:</strong>{' '}
            {STATUS_DESCRIPTIONS[filter]}
          </p>
        )}
      </div>

      {/* Body */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="skeleton h-12 w-full" />
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <p className="italic" style={{ color: 'var(--muted)' }}>No orders found.</p>
      ) : view === 'kanban' ? (
        <KanbanView
          orders={sorted}
          customerMap={customerMap}
          onStatusChange={handleStatusChange}
          updating={updating}
        />
      ) : (
        <TableView
          orders={sorted}
          customerMap={customerMap}
          invoiceByOrderId={invoiceByOrderId}
          expandedId={expandedId}
          setExpandedId={setExpandedId}
          onStatusChange={handleStatusChange}
          sendReminder={sendReminder}
          updateDeliveryDate={updateDeliveryDate}
          updating={updating}
        />
      )}
    </div>
  );
}

function TableView({
  orders,
  customerMap,
  invoiceByOrderId,
  expandedId,
  setExpandedId,
  onStatusChange,
  sendReminder,
  updateDeliveryDate,
  updating,
}: {
  orders: Order[];
  customerMap: Map<string, Customer>;
  invoiceByOrderId: Map<string, Invoice>;
  expandedId: string | null;
  setExpandedId: (id: string | null) => void;
  onStatusChange: (o: Order, next: OrderStatus) => void;
  sendReminder: (o: Order) => void;
  updateDeliveryDate: (o: Order, newDate: string) => void;
  updating: string | null;
}) {
  return (
    <table className="w-full">
      <thead>
        <tr>
          <th className="table-header">Order ID</th>
          <th className="table-header">Customer</th>
          <th className="table-header">Date</th>
          <th className="table-header">Delivery</th>
          <th className="table-header">Items</th>
          <th className="table-header">Status</th>
          <th className="table-header text-right">Total</th>
          <th className="table-header text-right">Action</th>
        </tr>
      </thead>
      <tbody>
        {orders.map((order) => {
          const isExpanded = expandedId === order.id;
          const action = STATUS_ACTION[order.status];
          return (
            <Fragment key={order.id}>
              <tr
                onClick={() => setExpandedId(isExpanded ? null : order.id)}
                style={{ cursor: 'pointer' }}
                className="hover:opacity-80 transition-opacity"
              >
                <td className="table-cell font-semibold">{order.id}</td>
                <td className="table-cell">
                  {customerMap.get(order.customerId)?.businessName || order.customerId}
                </td>
                <td className="table-cell font-variant-tabular">{formatDate(order.createdAt)}</td>
                <td className="table-cell font-variant-tabular">
                  {(() => {
                    const now = new Date(); now.setHours(0, 0, 0, 0);
                    const dd = new Date(order.deliveryDate);
                    const overdue = (order.status === 'pending' || order.status === 'confirmed') && dd < now;
                    return (
                      <span style={{ color: overdue ? 'var(--ruby)' : undefined }} title={overdue ? 'Past delivery date without being marked delivered' : undefined}>
                        {formatDate(order.deliveryDate)}
                        {overdue && <span className="ml-1 text-[9px] uppercase tracking-wider">· late</span>}
                      </span>
                    );
                  })()}
                </td>
                <td className="table-cell text-right font-variant-tabular">{order.items.length}</td>
                <td className="table-cell">
                  <span className={cn('badge-sm', getStatusColor(order.status))}>{order.status}</span>
                </td>
                <td className="table-cell text-right font-semibold font-variant-tabular">
                  {formatCurrency(order.total)}
                </td>
                <td className="table-cell text-right" onClick={(e) => e.stopPropagation()}>
                  {action.next ? (
                    <button
                      onClick={() => onStatusChange(order, action.next!)}
                      disabled={updating === order.id}
                      className="btn-ghost text-xs"
                      style={{ color: action.color, fontWeight: 600 }}
                    >
                      {updating === order.id ? '…' : `${action.label} \u2192`}
                    </button>
                  ) : (
                    <span
                      className="section-label"
                      style={{ color: 'var(--muted)' }}
                    >
                      {action.label}
                    </span>
                  )}
                </td>
              </tr>
              {isExpanded && (
                <tr>
                  <td colSpan={8} style={{ padding: '1rem 1rem 1.5rem', background: 'color-mix(in srgb, var(--surface) 50%, transparent)' }}>
                    <div className="space-y-3">
                      <div>
                        <span className="section-label mb-2 block">Order Items</span>
                        <table className="w-full text-sm">
                          <thead>
                            <tr>
                              <th className="text-left py-1 text-xs font-ui section-label">Product</th>
                              <th className="text-left py-1 text-xs font-ui section-label">Size</th>
                              <th className="text-right py-1 text-xs font-ui section-label">Qty</th>
                              <th className="text-right py-1 text-xs font-ui section-label">Price</th>
                              <th className="text-right py-1 text-xs font-ui section-label">Deposit</th>
                            </tr>
                          </thead>
                          <tbody>
                            {order.items.map((item, idx) => (
                              <tr key={idx} style={{ borderTop: '1px solid var(--divider)' }}>
                                <td className="py-1.5" style={{ color: 'var(--ink)' }}>{item.productName}</td>
                                <td className="py-1.5 font-variant-tabular" style={{ color: 'var(--muted)' }}>{item.size}</td>
                                <td className="py-1.5 text-right font-variant-tabular">{item.quantity}</td>
                                <td className="py-1.5 text-right font-variant-tabular" style={{ color: 'var(--muted)' }}>{formatCurrency(item.unitPrice)}</td>
                                <td className="py-1.5 text-right font-variant-tabular" style={{ color: 'var(--muted)' }}>{formatCurrency(item.deposit)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {order.kegReturns.length > 0 && (
                        <div>
                          <span className="section-label mb-2 block" style={{ color: 'var(--pine)' }}>Keg Returns</span>
                          <div className="flex gap-3">
                            {order.kegReturns.map((kr, idx) => (
                              <span key={idx} className="badge-sm" style={{ color: 'var(--pine)', borderColor: 'var(--pine)' }}>
                                {kr.size}: {kr.quantity}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      <div className="flex gap-6 text-sm pt-2 border-t border-divider">
                        <span style={{ color: 'var(--muted)' }}>
                          Subtotal:{' '}
                          <strong className="font-variant-tabular" style={{ color: 'var(--ink)' }}>
                            {formatCurrency(order.subtotal)}
                          </strong>
                        </span>
                        <span style={{ color: 'var(--muted)' }}>
                          Deposits:{' '}
                          <strong className="font-variant-tabular" style={{ color: 'var(--ink)' }}>
                            {formatCurrency(order.totalDeposit)}
                          </strong>
                        </span>
                        <span style={{ color: 'var(--muted)' }}>
                          Total:{' '}
                          <strong className="font-variant-tabular" style={{ color: 'var(--brass)' }}>
                            {formatCurrency(order.total)}
                          </strong>
                        </span>
                      </div>
                      {order.notes && (
                        <p className="text-sm italic" style={{ color: 'var(--muted)' }}>
                          Notes: {order.notes}
                        </p>
                      )}
                      {/* Inline delivery-date edit for pending/confirmed orders.
                          Customer calls to push back delivery — admin can adjust
                          without touching Supabase. Disabled once delivered. */}
                      {(order.status === 'pending' || order.status === 'confirmed') && (
                        <div className="flex items-center gap-3 pt-2 border-t border-divider text-sm">
                          <span className="section-label" style={{ color: 'var(--muted)' }}>Delivery date</span>
                          <input
                            type="date"
                            defaultValue={order.deliveryDate}
                            onBlur={(e) => updateDeliveryDate(order, e.target.value)}
                            className="input text-xs max-w-[160px]"
                            disabled={updating === order.id}
                          />
                          <span className="text-xs italic" style={{ color: 'var(--muted)' }}>
                            Saves on blur.
                          </span>
                        </div>
                      )}
                      {/* Invoice link — drops admin straight into billing context */}
                      <div className="flex items-center gap-3 pt-2 border-t border-divider text-sm">
                        <span className="section-label" style={{ color: 'var(--muted)' }}>Invoice</span>
                        {(() => {
                          const inv = invoiceByOrderId.get(order.id);
                          if (!inv) {
                            return (
                              <Link href="/admin/invoices" className="font-semibold hover:underline" style={{ color: 'var(--brass)' }}>
                                None yet — create on Invoices page &rarr;
                              </Link>
                            );
                          }
                          return (
                            <>
                              <Link href="/admin/invoices" className="font-semibold hover:underline" style={{ color: 'var(--ink)' }}>
                                {inv.id}
                              </Link>
                              <span className={cn('badge-sm', getStatusColor(inv.status))}>{inv.status}</span>
                              {inv.sentAt && (
                                <span style={{ color: 'var(--muted)' }} className="text-xs italic">
                                  sent {formatDate(inv.sentAt)}
                                </span>
                              )}
                            </>
                          );
                        })()}
                      </div>
                      {(order.status === 'pending' || order.status === 'confirmed') && (
                        <div className="flex items-center gap-3 pt-2 border-t border-divider">
                          <button
                            onClick={() => {
                              if (confirm(`Cancel order ${order.id}? This restores reserved inventory.`)) {
                                onStatusChange(order, 'cancelled');
                              }
                            }}
                            className="btn-ghost text-xs"
                            style={{ color: 'var(--ruby)' }}
                            title="Void this order. Restores inventory if it was confirmed."
                          >
                            Cancel order
                          </button>
                          <span className="text-xs italic" style={{ color: 'var(--muted)' }}>
                            Inventory will be restored; draft invoice will stay in the Invoices tab for cleanup.
                          </span>
                        </div>
                      )}
                      {(order.status === 'delivered' || order.status === 'completed') && (
                        <div className="flex items-center gap-3 pt-2 border-t border-divider">
                          <button
                            onClick={() => sendReminder(order)}
                            className="btn-secondary text-xs"
                            title="Email the customer reminding them to return outstanding kegs"
                          >
                            Remind about kegs
                          </button>
                          <span className="text-xs italic" style={{ color: 'var(--muted)' }}>
                            Sends a letterpress-styled email asking them to request a return via the portal.
                          </span>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

function KanbanView({
  orders,
  customerMap,
  onStatusChange,
  updating,
}: {
  orders: Order[];
  customerMap: Map<string, Customer>;
  onStatusChange: (o: Order, next: OrderStatus) => void;
  updating: string | null;
}) {
  const columns: OrderStatus[] = STATUS_FLOW;
  const byStatus = new Map<OrderStatus, Order[]>(
    columns.map((s) => [s, orders.filter((o) => o.status === s)]),
  );

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {columns.map((status) => {
        const colOrders = byStatus.get(status) || [];
        const action = STATUS_ACTION[status];
        return (
          <div key={status} className="min-w-0">
            <div className="pb-2 mb-3 border-b-2" style={{ borderColor: 'var(--brass)' }}>
              <div className="flex items-baseline justify-between">
                <span className="section-label" style={{ textTransform: 'uppercase' }}>
                  {status}
                </span>
                <span className="font-variant-tabular text-sm" style={{ color: 'var(--muted)' }}>
                  {colOrders.length}
                </span>
              </div>
              <p className="text-xs italic mt-1" style={{ color: 'var(--muted)' }}>
                {STATUS_DESCRIPTIONS[status]}
              </p>
            </div>
            <div className="space-y-3">
              {colOrders.length === 0 ? (
                <p className="text-sm italic" style={{ color: 'var(--faint)' }}>—</p>
              ) : (
                colOrders.map((order) => (
                  <div
                    key={order.id}
                    className="p-3 border border-divider"
                    style={{ borderRadius: '4px', background: 'var(--surface)' }}
                  >
                    <div className="flex items-baseline justify-between mb-1">
                      <span className="font-semibold" style={{ color: 'var(--ink)' }}>
                        {order.id}
                      </span>
                      <span className="font-semibold font-variant-tabular text-sm" style={{ color: 'var(--brass)' }}>
                        {formatCurrency(order.total)}
                      </span>
                    </div>
                    <p className="text-sm mb-1" style={{ color: 'var(--ink)' }}>
                      {customerMap.get(order.customerId)?.businessName || order.customerId}
                    </p>
                    <p className="text-xs font-variant-tabular" style={{ color: 'var(--muted)' }}>
                      {order.items.length} item{order.items.length === 1 ? '' : 's'} &middot;{' '}
                      delivery {formatDate(order.deliveryDate)}
                    </p>
                    {action.next && (
                      <button
                        onClick={() => onStatusChange(order, action.next!)}
                        disabled={updating === order.id}
                        className="btn-ghost text-xs mt-2"
                        style={{ color: action.color, fontWeight: 600, paddingLeft: 0 }}
                      >
                        {updating === order.id ? '…' : `${action.label} \u2192`}
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
