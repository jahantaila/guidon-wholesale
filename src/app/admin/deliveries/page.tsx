'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import type { Order, Customer } from '@/lib/types';
import { formatCurrency, formatDate, formatAddress, formatPhone } from '@/lib/utils';
import { adminFetch } from '@/lib/admin-fetch';

export default function DeliveriesPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      adminFetch('/api/orders').then((r) => r.json()),
      // includeArchived so orders tied to archived accounts still render
      // with their customer name on the delivery route, not "Unknown".
      adminFetch('/api/customers?includeArchived=true').then((r) => r.json()),
    ])
      .then(([o, c]) => {
        setOrders(Array.isArray(o) ? o : []);
        setCustomers(Array.isArray(c) ? c : []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const customerMap = new Map(customers.map((c) => [c.id, c]));

  // Pending + confirmed deliveries, oldest first so the brewery loads the
  // route in the order they were placed. Per-order delivery dates were
  // removed in 2026-04-29 — the brewery delivers Thursdays + Fridays and
  // schedules these as one pile.
  const queue: Order[] = orders
    .filter((o) => o.status === 'pending' || o.status === 'confirmed')
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const totalKegs = queue.reduce(
    (sum, o) => sum + o.items.reduce((s, i) => s + i.quantity, 0),
    0,
  );

  return (
    <div className="space-y-8">
      {/* Header — hidden when printing */}
      <div className="no-print">
        <div className="flex items-center justify-between">
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
          <button onClick={() => window.print()} className="btn-primary">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"
              />
            </svg>
            Print Route Sheet
          </button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          <div className="skeleton h-8 w-2/3" />
          <div className="skeleton h-16 w-full" />
          <div className="skeleton h-16 w-full" />
        </div>
      ) : queue.length === 0 ? (
        <p className="italic text-[var(--muted)]">
          No pending or confirmed deliveries. All caught up.
        </p>
      ) : (
        <>
          {/* Print-only letterhead */}
          <div className="hidden print:block mb-8 text-center">
            <h1
              style={{
                fontFamily: "'Fraunces', serif",
                fontSize: '2rem',
                marginBottom: '0.25rem',
              }}
            >
              Guidon Brewing Co. — Delivery Route
            </h1>
            <p style={{ fontSize: '0.875rem', color: '#555', marginBottom: '0.5rem' }}>
              415 8th Ave. E., Hendersonville, NC 28792
            </p>
            <p style={{ fontSize: '0.75rem', color: '#555' }}>
              Printed {new Date().toLocaleString()}
            </p>
          </div>

          <section className="print:break-inside-avoid">
            <div
              className="flex items-baseline gap-4 pb-2 mb-4 border-b-2"
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
                Pending Deliveries
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
                            style={{
                              fontSize: '1.5rem',
                              color: 'var(--brass)',
                              fontVariationSettings: "'opsz' 36",
                              fontWeight: 500,
                            }}
                          >
                            {idx + 1}
                          </span>
                        </div>
                        <div className="col-span-5">
                          <p
                            className="font-display"
                            style={{
                              fontSize: '1.25rem',
                              fontVariationSettings: "'opsz' 24",
                              color: 'var(--ink)',
                              fontWeight: 500,
                            }}
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
                            style={{
                              fontSize: '1.125rem',
                              fontVariationSettings: "'opsz' 20",
                              color: 'var(--ink)',
                              fontWeight: 500,
                            }}
                          >
                            {formatCurrency(order.total)}
                          </p>
                          <p className="text-xs font-variant-tabular" style={{ color: 'var(--muted)' }}>
                            {orderKegs} keg{orderKegs === 1 ? '' : 's'} out
                          </p>
                          <p className="text-xs uppercase tracking-wider font-ui mt-1" style={{ color: order.status === 'confirmed' ? 'var(--pine)' : 'var(--ember)' }}>
                            {order.status}
                          </p>
                          <Link
                            href={`/admin/orders`}
                            className="text-xs italic no-print"
                            style={{ color: 'var(--brass)' }}
                          >
                            &rarr; View in orders
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
