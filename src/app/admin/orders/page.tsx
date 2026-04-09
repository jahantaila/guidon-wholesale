'use client';

import { useState, useEffect, useCallback, Fragment } from 'react';
import { Order, OrderStatus, Customer } from '@/lib/types';
import { formatCurrency, formatDate, getStatusColor, cn } from '@/lib/utils';

const STATUS_FLOW: OrderStatus[] = ['pending', 'confirmed', 'delivered', 'completed'];

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<OrderStatus | 'all'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [ordersRes, customersRes] = await Promise.all([
          fetch('/api/orders'),
          fetch('/api/customers'),
        ]);
        const ordersData = await ordersRes.json();
        const customersData = await customersRes.json();
        setOrders(Array.isArray(ordersData) ? ordersData : []);
        setCustomers(Array.isArray(customersData) ? customersData : []);
      } catch (err) {
        console.error('Failed to load orders', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const customerMap = new Map(customers.map((c) => [c.id, c]));

  const handleStatusChange = useCallback(async (order: Order, newStatus: OrderStatus) => {
    setUpdating(order.id);
    try {
      const res = await fetch('/api/orders', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: order.id, status: newStatus }),
      });
      if (res.ok) {
        setOrders((prev) =>
          prev.map((o) => (o.id === order.id ? { ...o, status: newStatus } : o))
        );
      }
    } catch (err) {
      console.error('Failed to update order status', err);
    } finally {
      setUpdating(null);
    }
  }, []);

  const filtered = filter === 'all'
    ? orders
    : orders.filter((o) => o.status === filter);

  const sorted = [...filtered].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return (
    <div className="space-y-6">
      <h2 className="font-heading text-2xl font-bold text-olive">Orders</h2>

      {/* Status filter tabs */}
      <div className="flex flex-wrap gap-2">
        {(['all', ...STATUS_FLOW] as const).map((status) => (
          <button
            key={status}
            onClick={() => setFilter(status)}
            className={cn(
              'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
              filter === status
                ? 'bg-olive text-white'
                : 'bg-white border border-cream-200 text-brown hover:bg-cream-50'
            )}
          >
            {status === 'all' ? 'All' : status.charAt(0).toUpperCase() + status.slice(1)}
            {status !== 'all' && (
              <span className="ml-1.5 text-xs opacity-70">
                ({orders.filter((o) => o.status === status).length})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Orders table */}
      <div className="card p-0 overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="skeleton h-12 w-full" />
            ))}
          </div>
        ) : sorted.length === 0 ? (
          <p className="p-6 text-brown-200 text-sm">No orders found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-cream-50">
                <tr>
                  <th className="table-header">Order ID</th>
                  <th className="table-header">Customer</th>
                  <th className="table-header">Date</th>
                  <th className="table-header">Delivery</th>
                  <th className="table-header">Items</th>
                  <th className="table-header">Status</th>
                  <th className="table-header text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cream-200">
                {sorted.map((order) => {
                  const isExpanded = expandedId === order.id;
                  const currentIdx = STATUS_FLOW.indexOf(order.status);
                  const nextStatuses = STATUS_FLOW.slice(currentIdx);
                  return (
                    <Fragment key={order.id}>
                      <tr
                        onClick={() => setExpandedId(isExpanded ? null : order.id)}
                        className="hover:bg-cream-50 transition-colors cursor-pointer"
                      >
                        <td className="table-cell font-medium">{order.id}</td>
                        <td className="table-cell">
                          {customerMap.get(order.customerId)?.businessName || order.customerId}
                        </td>
                        <td className="table-cell">{formatDate(order.createdAt)}</td>
                        <td className="table-cell">{formatDate(order.deliveryDate)}</td>
                        <td className="table-cell">{order.items.length}</td>
                        <td className="table-cell" onClick={(e) => e.stopPropagation()}>
                          <select
                            value={order.status}
                            disabled={updating === order.id || order.status === 'completed'}
                            onChange={(e) => handleStatusChange(order, e.target.value as OrderStatus)}
                            className={cn(
                              'badge border-0 cursor-pointer pr-6 appearance-none',
                              getStatusColor(order.status),
                              updating === order.id && 'opacity-50'
                            )}
                          >
                            {nextStatuses.map((s) => (
                              <option key={s} value={s}>
                                {s.charAt(0).toUpperCase() + s.slice(1)}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="table-cell text-right font-medium">{formatCurrency(order.total)}</td>
                      </tr>
                      {isExpanded && (
                        <tr>
                          <td colSpan={7} className="bg-cream-50 px-6 py-4">
                            <div className="animate-fade-in space-y-4">
                              <h4 className="font-semibold text-olive">Order Items</h4>
                              <table className="w-full text-sm">
                                <thead>
                                  <tr>
                                    <th className="text-left py-1 text-olive">Product</th>
                                    <th className="text-left py-1 text-olive">Size</th>
                                    <th className="text-right py-1 text-olive">Qty</th>
                                    <th className="text-right py-1 text-olive">Price</th>
                                    <th className="text-right py-1 text-olive">Deposit</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {order.items.map((item, idx) => (
                                    <tr key={idx} className="border-t border-cream-200">
                                      <td className="py-1">{item.productName}</td>
                                      <td className="py-1">{item.size}</td>
                                      <td className="py-1 text-right">{item.quantity}</td>
                                      <td className="py-1 text-right">{formatCurrency(item.unitPrice)}</td>
                                      <td className="py-1 text-right">{formatCurrency(item.deposit)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                              {order.kegReturns.length > 0 && (
                                <div>
                                  <h4 className="font-semibold text-olive mt-2">Keg Returns</h4>
                                  <div className="flex gap-4 mt-1 text-sm">
                                    {order.kegReturns.map((kr, idx) => (
                                      <span key={idx} className="badge bg-green-100 text-green-800">
                                        {kr.size}: {kr.quantity}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}
                              <div className="flex gap-6 text-sm pt-2 border-t border-cream-200">
                                <span>Subtotal: <strong>{formatCurrency(order.subtotal)}</strong></span>
                                <span>Deposits: <strong>{formatCurrency(order.totalDeposit)}</strong></span>
                                <span>Total: <strong>{formatCurrency(order.total)}</strong></span>
                              </div>
                              {order.notes && (
                                <p className="text-sm text-brown-200 italic">Notes: {order.notes}</p>
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
          </div>
        )}
      </div>
    </div>
  );
}
