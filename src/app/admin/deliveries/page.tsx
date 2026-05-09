'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import type { Order, Customer } from '@/lib/types';
import { formatCurrency, formatDate, formatAddress, formatPhone, cn } from '@/lib/utils';
import { adminFetch } from '@/lib/admin-fetch';

type StatusFilter = 'all-open' | 'pending' | 'confirmed' | 'completed';

// Quick-pick date range chips. Each maps to a function returning [from, to]
// inclusive dates as YYYY-MM-DD strings (or empty string for "no bound").
// Picked for the brewery's actual planning rhythm: today's run, the
// current week's pile, last week (for re-prints / historical sheets),
// the trailing 30 days. "Custom" leaves the inputs free.
type DatePreset = 'today' | 'week' | 'last-week' | 'last-30' | 'custom';

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function rangeFor(preset: DatePreset): { from: string; to: string } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (preset === 'today') return { from: ymd(today), to: ymd(today) };
  if (preset === 'week') {
    // Brewery's "this week" = Monday-through-Sunday of the current week.
    const day = today.getDay(); // 0=Sun..6=Sat
    const offsetToMon = (day + 6) % 7; // days since Monday
    const start = new Date(today); start.setDate(today.getDate() - offsetToMon);
    const end = new Date(start); end.setDate(start.getDate() + 6);
    return { from: ymd(start), to: ymd(end) };
  }
  if (preset === 'last-week') {
    const day = today.getDay();
    const offsetToMon = (day + 6) % 7;
    const thisMon = new Date(today); thisMon.setDate(today.getDate() - offsetToMon);
    const lastMon = new Date(thisMon); lastMon.setDate(thisMon.getDate() - 7);
    const lastSun = new Date(lastMon); lastSun.setDate(lastMon.getDate() + 6);
    return { from: ymd(lastMon), to: ymd(lastSun) };
  }
  if (preset === 'last-30') {
    const start = new Date(today); start.setDate(today.getDate() - 29);
    return { from: ymd(start), to: ymd(today) };
  }
  return { from: '', to: '' };
}

export default function DeliveriesPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);

  // Filter state. Defaults match the original behavior — all open
  // (pending+confirmed), no date scoping, no customer filter, no returns
  // filter — so the page looks identical until admin engages a filter.
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all-open');
  const [datePreset, setDatePreset] = useState<DatePreset>('custom');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [onlyWithReturns, setOnlyWithReturns] = useState(false);

  // Print mode toggles which template the print stylesheet shows.
  // null = screen view (Route Sheet style); 'manifest' = per-customer
  // manifest with signed-by lines. We flip the state, await a frame so
  // React paints, then call window.print(), then clear on next tick.
  const [printMode, setPrintMode] = useState<'route' | 'manifest' | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [o, c] = await Promise.all([
        adminFetch('/api/orders').then((r) => r.json()),
        // includeArchived so orders tied to archived accounts still render
        // with their customer name on the delivery route, not "Unknown".
        adminFetch('/api/customers?includeArchived=true').then((r) => r.json()),
      ]);
      setOrders(Array.isArray(o) ? o : []);
      setCustomers(Array.isArray(c) ? c : []);
    } catch {
      /* ignore — last good data stays on screen */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Listen for the standard nav-refresh event so the deliveries view
  // updates immediately when a status change lands from another page.
  useEffect(() => {
    const onRefresh = () => loadData();
    window.addEventListener('guidon:nav-refresh', onRefresh);
    return () => window.removeEventListener('guidon:nav-refresh', onRefresh);
  }, [loadData]);

  const customerMap = useMemo(
    () => new Map(customers.map((c) => [c.id, c])),
    [customers],
  );

  // Apply preset → date-input sync. "Custom" leaves whatever's in the
  // inputs alone so admin can keep editing freely.
  useEffect(() => {
    if (datePreset === 'custom') return;
    const { from, to } = rangeFor(datePreset);
    setDateFrom(from);
    setDateTo(to);
  }, [datePreset]);

  // Active filter pipeline. Order matters here — status filter prunes the
  // candidate set first (cheapest), then date (most variable), then
  // customer (most specific), then returns (boolean).
  const queue = useMemo(() => {
    let result = orders;

    // Status
    if (statusFilter === 'all-open') {
      result = result.filter((o) => o.status === 'pending' || o.status === 'confirmed');
    } else {
      result = result.filter((o) => o.status === statusFilter);
    }

    // Date — both bounds optional. Compare on the YYYY-MM-DD prefix of
    // createdAt so we don't trip over timezones. If `from` is empty, no
    // lower bound; same for `to`.
    if (dateFrom || dateTo) {
      result = result.filter((o) => {
        const day = o.createdAt.slice(0, 10);
        if (dateFrom && day < dateFrom) return false;
        if (dateTo && day > dateTo) return false;
        return true;
      });
    }

    // Customer
    if (customerId) {
      result = result.filter((o) => o.customerId === customerId);
    }

    // Has keg returns
    if (onlyWithReturns) {
      result = result.filter((o) => Array.isArray(o.kegReturns) && o.kegReturns.length > 0);
    }

    // Sort: oldest first so the brewery loads the route in placement
    // order (matches the original behavior).
    return result
      .slice()
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }, [orders, statusFilter, dateFrom, dateTo, customerId, onlyWithReturns]);

  const totalKegs = queue.reduce(
    (sum, o) => sum + o.items.reduce((s, i) => s + i.quantity, 0),
    0,
  );
  const totalReturns = queue.reduce(
    (sum, o) => sum + (o.kegReturns || []).reduce((s, r) => s + r.quantity, 0),
    0,
  );
  const totalRevenue = queue.reduce((sum, o) => sum + o.total, 0);

  const handleConfirm = useCallback(async (orderId: string) => {
    setUpdatingOrderId(orderId);
    try {
      const res = await adminFetch('/api/orders', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: orderId, status: 'confirmed' }),
      });
      if (res.ok) {
        const updated = await res.json().catch(() => null);
        setOrders((prev) => prev.map((o) => (o.id === orderId ? (updated ?? { ...o, status: 'confirmed' as const }) : o)));
        // Same nav-refresh signal that /admin/orders dispatches so
        // sidebar badge counts update everywhere instantly.
        window.dispatchEvent(new Event('guidon:nav-refresh'));
      }
    } catch {
      /* leave row in pending state on failure */
    } finally {
      setUpdatingOrderId(null);
    }
  }, []);

  const triggerPrint = useCallback((mode: 'route' | 'manifest') => {
    setPrintMode(mode);
    // Two RAFs so React commits the DOM swap + browser layout settles
    // before we call print(). Without this the print preview can
    // capture a frame mid-transition and look wrong.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.print();
        // Restore screen view after the print dialog closes/cancels.
        setTimeout(() => setPrintMode(null), 200);
      });
    });
  }, []);

  // Reset all filters — useful for "I scoped down too far, show me everything"
  const resetFilters = () => {
    setStatusFilter('all-open');
    setDatePreset('custom');
    setDateFrom('');
    setDateTo('');
    setCustomerId('');
    setOnlyWithReturns(false);
  };

  const hasActiveFilter =
    statusFilter !== 'all-open' ||
    Boolean(dateFrom) ||
    Boolean(dateTo) ||
    Boolean(customerId) ||
    onlyWithReturns;

  return (
    <div className="space-y-6">
      {/* Header — hidden on print */}
      <div className="no-print">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <span className="section-label mb-1 block">Operations</span>
            <h2
              className="font-display"
              style={{
                fontSize: '2.5rem',
                fontVariationSettings: "'opsz' 72",
                color: 'var(--ink)',
                fontWeight: 500,
              }}
            >
              Delivery Route
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => triggerPrint('route')}
              disabled={queue.length === 0}
              className="btn-primary"
              title="Driver-style sheet — one row per delivery, items + returns inline"
            >
              <svg className="w-4 h-4 mr-1.5 inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              Print Route Sheet
            </button>
            <button
              onClick={() => triggerPrint('manifest')}
              disabled={queue.length === 0}
              className="btn-secondary"
              title="Customer manifest — full per-stop billing summary with signed-by line, page break per customer"
            >
              Print Manifest
            </button>
          </div>
        </div>
      </div>

      {/* Filters — hidden on print */}
      <div className="no-print card space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="section-label">Filters</span>
          {hasActiveFilter && (
            <button
              onClick={resetFilters}
              className="text-xs italic underline-offset-2 hover:underline"
              style={{ color: 'var(--brass)' }}
            >
              Clear all
            </button>
          )}
        </div>

        {/* Status row */}
        <div>
          <span className="text-xs uppercase tracking-wider font-semibold mb-2 block" style={{ color: 'var(--muted)' }}>
            Status
          </span>
          <div className="flex flex-wrap gap-2">
            {([
              { value: 'all-open', label: 'All open (pending + confirmed)' },
              { value: 'pending', label: 'Pending only' },
              { value: 'confirmed', label: 'Confirmed only' },
              { value: 'completed', label: 'Completed (history)' },
            ] as const).map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setStatusFilter(opt.value)}
                className={cn(
                  'text-xs font-heading font-bold px-3 py-1.5 rounded-lg transition-all',
                  statusFilter === opt.value ? 'bg-brass-pill' : 'hover:bg-brass-pill-hover',
                )}
                style={
                  statusFilter === opt.value
                    ? { color: 'var(--brass)', background: 'color-mix(in srgb, var(--brass) 14%, transparent)', border: '1px solid color-mix(in srgb, var(--brass) 45%, transparent)' }
                    : { color: 'var(--muted)', border: '1px solid var(--divider)' }
                }
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Date range row */}
        <div>
          <span className="text-xs uppercase tracking-wider font-semibold mb-2 block" style={{ color: 'var(--muted)' }}>
            Order placed (date range)
          </span>
          <div className="flex flex-wrap gap-2 mb-2">
            {([
              { value: 'today', label: 'Today' },
              { value: 'week', label: 'This week' },
              { value: 'last-week', label: 'Last week' },
              { value: 'last-30', label: 'Last 30 days' },
              { value: 'custom', label: 'Custom' },
            ] as const).map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setDatePreset(opt.value)}
                className="text-xs font-heading font-bold px-3 py-1.5 rounded-lg transition-all"
                style={
                  datePreset === opt.value
                    ? { color: 'var(--brass)', background: 'color-mix(in srgb, var(--brass) 14%, transparent)', border: '1px solid color-mix(in srgb, var(--brass) 45%, transparent)' }
                    : { color: 'var(--muted)', border: '1px solid var(--divider)' }
                }
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs" style={{ color: 'var(--muted)' }}>
              From&nbsp;
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => { setDateFrom(e.target.value); setDatePreset('custom'); }}
                className="input inline-block w-auto py-1.5"
              />
            </label>
            <label className="text-xs" style={{ color: 'var(--muted)' }}>
              To&nbsp;
              <input
                type="date"
                value={dateTo}
                onChange={(e) => { setDateTo(e.target.value); setDatePreset('custom'); }}
                className="input inline-block w-auto py-1.5"
              />
            </label>
          </div>
        </div>

        {/* Customer + returns row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="text-xs" style={{ color: 'var(--muted)' }}>
            <span className="block uppercase tracking-wider font-semibold mb-1">Customer</span>
            <select
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              className="input"
            >
              <option value="">All customers</option>
              {customers
                .slice()
                .sort((a, b) => a.businessName.localeCompare(b.businessName))
                .map((c) => (
                  <option key={c.id} value={c.id}>{c.businessName}</option>
                ))}
            </select>
          </label>
          <label className="flex items-end gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={onlyWithReturns}
              onChange={(e) => setOnlyWithReturns(e.target.checked)}
            />
            <span className="text-sm pb-1" style={{ color: 'var(--muted)' }}>
              <strong>Has keg returns</strong> — only show deliveries where the customer is sending empties back
            </span>
          </label>
        </div>
      </div>

      {/* Result summary chip — shown on screen + print */}
      <div className="card flex flex-wrap items-baseline gap-x-6 gap-y-1 text-sm">
        <span style={{ color: 'var(--muted)' }}>
          <strong style={{ color: 'var(--ink)' }}>{queue.length}</strong>{' '}
          {queue.length === 1 ? 'delivery' : 'deliveries'}
        </span>
        <span style={{ color: 'var(--muted)' }}>
          <strong style={{ color: 'var(--ink)' }}>{totalKegs}</strong> keg{totalKegs === 1 ? '' : 's'} out
        </span>
        {totalReturns > 0 && (
          <span style={{ color: 'var(--pine)' }}>
            <strong>{totalReturns}</strong> return{totalReturns === 1 ? '' : 's'} to pick up
          </span>
        )}
        <span className="ml-auto" style={{ color: 'var(--brass)' }}>
          <strong>{formatCurrency(totalRevenue)}</strong> total
        </span>
      </div>

      {loading ? (
        <div className="space-y-3 no-print">
          <div className="skeleton h-8 w-2/3" />
          <div className="skeleton h-16 w-full" />
          <div className="skeleton h-16 w-full" />
        </div>
      ) : queue.length === 0 ? (
        <p className="italic no-print" style={{ color: 'var(--muted)' }}>
          {hasActiveFilter
            ? 'No deliveries match these filters. Clear filters to see everything.'
            : 'No pending or confirmed deliveries. All caught up.'}
        </p>
      ) : (
        <>
          {/* Print-only letterhead */}
          <div className="hidden print:block mb-8 text-center">
            <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: '2rem', marginBottom: '0.25rem' }}>
              Guidon Brewing Co.
              <span style={{ fontSize: '1.25rem', fontWeight: 400, color: '#555' }}>
                {' '}— {printMode === 'manifest' ? 'Customer Manifest' : 'Delivery Route'}
              </span>
            </h1>
            <p style={{ fontSize: '0.875rem', color: '#555', marginBottom: '0.5rem' }}>
              415 8th Ave. E., Hendersonville, NC 28792
            </p>
            <p style={{ fontSize: '0.75rem', color: '#555' }}>
              Printed {new Date().toLocaleString()} &middot; {queue.length} stop{queue.length === 1 ? '' : 's'} &middot; {totalKegs} keg{totalKegs === 1 ? '' : 's'} out
              {totalReturns > 0 && ` · ${totalReturns} return${totalReturns === 1 ? '' : 's'}`}
            </p>
            {hasActiveFilter && (
              <p style={{ fontSize: '0.7rem', color: '#777', fontStyle: 'italic', marginTop: '0.25rem' }}>
                Filtered: {[
                  statusFilter !== 'all-open' && `status=${statusFilter}`,
                  dateFrom && `from ${dateFrom}`,
                  dateTo && `to ${dateTo}`,
                  customerId && `customer=${customerMap.get(customerId)?.businessName}`,
                  onlyWithReturns && 'returns-only',
                ].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>

          {/* ROUTE SHEET — screen + print:default */}
          <section className={cn(
            'print:break-inside-avoid',
            // When printMode='manifest', hide the route sheet from the
            // print output; otherwise it's the default.
            printMode === 'manifest' && 'print:hidden',
          )}>
            <div
              className="flex items-baseline gap-4 pb-2 mb-4 border-b-2 no-print"
              style={{ borderColor: 'var(--brass)' }}
            >
              <h3
                className="font-display"
                style={{
                  fontSize: '1.75rem',
                  fontVariationSettings: "'opsz' 48",
                  fontWeight: 500,
                  color: 'var(--ink)',
                }}
              >
                {statusFilter === 'completed' ? 'Completed Deliveries' : 'Pending Deliveries'}
              </h3>
              <span className="text-sm italic ml-auto" style={{ color: 'var(--muted)' }}>
                {queue.length} {queue.length === 1 ? 'delivery' : 'deliveries'}, {totalKegs} kegs
              </span>
            </div>

            <ol className="space-y-5 print:space-y-3">
              {queue.map((order, idx) => {
                const customer = customerMap.get(order.customerId);
                const orderKegs = order.items.reduce((s, i) => s + i.quantity, 0);
                return (
                  <li
                    key={order.id}
                    className="grid grid-cols-12 gap-4 pb-4 border-b border-divider print:break-inside-avoid"
                  >
                    <div className="col-span-1 text-right">
                      <span
                        className="font-display font-variant-tabular"
                        style={{ fontSize: '1.5rem', color: 'var(--brass)', fontVariationSettings: "'opsz' 36", fontWeight: 500 }}
                      >
                        {idx + 1}
                      </span>
                    </div>
                    <div className="col-span-5">
                      <p
                        className="font-display"
                        style={{ fontSize: '1.25rem', fontVariationSettings: "'opsz' 24", color: 'var(--ink)', fontWeight: 500 }}
                      >
                        {customer?.businessName || 'Unknown customer'}
                      </p>
                      <p className="text-sm mt-0.5" style={{ color: 'var(--muted)' }}>
                        {customer?.contactName}
                      </p>
                      {customer && formatAddress(customer) && (
                        <p
                          className="text-sm mt-1 italic"
                          style={{ color: 'var(--ink)', fontFamily: "'Source Serif 4', serif" }}
                        >
                          {formatAddress(customer)}
                        </p>
                      )}
                      {customer?.phone && (
                        <p className="text-sm font-variant-tabular mt-0.5" style={{ color: 'var(--brass)' }}>
                          {formatPhone(customer.phone)}
                        </p>
                      )}
                    </div>
                    <div className="col-span-4">
                      <span className="section-label mb-1 block">Items</span>
                      <ul className="text-sm leading-relaxed">
                        {order.items.map((item) => (
                          <li key={`${item.productId}-${item.size}`} style={{ color: 'var(--ink)' }}>
                            <span
                              className="font-semibold font-variant-tabular inline-block w-6"
                              style={{ color: 'var(--brass)' }}
                            >
                              {item.quantity}
                            </span>
                            <span className="italic mr-1" style={{ color: 'var(--muted)' }}>
                              {item.size}
                            </span>
                            {item.productName}
                          </li>
                        ))}
                      </ul>
                      {order.kegReturns.length > 0 && (
                        <>
                          <span className="section-label mb-1 block mt-2" style={{ color: 'var(--pine)' }}>
                            Keg Returns
                          </span>
                          <ul className="text-sm">
                            {order.kegReturns.map((r) => (
                              <li key={r.size} style={{ color: 'var(--pine)' }}>
                                <span className="font-semibold font-variant-tabular inline-block w-6">
                                  {r.quantity}
                                </span>
                                <span className="italic" style={{ color: 'var(--muted)' }}>
                                  {r.size}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </>
                      )}
                    </div>
                    <div className="col-span-2 text-right">
                      <p
                        className="font-display font-variant-tabular"
                        style={{ fontSize: '1.125rem', fontVariationSettings: "'opsz' 20", color: 'var(--ink)', fontWeight: 500 }}
                      >
                        {formatCurrency(order.total)}
                      </p>
                      <p className="text-xs font-variant-tabular" style={{ color: 'var(--muted)' }}>
                        {orderKegs} keg{orderKegs === 1 ? '' : 's'} out
                      </p>
                      <p className="text-xs uppercase tracking-wider font-ui mt-1" style={{ color: order.status === 'confirmed' ? 'var(--pine)' : order.status === 'completed' ? 'var(--muted)' : 'var(--ember)' }}>
                        {order.status}
                      </p>
                      <p className="text-[10px] font-variant-tabular mt-1" style={{ color: 'var(--faint)' }}>
                        Placed {formatDate(order.createdAt)}
                      </p>
                      {/* Inline confirm button — saves a hop to /admin/orders
                          for the most common status transition. */}
                      {order.status === 'pending' && (
                        <button
                          onClick={() => handleConfirm(order.id)}
                          disabled={updatingOrderId === order.id}
                          className="text-xs font-heading font-bold no-print mt-1.5 px-2 py-1 rounded transition-all disabled:opacity-50"
                          style={{ color: 'var(--pine)', background: 'color-mix(in srgb, var(--pine) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--pine) 45%, transparent)' }}
                        >
                          {updatingOrderId === order.id ? 'Confirming…' : 'Confirm'}
                        </button>
                      )}
                      <Link
                        href={`/admin/orders/${order.id}`}
                        className="block text-xs italic no-print mt-1"
                        style={{ color: 'var(--brass)' }}
                      >
                        &rarr; Open order
                      </Link>
                      {order.notes && (
                        <p className="text-xs italic mt-2" style={{ color: 'var(--muted)' }}>
                          Note: {order.notes}
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>

          {/* MANIFEST — only visible during manifest print */}
          <section className={cn(
            'hidden',
            printMode === 'manifest' && 'print:block',
          )}>
            {queue.map((order, idx) => {
              const customer = customerMap.get(order.customerId);
              const orderKegs = order.items.reduce((s, i) => s + i.quantity, 0);
              const orderReturns = (order.kegReturns || []).reduce((s, r) => s + r.quantity, 0);
              const itemsSubtotal = order.items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
              return (
                <article
                  key={order.id}
                  className={cn(
                    'print:break-after-page',
                    // No break after the last one — saves a blank page.
                    idx === queue.length - 1 && 'print:break-after-auto',
                  )}
                  style={{ paddingBottom: '1rem' }}
                >
                  {/* Customer block */}
                  <header style={{ borderBottom: '2px solid #9E7A3B', paddingBottom: '0.5rem', marginBottom: '0.75rem' }}>
                    <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: '1.5rem', fontWeight: 500, margin: 0 }}>
                      Stop {idx + 1} of {queue.length} &middot; {customer?.businessName || 'Unknown customer'}
                    </h2>
                    <p style={{ fontSize: '0.875rem', color: '#555', margin: '0.25rem 0 0' }}>
                      {customer?.contactName}
                      {customer?.phone && <> &middot; {formatPhone(customer.phone)}</>}
                      {customer?.email && <> &middot; {customer.email}</>}
                    </p>
                    {customer && formatAddress(customer) && (
                      <p style={{ fontSize: '0.875rem', fontStyle: 'italic', margin: '0.125rem 0 0' }}>
                        {formatAddress(customer)}
                      </p>
                    )}
                    <p style={{ fontSize: '0.75rem', color: '#777', margin: '0.25rem 0 0' }}>
                      Order <strong>{order.id}</strong> &middot; placed {formatDate(order.createdAt)} &middot; status {order.status}
                    </p>
                  </header>

                  {/* Items table */}
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem', marginBottom: '0.75rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #ccc', textAlign: 'left' }}>
                        <th style={{ padding: '0.25rem 0.5rem 0.25rem 0' }}>Item</th>
                        <th style={{ padding: '0.25rem 0.5rem' }}>Size</th>
                        <th style={{ padding: '0.25rem 0.5rem', textAlign: 'right' }}>Qty</th>
                        <th style={{ padding: '0.25rem 0.5rem', textAlign: 'right' }}>Unit</th>
                        <th style={{ padding: '0.25rem 0.5rem', textAlign: 'right' }}>Deposit</th>
                        <th style={{ padding: '0.25rem 0 0.25rem 0.5rem', textAlign: 'right' }}>Line total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {order.items.map((item) => (
                        <tr key={`${item.productId}-${item.size}`} style={{ borderBottom: '1px dotted #ddd' }}>
                          <td style={{ padding: '0.25rem 0.5rem 0.25rem 0' }}>{item.productName}</td>
                          <td style={{ padding: '0.25rem 0.5rem', fontStyle: 'italic', color: '#555' }}>{item.size}</td>
                          <td style={{ padding: '0.25rem 0.5rem', textAlign: 'right' }}>{item.quantity}</td>
                          <td style={{ padding: '0.25rem 0.5rem', textAlign: 'right' }}>{formatCurrency(item.unitPrice)}</td>
                          <td style={{ padding: '0.25rem 0.5rem', textAlign: 'right' }}>{formatCurrency(item.deposit * item.quantity)}</td>
                          <td style={{ padding: '0.25rem 0 0.25rem 0.5rem', textAlign: 'right', fontWeight: 600 }}>
                            {formatCurrency(item.unitPrice * item.quantity + item.deposit * item.quantity)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {/* Returns block */}
                  {order.kegReturns.length > 0 && (
                    <div style={{ background: '#F0EBDC', border: '1px solid #d8cda8', padding: '0.5rem 0.75rem', borderRadius: '4px', marginBottom: '0.75rem' }}>
                      <p style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700, color: '#5C7250', margin: '0 0 0.25rem' }}>
                        Keg Returns to Pick Up
                      </p>
                      <ul style={{ margin: 0, padding: '0 0 0 1.25rem', fontSize: '0.875rem' }}>
                        {order.kegReturns.map((r) => (
                          <li key={r.size}>
                            {r.quantity} &times; {r.size}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Totals + summary */}
                  <table style={{ width: '60%', marginLeft: 'auto', fontSize: '0.875rem', borderCollapse: 'collapse', marginBottom: '1rem' }}>
                    <tbody>
                      <tr>
                        <td style={{ padding: '0.125rem 0.5rem', color: '#555' }}>Items subtotal</td>
                        <td style={{ padding: '0.125rem 0', textAlign: 'right' }}>{formatCurrency(itemsSubtotal)}</td>
                      </tr>
                      <tr>
                        <td style={{ padding: '0.125rem 0.5rem', color: '#555' }}>Net deposits</td>
                        <td style={{ padding: '0.125rem 0', textAlign: 'right' }}>{formatCurrency(order.totalDeposit)}</td>
                      </tr>
                      <tr style={{ borderTop: '2px solid #2A2416' }}>
                        <td style={{ padding: '0.25rem 0.5rem', fontWeight: 700 }}>Total due on delivery</td>
                        <td style={{ padding: '0.25rem 0', textAlign: 'right', fontWeight: 700, fontSize: '1.125rem' }}>
                          {formatCurrency(order.total)}
                        </td>
                      </tr>
                    </tbody>
                  </table>

                  {/* Summary chip */}
                  <p style={{ fontSize: '0.75rem', color: '#555', margin: '0 0 0.75rem' }}>
                    {orderKegs} keg{orderKegs === 1 ? '' : 's'} out{orderReturns > 0 && ` · ${orderReturns} return${orderReturns === 1 ? '' : 's'} expected`}
                    {customer?.preferredPaymentMethod && customer.preferredPaymentMethod !== 'no_preference' && (
                      <> &middot; payment: {customer.preferredPaymentMethod === 'check' ? 'Check' : 'Fintech'}</>
                    )}
                  </p>

                  {order.notes && (
                    <p style={{ fontSize: '0.875rem', fontStyle: 'italic', color: '#444', margin: '0 0 0.75rem' }}>
                      <strong>Order notes:</strong> {order.notes}
                    </p>
                  )}

                  {/* Signed-by block */}
                  <div style={{ borderTop: '1px solid #ccc', paddingTop: '1rem', marginTop: '1rem' }}>
                    <table style={{ width: '100%', fontSize: '0.875rem' }}>
                      <tbody>
                        <tr>
                          <td style={{ padding: '0.5rem 0', borderBottom: '1px solid #2A2416', width: '60%' }}>
                            &nbsp;
                          </td>
                          <td style={{ width: '5%' }}>&nbsp;</td>
                          <td style={{ padding: '0.5rem 0', borderBottom: '1px solid #2A2416' }}>
                            &nbsp;
                          </td>
                        </tr>
                        <tr>
                          <td style={{ padding: '0.25rem 0', fontSize: '0.7rem', color: '#777' }}>
                            Received by (print + sign)
                          </td>
                          <td>&nbsp;</td>
                          <td style={{ padding: '0.25rem 0', fontSize: '0.7rem', color: '#777' }}>
                            Date
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </article>
              );
            })}
          </section>

          {/* Derby Digital print footer — only visible in print */}
          <div className="hidden print:block mt-8 pt-4 border-t border-gray-300 text-center text-[10px] text-gray-500">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}>
              <span>Powered by</span>
              <span style={{ fontWeight: 700, letterSpacing: '0.1em', color: '#333' }}>DERBY DIGITAL</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
