'use client';

import { useState, useEffect, useCallback } from 'react';
import { Invoice, InvoiceStatus, Customer } from '@/lib/types';
import { formatCurrency, formatDate, getStatusColor, cn } from '@/lib/utils';

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [viewingInvoice, setViewingInvoice] = useState<Invoice | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [invoicesRes, customersRes] = await Promise.all([
          fetch('/api/invoices'),
          fetch('/api/customers'),
        ]);
        const invoicesData = await invoicesRes.json();
        const customersData = await customersRes.json();
        setInvoices(Array.isArray(invoicesData) ? invoicesData : []);
        setCustomers(Array.isArray(customersData) ? customersData : []);
      } catch (err) {
        console.error('Failed to load invoices', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const customerMap = new Map(customers.map((c) => [c.id, c]));

  const handleStatusChange = useCallback(async (invoice: Invoice, newStatus: InvoiceStatus) => {
    setUpdating(invoice.id);
    try {
      const res = await fetch('/api/invoices', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: invoice.id, status: newStatus }),
      });
      if (res.ok) {
        setInvoices((prev) =>
          prev.map((inv) =>
            inv.id === invoice.id
              ? { ...inv, status: newStatus, paidAt: newStatus === 'paid' ? new Date().toISOString() : inv.paidAt }
              : inv
          )
        );
      }
    } catch (err) {
      console.error('Failed to update invoice', err);
    } finally {
      setUpdating(null);
    }
  }, []);

  const sorted = [...invoices].sort(
    (a, b) => new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime()
  );

  // Printable invoice view
  if (viewingInvoice) {
    const inv = viewingInvoice;
    const customer = customerMap.get(inv.customerId);
    return (
      <div>
        <div className="no-print mb-6 flex items-center gap-4">
          <button onClick={() => setViewingInvoice(null)} className="btn-outline">
            &larr; Back to Invoices
          </button>
          <button onClick={() => window.print()} className="btn-primary">
            Print Invoice
          </button>
        </div>

        <div className="bg-white max-w-3xl mx-auto p-8 rounded-xl shadow-sm border border-cream-200 print:shadow-none print:border-none">
          {/* Header */}
          <div className="flex justify-between items-start mb-8">
            <div>
              <h1 className="font-heading text-3xl font-bold text-olive">Guidon Brewing Co.</h1>
              <p className="text-sm text-brown-200 mt-1">123 Brewery Lane</p>
              <p className="text-sm text-brown-200">Austin, TX 78701</p>
              <p className="text-sm text-brown-200">info@guidonbrewing.com</p>
            </div>
            <div className="text-right">
              <h2 className="font-heading text-2xl font-bold text-olive">INVOICE</h2>
              <p className="text-sm text-brown-200 mt-1">{inv.id}</p>
              <p className="text-sm text-brown-200">Date: {formatDate(inv.issuedAt)}</p>
              <span className={cn('badge mt-2', getStatusColor(inv.status))}>
                {inv.status.toUpperCase()}
              </span>
            </div>
          </div>

          {/* Bill To */}
          <div className="mb-8 p-4 bg-cream-50 rounded-lg">
            <h3 className="text-xs font-semibold text-olive uppercase tracking-wider mb-2">Bill To</h3>
            {customer ? (
              <>
                <p className="font-semibold text-brown">{customer.businessName}</p>
                <p className="text-sm text-brown-200">{customer.contactName}</p>
                <p className="text-sm text-brown-200">{customer.address}</p>
                <p className="text-sm text-brown-200">{customer.email}</p>
              </>
            ) : (
              <p className="text-sm text-brown-200">{inv.customerId}</p>
            )}
          </div>

          {/* Line items */}
          <table className="w-full mb-6">
            <thead>
              <tr className="border-b-2 border-olive">
                <th className="text-left py-2 text-sm font-semibold text-olive">Product</th>
                <th className="text-left py-2 text-sm font-semibold text-olive">Size</th>
                <th className="text-right py-2 text-sm font-semibold text-olive">Qty</th>
                <th className="text-right py-2 text-sm font-semibold text-olive">Price</th>
                <th className="text-right py-2 text-sm font-semibold text-olive">Deposit</th>
                <th className="text-right py-2 text-sm font-semibold text-olive">Line Total</th>
              </tr>
            </thead>
            <tbody>
              {inv.items.map((item, idx) => (
                <tr key={idx} className="border-b border-cream-200">
                  <td className="py-2 text-sm">{item.productName}</td>
                  <td className="py-2 text-sm">{item.size}</td>
                  <td className="py-2 text-sm text-right">{item.quantity}</td>
                  <td className="py-2 text-sm text-right">{formatCurrency(item.unitPrice)}</td>
                  <td className="py-2 text-sm text-right">{formatCurrency(item.deposit)}</td>
                  <td className="py-2 text-sm text-right font-medium">
                    {formatCurrency((item.unitPrice + item.deposit) * item.quantity)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Totals */}
          <div className="flex justify-end">
            <div className="w-64 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-brown-200">Subtotal</span>
                <span>{formatCurrency(inv.subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-brown-200">Keg Deposits</span>
                <span>{formatCurrency(inv.totalDeposit)}</span>
              </div>
              <div className="flex justify-between font-bold text-lg border-t-2 border-olive pt-2">
                <span>Total</span>
                <span>{formatCurrency(inv.total)}</span>
              </div>
            </div>
          </div>

          {inv.paidAt && (
            <p className="mt-6 text-sm text-green-700 text-center font-medium">
              Paid on {formatDate(inv.paidAt)}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="font-heading text-2xl font-bold text-olive">Invoices</h2>

      <div className="card p-0 overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="skeleton h-12 w-full" />
            ))}
          </div>
        ) : sorted.length === 0 ? (
          <p className="p-6 text-brown-200 text-sm">No invoices yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-cream-50">
                <tr>
                  <th className="table-header">Invoice ID</th>
                  <th className="table-header">Order ID</th>
                  <th className="table-header">Customer</th>
                  <th className="table-header">Date</th>
                  <th className="table-header">Status</th>
                  <th className="table-header text-right">Total</th>
                  <th className="table-header text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cream-200">
                {sorted.map((inv) => (
                  <tr key={inv.id} className="hover:bg-cream-50 transition-colors">
                    <td className="table-cell font-medium">{inv.id}</td>
                    <td className="table-cell">{inv.orderId}</td>
                    <td className="table-cell">
                      {customerMap.get(inv.customerId)?.businessName || inv.customerId}
                    </td>
                    <td className="table-cell">{formatDate(inv.issuedAt)}</td>
                    <td className="table-cell">
                      <select
                        value={inv.status}
                        disabled={updating === inv.id || inv.status === 'paid'}
                        onChange={(e) => handleStatusChange(inv, e.target.value as InvoiceStatus)}
                        className={cn(
                          'badge border-0 cursor-pointer pr-6 appearance-none',
                          getStatusColor(inv.status),
                          updating === inv.id && 'opacity-50'
                        )}
                      >
                        <option value="unpaid">Unpaid</option>
                        <option value="paid">Paid</option>
                        <option value="overdue">Overdue</option>
                      </select>
                    </td>
                    <td className="table-cell text-right font-medium">{formatCurrency(inv.total)}</td>
                    <td className="table-cell text-right">
                      <button
                        onClick={() => setViewingInvoice(inv)}
                        className="text-olive hover:text-olive-600 text-sm font-medium"
                      >
                        View
                      </button>
                    </td>
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
