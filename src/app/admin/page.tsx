'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { AdminStats, Order, Customer, WholesaleApplication, Invoice, Product } from '@/lib/types';
import { formatCurrency, formatDate, getStatusColor, cn } from '@/lib/utils';
import { adminFetch } from '@/lib/admin-fetch';

export default function AdminDashboard() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [applications, setApplications] = useState<(WholesaleApplication & { status?: string })[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [statsRes, ordersRes, customersRes, appsRes, invoicesRes, productsRes] = await Promise.all([
          adminFetch('/api/admin/stats', { cache: 'no-store' }),
          adminFetch('/api/orders', { cache: 'no-store' }),
          adminFetch('/api/customers', { cache: 'no-store' }),
          adminFetch('/api/applications', { cache: 'no-store' }),
          adminFetch('/api/invoices', { cache: 'no-store' }),
          adminFetch('/api/products', { cache: 'no-store' }),
        ]);
        // Only accept the response as stats if the request succeeded AND the
        // body has the expected shape. Otherwise leave stats null so the
        // ledger line falls back to the 'couldn't load' message instead of
        // rendering NaN / empty numerals.
        if (statsRes.ok) {
          const raw = await statsRes.json().catch(() => null);
          if (raw && typeof raw === 'object' && 'kegsOut' in raw) {
            setStats(raw as AdminStats);
          } else {
            setStats(null);
          }
        } else {
          setStats(null);
        }
        const safeArr = async (r: Response) => (r.ok ? r.json().catch(() => []) : []);
        const [ordersData, customersData, appsData, invoicesData, productsData] = await Promise.all([
          safeArr(ordersRes),
          safeArr(customersRes),
          safeArr(appsRes),
          safeArr(invoicesRes),
          safeArr(productsRes),
        ]);
        setOrders(Array.isArray(ordersData) ? ordersData : []);
        setCustomers(Array.isArray(customersData) ? customersData : []);
        setApplications(Array.isArray(appsData) ? appsData : []);
        setInvoices(Array.isArray(invoicesData) ? invoicesData : []);
        setProducts(Array.isArray(productsData) ? productsData : []);
      } catch (err) {
        console.error('Failed to load dashboard data', err);
      } finally {
        setLoading(false);
      }
    }
    load();
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

  // Low inventory — any product-size with count < 5
  const lowInventory = products.flatMap((p) =>
    p.sizes
      .filter((s) => s.inventoryCount < 5)
      .map((s) => ({ name: p.name, size: s.size, count: s.inventoryCount })),
  );

  // Rolling 14-day revenue bucketed by day (delivered + completed orders only).
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
      if (o.status !== 'delivered' && o.status !== 'completed') continue;
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
      ) : stats ? (
        <div className="ledger-line">
          <span className="font-display italic text-[var(--muted)] mr-2" style={{ fontVariationSettings: "'opsz' 24" }}>
            Today,
          </span>
          <span className="ledger-num">{stats.kegsOut ?? 0}</span> kegs outstanding with wholesale accounts.{' '}
          <span className="ledger-num">{stats.pendingOrders ?? 0}</span> order{stats.pendingOrders === 1 ? '' : 's'} pending delivery.{' '}
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
          <span className="ledger-num">{formatCurrency(stats.totalRevenue ?? 0)}</span> in revenue across{' '}
          <span className="ledger-num">{stats.totalCustomers ?? 0}</span> wholesale account{stats.totalCustomers === 1 ? '' : 's'}
          {(stats.pendingApplications ?? 0) > 0 && (
            <>
              , plus <span className="ledger-num">{stats.pendingApplications}</span> application{stats.pendingApplications === 1 ? '' : 's'} awaiting review
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

      {/* Low inventory warning — only shown when there's something to flag */}
      {!loading && lowInventory.length > 0 && (
        <div
          className="border-l-2 pl-4 py-2"
          style={{ borderColor: 'var(--ember)', background: 'color-mix(in srgb, var(--ember) 6%, transparent)' }}
        >
          <span className="section-label mb-1 block" style={{ color: 'var(--ember)' }}>
            Low Stock
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
