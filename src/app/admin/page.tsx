'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Order, Customer, WholesaleApplication, Invoice, Product } from '@/lib/types';
import { formatCurrency, formatDate, getStatusColor, cn } from '@/lib/utils';
import { adminFetch } from '@/lib/admin-fetch';

export default function AdminDashboard() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [applications, setApplications] = useState<(WholesaleApplication & { status?: string })[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [kegsOut, setKegsOut] = useState<number>(0);
  const [loadError, setLoadError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [healthIssues, setHealthIssues] = useState<string[]>([]);

  // Poll /api/health once on load. If anything is red (e.g. RESEND_API_KEY
  // missing on Vercel), surface a banner so Mike knows email won't send
  // without hunting through health JSON.
  useEffect(() => {
    fetch('/api/health', { cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => {
        const issues: string[] = [];
        const checks = data?.checks || {};
        Object.entries(checks).forEach(([key, val]) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const v = val as any;
          if (v && v.ok === false) issues.push(`${key}: ${v.detail || 'failing'}`);
        });
        setHealthIssues(issues);
      })
      .catch(() => { /* ignore */ });
  }, []);

  useEffect(() => {
    let stop = false;
    async function load() {
      try {
        // Single source of truth: fetch the raw arrays + keg balances, then
        // derive every dashboard number from them. No separate /api/admin/stats
        // call that could drift out of sync with the list pages.
        const [ordersRes, customersRes, appsRes, invoicesRes, productsRes, balancesRes] = await Promise.all([
          adminFetch('/api/orders', { cache: 'no-store' }),
          adminFetch('/api/customers', { cache: 'no-store' }),
          adminFetch('/api/applications', { cache: 'no-store' }),
          adminFetch('/api/invoices', { cache: 'no-store' }),
          adminFetch('/api/products', { cache: 'no-store' }),
          adminFetch('/api/keg-ledger?balances=true', { cache: 'no-store' }),
        ]);
        if (stop) return;
        const safeArr = async (r: Response) => (r.ok ? r.json().catch(() => []) : []);
        const [ordersData, customersData, appsData, invoicesData, productsData, balancesData] = await Promise.all([
          safeArr(ordersRes),
          safeArr(customersRes),
          safeArr(appsRes),
          safeArr(invoicesRes),
          safeArr(productsRes),
          safeArr(balancesRes),
        ]);
        if (stop) return;
        setOrders(Array.isArray(ordersData) ? ordersData : []);
        setCustomers(Array.isArray(customersData) ? customersData : []);
        setApplications(Array.isArray(appsData) ? appsData : []);
        setInvoices(Array.isArray(invoicesData) ? invoicesData : []);
        setProducts(Array.isArray(productsData) ? productsData : []);
        // kegsOut = sum of per-size balances across every customer
        let totalKegs = 0;
        if (Array.isArray(balancesData)) {
          for (const entry of balancesData) {
            const bal = entry?.balance || {};
            totalKegs += Math.max(0, Number(bal['1/2bbl']) || 0);
            totalKegs += Math.max(0, Number(bal['1/4bbl']) || 0);
            totalKegs += Math.max(0, Number(bal['1/6bbl']) || 0);
          }
        }
        setKegsOut(totalKegs);
        setLoadError(false);
      } catch (err) {
        console.error('Failed to load dashboard data', err);
        if (!stop) setLoadError(true);
      } finally {
        if (!stop) setLoading(false);
      }
    }
    load();
    // Refresh every 60s so Mike's dashboard shows new orders / applications
    // without a manual refresh. Background tabs pause JS setTimeout in most
    // browsers, so this is a reasonable battery compromise.
    const timer = setInterval(load, 60_000);
    return () => { stop = true; clearInterval(timer); };
  }, []);

  const customerMap = new Map(customers.map((c) => [c.id, c]));

  // Build activity feed from orders, applications, invoices
  type ActivityItem = { type: string; title: string; detail: string; date: string };
  const activityFeed: ActivityItem[] = [];
  orders.forEach((o) => {
    activityFeed.push({
      type: 'order',
      title: `New order ${o.id}`,
      detail: customerMap.get(o.customerId)?.businessName || 'Unknown',
      date: o.createdAt,
    });
  });
  applications.forEach((a) => {
    activityFeed.push({
      type: 'application',
      title: `Application: ${a.businessName}`,
      detail: a.status || 'pending',
      date: a.createdAt,
    });
  });
  invoices
    .filter((i) => i.paidAt)
    .forEach((i) => {
      activityFeed.push({
        type: 'payment',
        title: `Invoice ${i.id} paid`,
        detail: formatCurrency(i.total),
        date: i.paidAt!,
      });
    });
  activityFeed.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const recentActivity = activityFeed.slice(0, 10);

  // Upcoming deliveries
  const upcomingDeliveries = [...orders]
    .filter((o) => o.status === 'pending' || o.status === 'confirmed')
    .sort((a, b) => new Date(a.deliveryDate).getTime() - new Date(b.deliveryDate).getTime())
    .slice(0, 8);

  // Overdue invoices
  const overdueInvoices = invoices.filter((i) => i.status === 'overdue' || i.status === 'unpaid').length;
  const overdueAmount = invoices
    .filter((i) => i.status === 'overdue' || i.status === 'unpaid')
    .reduce((sum, i) => sum + i.total, 0);

  // Derived ledger-line numbers (single source of truth — same arrays the
  // list pages use). Previously came from /api/admin/stats which could
  // drift out of sync with /api/orders on stale caches. Computing
  // client-side means numbers always match what the orders page shows.
  const pendingOrders = orders.filter((o) => o.status === 'pending' || o.status === 'confirmed').length;
  const pendingApplications = applications.filter((a) => !a.status || a.status === 'pending').length;
  // Revenue this month: confirmed + completed orders placed in the current calendar month.
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const totalRevenue = orders
    .filter((o) => (o.status === 'confirmed' || o.status === 'completed') && new Date(o.createdAt) >= monthStart)
    .reduce((s, o) => s + o.total, 0);
  const totalCustomers = customers.filter((c) => !c.archivedAt).length;

  // Low inventory: any size with inventoryCount < par_level (or default 5).
  // When par_level is explicitly set by admin, respect that per-size.
  const DEFAULT_PAR = 5;
  const lowInventory = products.flatMap((p) =>
    p.sizes
      .filter((s) => {
        const par = (s.parLevel ?? null) !== null ? s.parLevel! : DEFAULT_PAR;
        return s.inventoryCount < par;
      })
      .map((s) => ({
        name: p.name,
        size: s.size,
        count: s.inventoryCount,
        par: (s.parLevel ?? null) !== null ? s.parLevel! : DEFAULT_PAR,
      })),
  );

  // Rolling 14-day revenue bucketed by day (confirmed + completed orders only).
  // Used as a sparkline so Mike sees the trend without opening a report.
  const revenue14d = (() => {
    const days: { date: string; total: number }[] = [];
    const today = new Date(); today.setHours(0, 0, 0, 0);
    for (let i = 13; i >= 0; i--) {
      const d = new Date(today); d.setDate(today.getDate() - i);
      days.push({ date: d.toISOString().slice(0, 10), total: 0 });
    }
    const byDate = new Map(days.map((d, idx) => [d.date, idx] as const));
    for (const o of orders) {
      if (o.status !== 'confirmed' && o.status !== 'completed') continue;
      const day = new Date(o.createdAt).toISOString().slice(0, 10);
      const idx = byDate.get(day);
      if (idx !== undefined) days[idx].total += o.total;
    }
    return days;
  })();
  const revenue14dMax = Math.max(1, ...revenue14d.map((d) => d.total));
  const revenue14dSum = revenue14d.reduce((s, d) => s + d.total, 0);

  return (
    <div className="space-y-10">
      {/* Masthead */}
      <div>
        <span className="section-label mb-1 block">Overview</span>
        <h2 className="font-display text-4xl md:text-5xl" style={{ fontVariationSettings: "'opsz' 96" }}>
          Dashboard
        </h2>
      </div>

      {/* THE LEDGER LINE — the biggest DESIGN.md risk move.
          Replaces the 5-stat-card grid with one prose sentence. */}
      {loading ? (
        <div className="py-8">
          <div className="skeleton h-6 w-3/4" />
        </div>
      ) : !loadError ? (
        <div className="ledger-line">
          <span className="font-display italic text-[var(--muted)] mr-2" style={{ fontVariationSettings: "'opsz' 24" }}>
            Today,
          </span>
          <span className="ledger-num">{kegsOut}</span> kegs outstanding with wholesale accounts.{' '}
          <span className="ledger-num">{pendingOrders}</span> order{pendingOrders === 1 ? '' : 's'} pending delivery.{' '}
          {overdueInvoices > 0 ? (
            <>
              <span className="ledger-num" style={{ color: 'var(--ruby)' }}>
                {overdueInvoices}
              </span>{' '}
              invoice{overdueInvoices === 1 ? '' : 's'} outstanding{' '}
              <span className="ledger-num" style={{ color: 'var(--ruby)' }}>
                ({formatCurrency(overdueAmount)})
              </span>
              .{' '}
            </>
          ) : (
            <>No outstanding invoices. </>
          )}
          <span className="font-display italic text-[var(--muted)]" style={{ fontVariationSettings: "'opsz' 24" }}>
            This month:
          </span>{' '}
          <span className="ledger-num">{formatCurrency(totalRevenue)}</span> in revenue across{' '}
          <span className="ledger-num">{totalCustomers}</span> wholesale account{totalCustomers === 1 ? '' : 's'}
          {pendingApplications > 0 && (
            <>
              , plus <span className="ledger-num">{pendingApplications}</span> application{pendingApplications === 1 ? '' : 's'} awaiting review
            </>
          )}
          .
        </div>
      ) : (
        <div className="ledger-line" style={{ color: 'var(--muted)' }}>
          <span className="font-display italic mr-2" style={{ fontVariationSettings: "'opsz' 24" }}>
            Couldn&rsquo;t load today&rsquo;s numbers.
          </span>
          Refresh the page. If it persists, your admin session may have expired — click{' '}
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="underline"
            style={{ color: 'var(--brass)' }}
          >
            reload
          </button>{' '}
          to re-authenticate.
        </div>
      )}

      {/* Health issues banner — surfaces env / integration problems so
          they don't silently degrade core flows. Common: Vercel env vars
          not set (RESEND_API_KEY etc.) breaking outbound email. */}
      {healthIssues.length > 0 && (
        <div
          className="card p-4 border-l-4"
          style={{ borderLeftColor: 'var(--ruby)', background: 'color-mix(in srgb, var(--ruby) 8%, transparent)' }}
        >
          <span className="section-label mb-1 block" style={{ color: 'var(--ruby)' }}>
            Service Health
          </span>
          <p className="text-sm" style={{ color: 'var(--ink)' }}>
            One or more integrations are degraded. This usually means a Vercel
            environment variable isn&rsquo;t set.
          </p>
          <ul className="mt-2 text-xs font-variant-tabular space-y-0.5" style={{ color: 'var(--muted)' }}>
            {healthIssues.map((msg) => <li key={msg}>&bull; {msg}</li>)}
          </ul>
          <p className="text-xs italic mt-2" style={{ color: 'var(--muted)' }}>
            Fix: Vercel dashboard → Settings → Environment Variables → add the missing keys → redeploy.
          </p>
        </div>
      )}

      {/* First-run guidance: when the db is genuinely empty (no customers,
          no orders) show a setup card. Disappears once any customer or
          order exists. */}
      {!loading && customers.length === 0 && orders.length === 0 && (
        <div
          className="card p-5"
          style={{ borderColor: 'var(--brass)', background: 'color-mix(in srgb, var(--brass) 5%, transparent)' }}
        >
          <span className="section-label mb-1 block" style={{ color: 'var(--brass)' }}>
            Getting Started
          </span>
          <h3 className="font-display text-2xl mb-2" style={{ fontVariationSettings: "'opsz' 36", color: 'var(--ink)', fontWeight: 500 }}>
            Welcome — let&rsquo;s get you live
          </h3>
          <p className="text-sm mb-4" style={{ color: 'var(--muted)' }}>
            No wholesale accounts yet. Pick whichever of these matches where your first customer is coming from:
          </p>
          <ul className="space-y-2 text-sm">
            <li className="flex items-baseline gap-2">
              <span style={{ color: 'var(--brass)' }}>→</span>
              <span style={{ color: 'var(--ink)' }}>
                <Link href="/admin/applications" className="font-semibold hover:underline" style={{ color: 'var(--brass)' }}>
                  Review applications
                </Link>{' '}
                <span style={{ color: 'var(--muted)' }}>— customers who filled out /apply. Approving creates their account and emails them a login.</span>
              </span>
            </li>
            <li className="flex items-baseline gap-2">
              <span style={{ color: 'var(--brass)' }}>→</span>
              <span style={{ color: 'var(--ink)' }}>
                <Link href="/admin/customers" className="font-semibold hover:underline" style={{ color: 'var(--brass)' }}>
                  Add a customer directly
                </Link>{' '}
                <span style={{ color: 'var(--muted)' }}>— the brewery&rsquo;s existing wholesale accounts. Set a password and share it over the phone.</span>
              </span>
            </li>
            <li className="flex items-baseline gap-2">
              <span style={{ color: 'var(--brass)' }}>→</span>
              <span style={{ color: 'var(--ink)' }}>
                <Link href="/admin/settings" className="font-semibold hover:underline" style={{ color: 'var(--brass)' }}>
                  Set delivery schedule
                </Link>{' '}
                <span style={{ color: 'var(--muted)' }}>— which weekdays the brewery delivers, + lead time. Customers only see those dates at checkout.</span>
              </span>
            </li>
            <li className="flex items-baseline gap-2">
              <span style={{ color: 'var(--brass)' }}>→</span>
              <span style={{ color: 'var(--ink)' }}>
                <Link href="/embed" className="font-semibold hover:underline" style={{ color: 'var(--brass)' }}>
                  Grab the embed code
                </Link>{' '}
                <span style={{ color: 'var(--muted)' }}>— paste the wholesale portal into the main Guidon website as an iframe.</span>
              </span>
            </li>
          </ul>
        </div>
      )}

      {/* Rolling 14-day revenue sparkline. Tiny SVG, no chart library. Hover
          to see per-day detail. Only shown when there's revenue data. */}
      {!loading && revenue14dSum > 0 && (
        <div className="card p-5">
          <div className="flex items-baseline justify-between mb-3">
            <div>
              <span className="section-label">Last 14 Days</span>
              <p className="font-display mt-1" style={{ fontSize: '1.75rem', fontVariationSettings: "'opsz' 36", color: 'var(--ink)', fontWeight: 500 }}>
                {formatCurrency(revenue14dSum)} <span className="text-sm italic font-body" style={{ color: 'var(--muted)' }}>in revenue</span>
              </p>
            </div>
            <div className="text-right text-xs" style={{ color: 'var(--muted)' }}>
              <div>Delivered + completed orders</div>
              <div className="italic mt-0.5">By order placement date</div>
            </div>
          </div>
          <div className="flex items-end gap-1 h-16">
            {revenue14d.map((d) => {
              const pct = Math.max(2, (d.total / revenue14dMax) * 100);
              const label = new Date(d.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
              return (
                <div key={d.date} className="flex-1 flex flex-col items-center justify-end gap-1" title={`${label}: ${formatCurrency(d.total)}`}>
                  <div
                    style={{
                      width: '100%',
                      height: `${pct}%`,
                      background: d.total > 0 ? 'var(--brass)' : 'var(--divider)',
                      borderRadius: '2px',
                      minHeight: '2px',
                    }}
                  />
                </div>
              );
            })}
          </div>
          <div className="flex justify-between text-[10px] mt-1" style={{ color: 'var(--faint)' }}>
            <span>{new Date(revenue14d[0].date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
            <span>{new Date(revenue14d[revenue14d.length - 1].date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
          </div>
        </div>
      )}

      {/* Brewing alert — any size below its par level (admin-set) or the
          default of 5. Shows "3/10" format so Mike sees both current count
          and the threshold that triggered it. */}
      {!loading && lowInventory.length > 0 && (
        <div
          className="border-l-2 pl-4 py-2"
          style={{ borderColor: 'var(--ember)', background: 'color-mix(in srgb, var(--ember) 6%, transparent)' }}
        >
          <span className="section-label mb-1 block" style={{ color: 'var(--ember)' }}>
            Brewing Alert — Below Par
          </span>
          <p className="text-sm text-[var(--ink)]">
            {lowInventory.slice(0, 5).map((item, idx) => (
              <span key={`${item.name}-${item.size}`}>
                {idx > 0 && <span className="text-[var(--muted)]"> &middot; </span>}
                <span className="font-semibold">{item.name}</span>{' '}
                <span className="text-[var(--muted)]">({item.size})</span>:{' '}
                <span className="font-variant-tabular" style={{ color: item.count === 0 ? 'var(--ruby)' : 'var(--ember)' }}>
                  {item.count}
                </span>
                <span className="text-[var(--muted)]">/{item.par}</span>
              </span>
            ))}
            {lowInventory.length > 5 && (
              <span className="text-[var(--muted)]"> &middot; +{lowInventory.length - 5} more</span>
            )}
            {'. '}
            <Link href="/admin/products" className="text-[var(--brass)] underline underline-offset-2">
              Manage inventory &rarr;
            </Link>
          </p>
        </div>
      )}

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-3">
        <Link href="/admin/orders" className="btn-primary">
          Pending Orders
        </Link>
        <Link href="/admin/deliveries" className="btn-secondary">
          Delivery Route
        </Link>
        <Link href="/admin/production" className="btn-secondary">
          What to Brew
        </Link>
        <Link href="/admin/applications" className="btn-outline">
          Review Applications
        </Link>
        <Link href="/admin/products" className="btn-secondary">
          Inventory
        </Link>
      </div>

      {/* Two-column editorial layout for the daily reads */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
        {/* Activity Feed */}
        <section>
          <span className="section-label mb-3 block">Recent Activity</span>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="skeleton h-10 w-full" />
              ))}
            </div>
          ) : recentActivity.length === 0 ? (
            <p className="text-[var(--muted)] text-sm italic">No activity yet.</p>
          ) : (
            <ul className="border-t border-divider">
              {recentActivity.map((item, idx) => (
                <li
                  key={idx}
                  className="py-3 border-b border-divider flex items-baseline justify-between gap-4"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-[var(--ink)]">
                      <span
                        className="inline-block w-1.5 h-1.5 mr-2 align-middle"
                        style={{
                          background:
                            item.type === 'order'
                              ? 'var(--brass)'
                              : item.type === 'application'
                              ? 'var(--olive)'
                              : 'var(--pine)',
                        }}
                      />
                      {item.title}
                    </p>
                    <p className="text-sm text-[var(--muted)] ml-3.5 italic">{item.detail}</p>
                  </div>
                  <span className="text-xs text-[var(--faint)] font-variant-tabular shrink-0">
                    {formatDate(item.date)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Upcoming Deliveries */}
        <section>
          <span className="section-label mb-3 block">Upcoming Deliveries</span>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="skeleton h-10 w-full" />
              ))}
            </div>
          ) : upcomingDeliveries.length === 0 ? (
            <p className="text-[var(--muted)] text-sm italic">No upcoming deliveries.</p>
          ) : (
            <ul className="border-t border-divider">
              {upcomingDeliveries.map((order) => (
                <li
                  key={order.id}
                  className="py-3 border-b border-divider flex items-baseline justify-between gap-4"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-[var(--ink)]">
                      {customerMap.get(order.customerId)?.businessName || 'Unknown'}
                    </p>
                    <p className="text-sm text-[var(--muted)]">
                      {order.id} &middot; {order.items.length} item{order.items.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-semibold text-[var(--ink)] font-variant-tabular">
                      {formatDate(order.deliveryDate)}
                    </p>
                    <span className={cn('badge-sm', getStatusColor(order.status))}>{order.status}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
