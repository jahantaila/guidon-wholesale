'use client';

import { useState, useEffect } from 'react';
import { AdminStats, Order, Customer } from '@/lib/types';
import { formatCurrency, formatDate, getStatusColor, cn } from '@/lib/utils';

export default function AdminDashboard() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [statsRes, ordersRes, customersRes] = await Promise.all([
          fetch('/api/admin/stats'),
          fetch('/api/orders'),
          fetch('/api/customers'),
        ]);
        const statsData = await statsRes.json();
        const ordersData = await ordersRes.json();
        const customersData = await customersRes.json();
        setStats(statsData);
        setOrders(Array.isArray(ordersData) ? ordersData : []);
        setCustomers(Array.isArray(customersData) ? customersData : []);
      } catch (err) {
        console.error('Failed to load dashboard data', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const customerMap = new Map(customers.map((c) => [c.id, c]));
  const recentOrders = [...orders]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5);

  const statCards = stats
    ? [
        { label: 'Kegs Out', value: stats.kegsOut, color: 'text-olive', bgColor: 'bg-olive-50' },
        { label: 'Pending Orders', value: stats.pendingOrders, color: 'text-amber', bgColor: 'bg-amber-50' },
        { label: 'Total Revenue', value: formatCurrency(stats.totalRevenue), color: 'text-green-600', bgColor: 'bg-green-50' },
        { label: 'Total Customers', value: stats.totalCustomers, color: 'text-blue-600', bgColor: 'bg-blue-50' },
      ]
    : [];

  const statIcons = [KegsOutIcon, PendingIcon, RevenueIcon, CustomersCountIcon];

  return (
    <div className="space-y-8">
      <h2 className="font-heading text-2xl font-bold text-olive">Dashboard</h2>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="card">
                <div className="skeleton h-4 w-24 mb-3" />
                <div className="skeleton h-8 w-16" />
              </div>
            ))
          : statCards.map((card, i) => {
              const Icon = statIcons[i];
              return (
                <div key={card.label} className="card animate-slide-up" style={{ animationDelay: `${i * 75}ms`, animationFillMode: 'both' }}>
                  <div className="flex items-center gap-3 mb-2">
                    <div className={cn('p-2 rounded-lg', card.bgColor)}>
                      <Icon className={cn('w-5 h-5', card.color)} />
                    </div>
                    <span className="text-sm font-medium text-brown-200">{card.label}</span>
                  </div>
                  <p className={cn('text-2xl font-bold', card.color)}>{card.value}</p>
                </div>
              );
            })}
      </div>

      {/* Recent orders */}
      <div className="card p-0 overflow-hidden">
        <div className="px-6 py-4 border-b border-cream-200">
          <h3 className="font-heading text-lg font-semibold text-olive">Recent Orders</h3>
        </div>
        {loading ? (
          <div className="p-6 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="skeleton h-10 w-full" />
            ))}
          </div>
        ) : recentOrders.length === 0 ? (
          <p className="p-6 text-brown-200 text-sm">No orders yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-cream-50">
                <tr>
                  <th className="table-header">Order ID</th>
                  <th className="table-header">Customer</th>
                  <th className="table-header">Date</th>
                  <th className="table-header">Status</th>
                  <th className="table-header text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cream-200">
                {recentOrders.map((order) => (
                  <tr key={order.id} className="hover:bg-cream-50 transition-colors">
                    <td className="table-cell font-medium">{order.id}</td>
                    <td className="table-cell">
                      {customerMap.get(order.customerId)?.businessName || order.customerId}
                    </td>
                    <td className="table-cell">{formatDate(order.createdAt)}</td>
                    <td className="table-cell">
                      <span className={cn('badge', getStatusColor(order.status))}>
                        {order.status}
                      </span>
                    </td>
                    <td className="table-cell text-right font-medium">{formatCurrency(order.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function KegsOutIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
    </svg>
  );
}

function PendingIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function RevenueIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function CustomersCountIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}
