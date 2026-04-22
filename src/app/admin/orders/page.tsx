'use client';

import { useState, useEffect, useCallback, useMemo, Fragment } from 'react';
import Link from 'next/link';
import { Order, OrderStatus, Customer, Invoice } from '@/lib/types';
import { formatCurrency, formatDate, getStatusColor, cn } from '@/lib/utils';
import { adminFetch } from '@/lib/admin-fetch';

const STATUS_FLOW: OrderStatus[] = ['pending', 'confirmed', 'completed'];

const STATUS_DESCRIPTIONS: Record<OrderStatus, string> = {
  pending: 'Customer placed the order. Awaiting admin review — inventory is not yet reserved.',
  confirmed: 'Admin has committed to the order. Inventory is reserved, keg deposits post to the customer\u2019s ledger, and the invoice becomes sendable.',
  completed: 'Order fully paid + kegs either returned or written off. Closed out.',
  cancelled: 'Order voided before delivery. Inventory was restored if it had been reserved. Invoice is left in draft for the admin to clean up.',
};

// What the next status action looks like on a button
const STATUS_ACTION: Record<OrderStatus, { next?: OrderStatus; label: string; color: string }> = {
  pending: { next: 'confirmed', label: 'Confirm order', color: 'var(--brass)' },
  confirmed: { next: 'completed', label: 'Mark completed', color: 'var(--olive)' },
  completed: { label: 'Completed', color: 'var(--muted)' },
  cancelled: { label: 'Cancelled', color: 'var(--muted)' },
};

type ViewMode = 'cards' | 'table' | 'kanban';

// Delivery-window quick chips. "This week" = today through Sunday end-of-day.
// Overdue = pending or confirmed with a deliveryDate before today.
type DeliveryWindow = 'all' | 'today' | 'this-week' | 'overdue';

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<OrderStatus | 'all'>('all');
  const [search, setSearch] = useState('');
  const [customerFilter, setCustomerFilter] = useState<string>('all'); // customer id or 'all'
  const [deliveryWindow, setDeliveryWindow] = useState<DeliveryWindow>('all');
  const [placedFrom, setPlacedFrom] = useState<string>('');
  const [placedTo, setPlacedTo] = useState<string>('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
  const [reminderToast, setReminderToast] = useState<string>('');
  const [view, setView] = useState<ViewMode>('cards');

  useEffect(() => {
    async function load() {
      try {
        const [ordersRes, customersRes, invoicesRes] = await Promise.all([
          adminFetch('/api/orders', { cache: 'no-store' }),
          // includeArchived so orders from archived accounts keep their
          // business name on the list, not a blank / fallback label.
          adminFetch('/api/customers?includeArchived=true', { cache: 'no-store' }),
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
        // Trigger instant sidebar badge refresh (pending + confirmed count
        // changes when an order transitions). Event is picked up by the
        // admin layout's listener; see admin/layout.tsx.
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event('guidon:nav-refresh'));
        }
      } else {
        // Surface the server's error so the user doesn't stare at a button
        // that silently does nothing. Most common causes: FK / keg_ledger
        // insert failure, or stale admin session.
        const data = await res.json().catch(() => ({}));
        const rawErr = data?.error;
        // Ensure we never show "[object Object]" from a non-string error.
        const msg = typeof rawErr === 'string' && rawErr
          ? rawErr
          : rawErr
          ? JSON.stringify(rawErr)
          : `Failed to mark ${newStatus} (HTTP ${res.status}).`;
        setReminderToast(msg);
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

  // Filter pipeline — composes status + customer + delivery window + date
  // range + free-text search. AND across filters. Kept as a single useMemo
  // so we don't recompute date boundaries on every render.
  const sorted = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().slice(0, 10);
    // End of current week = upcoming Sunday (Sunday = 0 in getDay).
    const weekEnd = new Date(today);
    const daysUntilSunday = (7 - today.getDay()) % 7; // today is Sunday -> 0
    weekEnd.setDate(today.getDate() + (daysUntilSunday === 0 ? 7 : daysUntilSunday));
    const weekEndStr = weekEnd.toISOString().slice(0, 10);

    const isOpenForDelivery = (o: Order) =>
      o.status === 'pending' || o.status === 'confirmed';

    const q = search.trim().toLowerCase();
    const filteredOrders = orders.filter((o) => {
      // Status
      if (filter !== 'all' && o.status !== filter) return false;
      // Customer
      if (customerFilter !== 'all' && o.customerId !== customerFilter) return false;
      // Delivery window
      if (deliveryWindow !== 'all') {
        const dd = o.deliveryDate;
        if (!dd) return false;
        if (deliveryWindow === 'today' && dd !== todayStr) return false;
        if (deliveryWindow === 'this-week' && (dd < todayStr || dd > weekEndStr)) return false;
        if (deliveryWindow === 'overdue' && !(isOpenForDelivery(o) && dd < todayStr)) return false;
      }
      // Date placed range
      if (placedFrom || placedTo) {
        const placed = o.createdAt.slice(0, 10);
        if (placedFrom && placed < placedFrom) return false;
        if (placedTo && placed > placedTo) return false;
      }
      // Search by id / business name / product name
      if (q) {
        const cust = customerMap.get(o.customerId);
        const haystack = [
          o.id,
          cust?.businessName || '',
          cust?.contactName || '',
          ...o.items.map((i) => i.productName),
        ].join(' ').toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });

    return filteredOrders.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [orders, filter, customerFilter, deliveryWindow, placedFrom, placedTo, search, customerMap]);

  // Count of orders matching each delivery-window chip (for the chip's number).
  const windowCounts = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().slice(0, 10);
    const weekEnd = new Date(today);
    const daysUntilSunday = (7 - today.getDay()) % 7;
    weekEnd.setDate(today.getDate() + (daysUntilSunday === 0 ? 7 : daysUntilSunday));
    const weekEndStr = weekEnd.toISOString().slice(0, 10);
    let todayN = 0, thisWeekN = 0, overdueN = 0;
    for (const o of orders) {
      const dd = o.deliveryDate;
      if (!dd) continue;
      if (dd === todayStr) todayN++;
      if (dd >= todayStr && dd <= weekEndStr) thisWeekN++;
      if ((o.status === 'pending' || o.status === 'confirmed') && dd < todayStr) overdueN++;
    }
    return { today: todayN, thisWeek: thisWeekN, overdue: overdueN };
  }, [orders]);

  const activeCustomers = useMemo(() => {
    // Only customers that actually have orders on file — keeps the dropdown
    // useful instead of listing every business.
    const withOrders = new Set(orders.map((o) => o.customerId));
    return customers
      .filter((c) => withOrders.has(c.id))
      .sort((a, b) => a.businessName.localeCompare(b.businessName));
  }, [orders, customers]);

  const filtersActive =
    filter !== 'all' ||
    customerFilter !== 'all' ||
    deliveryWindow !== 'all' ||
    placedFrom !== '' ||
    placedTo !== '' ||
    search.trim() !== '';

  const clearFilters = () => {
    setFilter('all');
    setCustomerFilter('all');
    setDeliveryWindow('all');
    setPlacedFrom('');
    setPlacedTo('');
    setSearch('');
  };

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
            placeholder="Search by order, customer, or beer..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input max-w-xs text-sm flex-1 sm:flex-initial"
          />
          {/* View toggle — Cards is the default dense view for scanning the
              book; Table is compact for bulk actions; Kanban is for stage
              review. */}
          <div className="flex border border-divider" style={{ borderRadius: '3px', overflow: 'hidden' }}>
            {(['cards', 'table', 'kanban'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setView(m)}
                className="px-3 py-1.5 text-xs font-ui font-semibold transition-colors"
                style={{
                  background: view === m ? 'var(--brass)' : 'transparent',
                  color: view === m ? 'var(--paper)' : 'var(--ink)',
                  textTransform: 'capitalize',
                }}
              >
                {m}
              </button>
            ))}
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

      {/* Filters — status tabs on top, then delivery-window + customer + date
          range on a second row. All compose with the search box. */}
      <div className="space-y-3">
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

        <div className="flex flex-wrap items-center gap-2 text-xs">
          {/* Delivery-window chips */}
          <span className="section-label mr-1" style={{ color: 'var(--muted)' }}>Delivery:</span>
          {([
            { key: 'all', label: 'Any', n: null },
            { key: 'today', label: 'Today', n: windowCounts.today },
            { key: 'this-week', label: 'This week', n: windowCounts.thisWeek },
            { key: 'overdue', label: 'Overdue', n: windowCounts.overdue },
          ] as const).map((chip) => (
            <button
              key={chip.key}
              onClick={() => setDeliveryWindow(chip.key)}
              className="px-2.5 py-1 font-ui font-semibold border transition-colors"
              style={{
                borderRadius: '3px',
                borderColor:
                  deliveryWindow === chip.key
                    ? 'var(--brass)'
                    : chip.key === 'overdue' && (chip.n ?? 0) > 0
                      ? 'var(--ruby)'
                      : 'var(--divider)',
                background: deliveryWindow === chip.key ? 'var(--brass)' : 'transparent',
                color:
                  deliveryWindow === chip.key
                    ? 'var(--paper)'
                    : chip.key === 'overdue' && (chip.n ?? 0) > 0
                      ? 'var(--ruby)'
                      : 'var(--ink)',
              }}
            >
              {chip.label}
              {chip.n !== null && <span style={{ opacity: 0.6, marginLeft: 4 }}>({chip.n})</span>}
            </button>
          ))}

          {/* Customer dropdown */}
          <span className="section-label ml-3 mr-1" style={{ color: 'var(--muted)' }}>Customer:</span>
          <select
            value={customerFilter}
            onChange={(e) => setCustomerFilter(e.target.value)}
            className="input text-xs py-1"
            style={{ minWidth: 160 }}
          >
            <option value="all">All customers</option>
            {activeCustomers.map((c) => (
              <option key={c.id} value={c.id}>{c.businessName}</option>
            ))}
          </select>

          {/* Date-placed range */}
          <span className="section-label ml-3 mr-1" style={{ color: 'var(--muted)' }}>Placed:</span>
          <input
            type="date"
            value={placedFrom}
            onChange={(e) => setPlacedFrom(e.target.value)}
            aria-label="From date"
            className="input text-xs py-1"
            style={{ maxWidth: 140 }}
          />
          <span style={{ color: 'var(--muted)' }}>to</span>
          <input
            type="date"
            value={placedTo}
            onChange={(e) => setPlacedTo(e.target.value)}
            aria-label="To date"
            className="input text-xs py-1"
            style={{ maxWidth: 140 }}
          />

          {filtersActive && (
            <button
              onClick={clearFilters}
              className="btn-ghost text-xs px-2 py-1 ml-auto italic"
              style={{ color: 'var(--muted)' }}
            >
              Clear filters
            </button>
          )}
        </div>

        {/* Active-status caption kept so admins learn what each stage means. */}
        {filter !== 'all' && (
          <p className="text-sm italic" style={{ color: 'var(--muted)' }}>
            <strong style={{ color: 'var(--ink)', textTransform: 'capitalize' }}>{filter}:</strong>{' '}
            {STATUS_DESCRIPTIONS[filter]}
          </p>
        )}

        {/* Result count when filters active */}
        {filtersActive && (
          <p className="text-xs" style={{ color: 'var(--muted)' }}>
            Showing <strong style={{ color: 'var(--ink)' }}>{sorted.length}</strong> of {orders.length} orders.
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
        <p className="italic" style={{ color: 'var(--muted)' }}>No orders match the current filters.</p>
      ) : view === 'kanban' ? (
        <KanbanView
          orders={sorted}
          customerMap={customerMap}
          onStatusChange={handleStatusChange}
          updating={updating}
        />
      ) : view === 'table' ? (
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
      ) : (
        <CardsView
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

/* ================================================================== */
/*  CARDS VIEW — default. Dense grid, click a card to expand in-place */
/* ================================================================== */

function CardsView({
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
  const today = new Date(); today.setHours(0, 0, 0, 0);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {orders.map((order) => {
        const cust = customerMap.get(order.customerId);
        const inv = invoiceByOrderId.get(order.id);
        const action = STATUS_ACTION[order.status];
        const dd = new Date(order.deliveryDate);
        const overdue = (order.status === 'pending' || order.status === 'confirmed') && dd < today;
        const itemsCount = order.items.reduce((n, i) => n + i.quantity, 0);
        const isExpanded = expandedId === order.id;

        return (
          <article
            key={order.id}
            className="card p-0 overflow-hidden"
            style={{ border: '1px solid var(--divider)' }}
          >
            {/* Header: order id + status badge */}
            <div
              onClick={() => setExpandedId(isExpanded ? null : order.id)}
              className="px-4 py-3 flex items-baseline justify-between gap-2 cursor-pointer transition-colors"
              style={{ borderBottom: '1px solid var(--divider)' }}
            >
              <div className="min-w-0">
                <p className="font-semibold truncate" style={{ color: 'var(--ink)' }}>
                  {order.id}
                </p>
                <p className="text-xs truncate" style={{ color: 'var(--muted)' }}>
                  {cust?.businessName || order.customerId}
                </p>
              </div>
              <span className={cn('badge-sm shrink-0', getStatusColor(order.status))}>
                {order.status}
              </span>
            </div>

            {/* Body: key figures */}
            <div className="px-4 py-3 grid grid-cols-3 gap-3 text-sm">
              <div>
                <span className="section-label block mb-0.5" style={{ color: 'var(--muted)' }}>Total</span>
                <p className="font-semibold font-variant-tabular" style={{ color: 'var(--brass)' }}>
                  {formatCurrency(order.total)}
                </p>
              </div>
              <div>
                <span className="section-label block mb-0.5" style={{ color: 'var(--muted)' }}>Items</span>
                <p className="font-variant-tabular" style={{ color: 'var(--ink)' }}>
                  {itemsCount} keg{itemsCount === 1 ? '' : 's'}
                </p>
              </div>
              <div>
                <span className="section-label block mb-0.5" style={{ color: 'var(--muted)' }}>Placed</span>
                <p className="font-variant-tabular text-xs" style={{ color: 'var(--ink)' }}>
                  {formatDate(order.createdAt)}
                </p>
              </div>
              <div className="col-span-2">
                <span className="section-label block mb-0.5" style={{ color: 'var(--muted)' }}>Delivery</span>
                <p
                  className="font-variant-tabular"
                  style={{ color: overdue ? 'var(--ruby)' : 'var(--ink)' }}
                  title={overdue ? 'Past delivery date without being marked completed' : undefined}
                >
                  {formatDate(order.deliveryDate)}
                  {overdue && (
                    <span className="ml-1 text-[9px] uppercase tracking-wider font-semibold">
                      · late
                    </span>
                  )}
                </p>
              </div>
              <div>
                <span className="section-label block mb-0.5" style={{ color: 'var(--muted)' }}>Invoice</span>
                {inv ? (
                  <span className={cn('badge-sm', getStatusColor(inv.status))}>{inv.status}</span>
                ) : (
                  <span className="text-xs italic" style={{ color: 'var(--faint)' }}>none</span>
                )}
              </div>
            </div>

            {/* Primary action row */}
            <div
              className="px-4 py-2 flex items-center justify-between gap-2"
              style={{ borderTop: '1px solid var(--divider)', background: 'color-mix(in srgb, var(--surface) 50%, transparent)' }}
            >
              <button
                onClick={() => setExpandedId(isExpanded ? null : order.id)}
                className="btn-ghost text-xs"
                style={{ color: 'var(--muted)' }}
              >
                {isExpanded ? 'Hide details' : 'Details ↓'}
              </button>
              {action.next ? (
                <button
                  onClick={() => onStatusChange(order, action.next!)}
                  disabled={updating === order.id}
                  className="btn-ghost text-xs"
                  style={{ color: action.color, fontWeight: 600 }}
                >
                  {updating === order.id ? '…' : `${action.label} →`}
                </button>
              ) : (
                <span className="section-label" style={{ color: 'var(--muted)' }}>
                  {action.label}
                </span>
              )}
            </div>

            {isExpanded && (
              <div
                className="px-4 py-3 space-y-3 text-sm"
                style={{ borderTop: '1px solid var(--divider)', background: 'color-mix(in srgb, var(--surface) 30%, transparent)' }}
              >
                {/* Items */}
                <div>
                  <span className="section-label block mb-1">Items</span>
                  <ul className="space-y-1">
                    {order.items.map((item, idx) => (
                      <li key={idx} className="flex items-baseline justify-between gap-2 text-xs">
                        <span style={{ color: 'var(--ink)' }} className="truncate">
                          {item.quantity} × {item.productName}
                        </span>
                        <span className="font-variant-tabular shrink-0" style={{ color: 'var(--muted)' }}>
                          {item.size}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>

                {order.kegReturns.length > 0 && (
                  <div>
                    <span className="section-label block mb-1" style={{ color: 'var(--pine)' }}>Keg Returns</span>
                    <div className="flex gap-2 flex-wrap">
                      {order.kegReturns.map((kr, idx) => (
                        <span
                          key={idx}
                          className="badge-sm"
                          style={{ color: 'var(--pine)', borderColor: 'var(--pine)' }}
                        >
                          {kr.size} × {kr.quantity}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {order.notes && (
                  <p className="italic text-xs" style={{ color: 'var(--muted)' }}>
                    Note: {order.notes}
                  </p>
                )}

                {/* Inline delivery-date edit for open orders */}
                {(order.status === 'pending' || order.status === 'confirmed') && (
                  <div className="flex items-center gap-2 pt-2 border-t border-divider text-xs">
                    <span className="section-label" style={{ color: 'var(--muted)' }}>Reschedule</span>
                    <input
                      type="date"
                      defaultValue={order.deliveryDate}
                      onBlur={(e) => updateDeliveryDate(order, e.target.value)}
                      className="input text-xs py-1"
                      style={{ maxWidth: 140 }}
                      disabled={updating === order.id}
                    />
                  </div>
                )}

                {/* Keg-return reminder + cancel */}
                <div className="flex items-center gap-3 pt-2 border-t border-divider">
                  {(order.status === 'pending' || order.status === 'confirmed') && (
                    <button
                      onClick={() => {
                        if (confirm(`Cancel order ${order.id}? This restores reserved inventory.`)) {
                          onStatusChange(order, 'cancelled');
                        }
                      }}
                      className="btn-ghost text-xs"
                      style={{ color: 'var(--ruby)' }}
                    >
                      Cancel order
                    </button>
                  )}
                  {(order.status === 'confirmed' || order.status === 'completed') && (
                    <button
                      onClick={() => sendReminder(order)}
                      className="btn-ghost text-xs"
                      style={{ color: 'var(--pine)' }}
                    >
                      Remind about kegs
                    </button>
                  )}
                  <Link
                    href="/admin/invoices"
                    className="btn-ghost text-xs ml-auto"
                    style={{ color: 'var(--brass)' }}
                  >
                    View invoice →
                  </Link>
                </div>
              </div>
            )}
          </article>
        );
      })}
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
                className="transition-colors"
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
                      <span style={{ color: overdue ? 'var(--ruby)' : undefined }} title={overdue ? 'Past delivery date without being marked completed' : undefined}>
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
                          without touching Supabase. Disabled once completed. */}
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
                      {(order.status === 'confirmed' || order.status === 'completed') && (
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
