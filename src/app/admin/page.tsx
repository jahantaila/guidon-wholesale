'use client';

import { useState, useEffect, useRef } from 'react';
import { AdminStats, Order, Customer } from '@/lib/types';
import { formatCurrency, formatDate, getStatusColor, cn } from '@/lib/utils';

function useCountUp(end: number, duration: number = 1200, active: boolean = true): number {
  const [value, setValue] = useState(0);
  const ref = useRef<number>(0);

  useEffect(() => {
    if (!active) return;
    const startTime = Date.now();
    const startVal = ref.current;
    const diff = end - startVal;

    function tick() {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(startVal + diff * eased);
      setValue(current);
      ref.current = current;
      if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }, [end, duration, active]);

  return value;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [statsRes, ordersRes, customersRes] = await Promise.all([
          fetch('/api/admin/stats'), fetch('/api/orders'), fetch('/api/customers'),
        ]);
        const statsData = await statsRes.json();
        const ordersData = await ordersRes.json();
        const customersData = await customersRes.json();
        setStats(statsData);
        setOrders(Array.isArray(ordersData) ? ordersData : []);
        setCustomers(Array.isArray(customersData) ? customersData : []);
      } catch (err) {
        console.error('Failed to load dashboard data', err);
      } finally { setLoading(false); }
    }
    load();
  }, []);

  const customerMap = new Map(customers.map((c) => [c.id, c]));
  const recentOrders = [...orders]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5);

  const kegsOut = useCountUp(stats?.kegsOut ?? 0, 1200, !!stats);
  const pendingOrders = useCountUp(stats?.pendingOrders ?? 0, 800, !!stats);
  const totalRevenue = useCountUp(Math.round(stats?.totalRevenue ?? 0), 1500, !!stats);
  const totalCustomers = useCountUp(stats?.totalCustomers ?? 0, 900, !!stats);
  const pendingApps = useCountUp(stats?.pendingApplications ?? 0, 700, !!stats);

  const statCards = [
    { label: 'Kegs Out', value: kegsOut, display: kegsOut.toString(), color: 'text-gold', borderColor: 'border-gold/15', icon: KegsOutIcon },
    { label: 'Pending Orders', value: pendingOrders, display: pendingOrders.toString(), color: 'text-amber-400', borderColor: 'border-amber-500/15', icon: PendingIcon },
    { label: 'Total Revenue', value: totalRevenue, display: formatCurrency(totalRevenue), color: 'text-emerald-400', borderColor: 'border-emerald-500/15', icon: RevenueIcon },
    { label: 'Total Customers', value: totalCustomers, display: totalCustomers.toString(), color: 'text-blue-400', borderColor: 'border-blue-500/15', icon: CustomersCountIcon },
    { label: 'Applications', value: pendingApps, display: pendingApps.toString(), color: 'text-purple-400', borderColor: 'border-purple-500/15', icon: ApplicationsIcon },
  ];

  return (
    <div className="space-y-8">
      <div>
        <span className="section-label mb-1 block">Overview</span>
        <h2 className="font-heading text-2xl font-black text-cream">Dashboard</h2>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="card"><div className="skeleton h-4 w-24 mb-4" /><div className="skeleton h-10 w-20" /></div>
            ))
          : statCards.map((card, i) => {
              const Icon = card.icon;
              return (
                <div key={card.label}
                  className={cn('stat-card border animate-slide-up', card.borderColor)}
                  style={{ animationDelay: `${i * 80}ms` }}>
                  <div className="relative flex items-center justify-between mb-3">
                    <span className="section-label">{card.label}</span>
                    <Icon className={cn('w-4 h-4', card.color)} />
                  </div>
                  <p className={cn('relative text-3xl font-heading font-black', card.color)}>{card.display}</p>
                </div>
              );
            })}
      </div>

      {/* Recent orders */}
      <div>
        <span className="section-label mb-4 block">Recent Orders</span>
        <div className="card p-0 overflow-hidden">
          {loading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => <div key={i} className="skeleton h-12 w-full rounded-lg" />)}
            </div>
          ) : recentOrders.length === 0 ? (
            <p className="p-6 text-cream/25 text-sm">No orders yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-charcoal-200">
                  <tr>
                    <th className="table-header">Order ID</th>
                    <th className="table-header">Customer</th>
                    <th className="table-header">Date</th>
                    <th className="table-header">Status</th>
                    <th className="table-header text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {recentOrders.map((order) => (
                    <tr key={order.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="table-cell font-heading font-bold text-cream">{order.id}</td>
                      <td className="table-cell">{customerMap.get(order.customerId)?.businessName || order.customerId}</td>
                      <td className="table-cell text-cream/40">{formatDate(order.createdAt)}</td>
                      <td className="table-cell">
                        <span className={cn('badge-sm', getStatusColor(order.status))}>{order.status}</span>
                      </td>
                      <td className="table-cell text-right font-heading font-bold text-cream">{formatCurrency(order.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function KegsOutIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>;
}

function PendingIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
}

function RevenueIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
}

function CustomersCountIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>;
}

function ApplicationsIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>;
}
