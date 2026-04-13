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
        const [invoicesRes, customersRes] = await Promise.all([fetch('/api/invoices'), fetch('/api/customers')]);
        const invoicesData = await invoicesRes.json();
        const customersData = await customersRes.json();
        setInvoices(Array.isArray(invoicesData) ? invoicesData : []);
        setCustomers(Array.isArray(customersData) ? customersData : []);
      } catch (err) { console.error('Failed to load invoices', err); }
      finally { setLoading(false); }
    }
    load();
  }, []);

  const customerMap = new Map(customers.map((c) => [c.id, c]));

  const handleStatusChange = useCallback(async (invoice: Invoice, newStatus: InvoiceStatus) => {
    setUpdating(invoice.id);
    try {
      const res = await fetch('/api/invoices', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: invoice.id, status: newStatus }),
      });
      if (res.ok) {
        setInvoices((prev) => prev.map((inv) =>
          inv.id === invoice.id ? { ...inv, status: newStatus, paidAt: newStatus === 'paid' ? new Date().toISOString() : inv.paidAt } : inv
        ));
      }
    } catch (err) { console.error('Failed to update invoice', err); }
    finally { setUpdating(null); }
  }, []);

  const sorted = [...invoices].sort((a, b) => new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime());

  // Printable invoice view
  if (viewingInvoice) {
    const inv = viewingInvoice;
    const customer = customerMap.get(inv.customerId);
    return (
      <div>
        <div className="no-print mb-6 flex items-center gap-4">
          <button onClick={() => setViewingInvoice(null)} className="btn-secondary px-4 py-2">
            &larr; Back to Invoices
          </button>
          <button onClick={() => window.print()} className="btn-primary">
            Print Invoice
          </button>
        </div>

        <div className="bg-white max-w-3xl mx-auto p-8 sm:p-12 rounded-xl shadow-dark-lg print:shadow-none print:rounded-none">
          {/* Header */}
          <div className="flex justify-between items-start mb-10">
            <div>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-charcoal rounded-lg flex items-center justify-center print:bg-gray-800">
                  <span className="text-gold font-heading font-black text-xl">G</span>
                </div>
                <div>
                  <h1 className="font-heading text-2xl font-black text-gray-900">GUIDON BREWING</h1>
                  <p className="text-[10px] uppercase tracking-[0.3em] text-gray-500 font-semibold">Veteran-Owned Craft Brewery</p>
                </div>
              </div>
              <div className="text-sm text-gray-500 space-y-0.5 mt-4">
                <p>123 Brewery Lane</p>
                <p>Louisville, KY 40202</p>
                <p>info@guidonbrewing.com</p>
              </div>
            </div>
            <div className="text-right">
              <h2 className="font-heading text-3xl font-black text-gray-900 mb-2">INVOICE</h2>
              <p className="text-sm text-gray-500">{inv.id}</p>
              <p className="text-sm text-gray-500">Date: {formatDate(inv.issuedAt)}</p>
              <div className="mt-3">
                {inv.status === 'paid' ? (
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700 uppercase tracking-wider">
                    Paid
                  </span>
                ) : inv.status === 'overdue' ? (
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-orange-100 text-orange-700 uppercase tracking-wider">
                    Overdue
                  </span>
                ) : (
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-red-100 text-red-700 uppercase tracking-wider">
                    Unpaid
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Divider */}
          <div className="h-1 bg-gradient-to-r from-gray-900 via-amber-600 to-gray-900 rounded mb-8" />

          {/* Bill To */}
          <div className="mb-8 p-5 bg-gray-50 rounded-lg border border-gray-200">
            <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.2em] mb-2">Bill To</h3>
            {customer ? (
              <>
                <p className="font-bold text-gray-900 text-lg">{customer.businessName}</p>
                <p className="text-sm text-gray-600">{customer.contactName}</p>
                <p className="text-sm text-gray-500">{customer.address}</p>
                <p className="text-sm text-gray-500">{customer.email}</p>
              </>
            ) : (
              <p className="text-sm text-gray-500">{inv.customerId}</p>
            )}
          </div>

          {/* Line items */}
          <table className="w-full mb-8">
            <thead>
              <tr className="border-b-2 border-gray-900">
                <th className="text-left py-3 text-xs font-bold text-gray-900 uppercase tracking-wider">Product</th>
                <th className="text-left py-3 text-xs font-bold text-gray-900 uppercase tracking-wider">Size</th>
                <th className="text-right py-3 text-xs font-bold text-gray-900 uppercase tracking-wider">Qty</th>
                <th className="text-right py-3 text-xs font-bold text-gray-900 uppercase tracking-wider">Price</th>
                <th className="text-right py-3 text-xs font-bold text-gray-900 uppercase tracking-wider">Deposit</th>
                <th className="text-right py-3 text-xs font-bold text-gray-900 uppercase tracking-wider">Line Total</th>
              </tr>
            </thead>
            <tbody>
              {inv.items.map((item, idx) => (
                <tr key={idx} className="border-b border-gray-200">
                  <td className="py-3 text-sm text-gray-800">{item.productName}</td>
                  <td className="py-3 text-sm text-gray-600">{item.size}</td>
                  <td className="py-3 text-sm text-right text-gray-600">{item.quantity}</td>
                  <td className="py-3 text-sm text-right text-gray-600">{formatCurrency(item.unitPrice)}</td>
                  <td className="py-3 text-sm text-right text-gray-600">{formatCurrency(item.deposit)}</td>
                  <td className="py-3 text-sm text-right font-semibold text-gray-900">
                    {formatCurrency((item.unitPrice + item.deposit) * item.quantity)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Totals */}
          <div className="flex justify-end">
            <div className="w-72 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Subtotal</span>
                <span className="text-gray-800">{formatCurrency(inv.subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Keg Deposits</span>
                <span className="text-gray-800">{formatCurrency(inv.totalDeposit)}</span>
              </div>
              <div className="flex justify-between font-black text-xl border-t-2 border-gray-900 pt-3 mt-3">
                <span className="text-gray-900">Total</span>
                <span className="text-gray-900">{formatCurrency(inv.total)}</span>
              </div>
            </div>
          </div>

          {inv.paidAt && (
            <div className="mt-8 text-center py-3 bg-emerald-50 rounded-lg border border-emerald-200">
              <p className="text-sm text-emerald-700 font-semibold">Paid on {formatDate(inv.paidAt)}</p>
            </div>
          )}

          {/* Footer */}
          <div className="mt-10 pt-6 border-t border-gray-200 text-center text-xs text-gray-400">
            <p>Guidon Brewing Company &bull; Veteran-Owned &bull; Louisville, Kentucky</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <span className="section-label mb-1 block">Billing</span>
        <h2 className="font-heading text-2xl font-black text-cream">Invoices</h2>
      </div>

      <div className="card p-0 overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="skeleton h-12 w-full" />)}</div>
        ) : sorted.length === 0 ? (
          <p className="p-6 text-cream/30 text-sm">No invoices yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-charcoal-200">
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
              <tbody className="divide-y divide-white/[0.04]">
                {sorted.map((inv) => (
                  <tr key={inv.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="table-cell font-semibold text-cream">{inv.id}</td>
                    <td className="table-cell text-cream/50">{inv.orderId}</td>
                    <td className="table-cell">{customerMap.get(inv.customerId)?.businessName || inv.customerId}</td>
                    <td className="table-cell">{formatDate(inv.issuedAt)}</td>
                    <td className="table-cell">
                      <select value={inv.status}
                        disabled={updating === inv.id || inv.status === 'paid'}
                        onChange={(e) => handleStatusChange(inv, e.target.value as InvoiceStatus)}
                        className={cn('badge border-0 cursor-pointer pr-6 appearance-none bg-transparent', getStatusColor(inv.status), updating === inv.id && 'opacity-50')}>
                        <option value="unpaid">Unpaid</option>
                        <option value="paid">Paid</option>
                        <option value="overdue">Overdue</option>
                      </select>
                    </td>
                    <td className="table-cell text-right font-semibold text-cream">{formatCurrency(inv.total)}</td>
                    <td className="table-cell text-right">
                      <button onClick={() => setViewingInvoice(inv)}
                        className="text-gold/70 hover:text-gold text-sm font-semibold transition-colors">
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
