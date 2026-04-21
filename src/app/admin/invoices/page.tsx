'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Image from 'next/image';
import { Invoice, InvoiceStatus, Customer, Order } from '@/lib/types';
import { formatCurrency, formatDate, getStatusColor, cn } from '@/lib/utils';
import { adminFetch } from '@/lib/admin-fetch';

type FilterStatus = InvoiceStatus | 'all';
type ViewMode = 'table' | 'cards';

const STATUS_DESCRIPTIONS: Record<InvoiceStatus, string> = {
  draft: 'Auto-generated when the order was placed. Not visible to the customer yet. Send when ready to bill.',
  unpaid: 'Emailed to the customer. Awaiting payment.',
  paid: 'Customer paid. Closed.',
  overdue: 'Unpaid past due date — follow up with the customer.',
};

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [viewingInvoice, setViewingInvoice] = useState<Invoice | null>(null);
  // When toggling into/out of the full-page invoice viewer, scroll to top
  // so the user doesn't land mid-viewport on the opposite page.
  useEffect(() => { if (typeof window !== 'undefined') window.scrollTo(0, 0); }, [viewingInvoice]);
  const [filter, setFilter] = useState<FilterStatus>('all');
  const [search, setSearch] = useState('');
  const [view, setView] = useState<ViewMode>('table');
  const [creatingFor, setCreatingFor] = useState<string>(''); // orderId or ''
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const [invRes, custRes, ordRes] = await Promise.all([
        adminFetch('/api/invoices'),
        adminFetch('/api/customers'),
        adminFetch('/api/orders'),
      ]);
      const [invData, custData, ordData] = await Promise.all([invRes.json(), custRes.json(), ordRes.json()]);
      setInvoices(Array.isArray(invData) ? invData : []);
      setCustomers(Array.isArray(custData) ? custData : []);
      setOrders(Array.isArray(ordData) ? ordData : []);
    } catch (err) { console.error('Failed to load invoices', err); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const customerMap = useMemo(() => new Map(customers.map((c) => [c.id, c])), [customers]);

  const flash = (type: 'success' | 'error', text: string) => {
    setToast({ type, text });
    window.setTimeout(() => setToast(null), 4000);
  };

  const handleStatusChange = useCallback(async (invoice: Invoice, newStatus: InvoiceStatus) => {
    setUpdating(invoice.id);
    try {
      const res = await adminFetch('/api/invoices', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: invoice.id, status: newStatus }),
      });
      if (res.ok) {
        const updated = await res.json();
        setInvoices((prev) => prev.map((inv) => inv.id === invoice.id ? updated : inv));
        if (newStatus === 'unpaid') flash('success', `Invoice ${invoice.id} sent to customer.`);
        else if (newStatus === 'paid') flash('success', `Invoice ${invoice.id} marked paid.`);
      } else {
        flash('error', 'Update failed.');
      }
    } catch (err) { console.error('Failed to update invoice', err); flash('error', 'Update failed.'); }
    finally { setUpdating(null); }
  }, []);

  const handleResend = useCallback(async (invoice: Invoice) => {
    setUpdating(invoice.id);
    try {
      const res = await adminFetch('/api/invoices', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: invoice.id, action: 'resend' }),
      });
      if (res.ok) {
        const updated = await res.json();
        setInvoices((prev) => prev.map((inv) => inv.id === invoice.id ? updated : inv));
        flash('success', `Invoice ${invoice.id} re-sent.`);
      } else flash('error', 'Resend failed.');
    } catch { flash('error', 'Resend failed.'); }
    finally { setUpdating(null); }
  }, []);

  const handleCreate = useCallback(async (orderId: string, autoSend: boolean) => {
    if (!orderId) return;
    setUpdating('create');
    try {
      const res = await adminFetch('/api/invoices', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, autoSend }),
      });
      if (res.ok) {
        const inv = await res.json();
        setInvoices((prev) => [inv, ...prev]);
        setCreatingFor('');
        flash('success', autoSend ? `Invoice created + sent.` : `Draft invoice created.`);
      } else {
        const data = await res.json().catch(() => ({}));
        flash('error', data?.error || 'Create failed.');
      }
    } catch { flash('error', 'Create failed.'); }
    finally { setUpdating(null); }
  }, []);

  // Orders without any invoice (for the "Create Invoice" dropdown)
  const ordersWithoutInvoice = useMemo(() => {
    const invoicedOrderIds = new Set(invoices.map((i) => i.orderId));
    return orders.filter((o) => !invoicedOrderIds.has(o.id))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [invoices, orders]);

  // Counts per filter status for the chip badges
  const counts = useMemo(() => {
    const base = { all: invoices.length, draft: 0, unpaid: 0, paid: 0, overdue: 0 };
    invoices.forEach((i) => { base[i.status] = (base[i.status] || 0) + 1; });
    return base;
  }, [invoices]);

  // Revenue roll-ups for the top summary
  const totals = useMemo(() => {
    const outstanding = invoices.filter((i) => i.status === 'unpaid' || i.status === 'overdue')
      .reduce((sum, i) => sum + i.total, 0);
    const collected = invoices.filter((i) => i.status === 'paid')
      .reduce((sum, i) => sum + i.total, 0);
    const drafts = invoices.filter((i) => i.status === 'draft')
      .reduce((sum, i) => sum + i.total, 0);
    return { outstanding, collected, drafts };
  }, [invoices]);

  const filtered = useMemo(() => {
    let result = invoices;
    if (filter !== 'all') result = result.filter((i) => i.status === filter);
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((i) => {
        const cust = customerMap.get(i.customerId);
        return i.id.toLowerCase().includes(q)
          || i.orderId.toLowerCase().includes(q)
          || (cust?.businessName.toLowerCase().includes(q) ?? false);
      });
    }
    return [...result].sort((a, b) => new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime());
  }, [invoices, filter, search, customerMap]);

  // Printable invoice view
  if (viewingInvoice) {
    const inv = viewingInvoice;
    const customer = customerMap.get(inv.customerId);
    return (
      <div>
        <div className="no-print mb-6 flex items-center gap-4 flex-wrap">
          <button onClick={() => setViewingInvoice(null)} className="btn-secondary px-4 py-2">
            &larr; Back to Invoices
          </button>
          <button onClick={() => window.print()} className="btn-primary">
            Print / Download PDF
          </button>
          {inv.status === 'draft' && (
            <button
              onClick={async () => { await handleStatusChange(inv, 'unpaid'); setViewingInvoice({ ...inv, status: 'unpaid' }); }}
              disabled={updating === inv.id}
              className="btn-secondary px-4 py-2" style={{ color: 'var(--brass)', borderColor: 'var(--brass)' }}>
              Send to Customer
            </button>
          )}
          {(inv.status === 'unpaid' || inv.status === 'overdue') && (
            <button
              onClick={() => handleResend(inv)}
              disabled={updating === inv.id}
              className="btn-secondary px-4 py-2">
              {updating === inv.id ? 'Sending...' : 'Re-send Email'}
            </button>
          )}
        </div>

        <div className="bg-white max-w-3xl mx-auto p-8 sm:p-12 rounded-xl shadow-dark-lg print:shadow-none print:rounded-none">
          {/* Header */}
          <div className="flex justify-between items-start mb-10">
            <div>
              <div className="flex items-center gap-3 mb-3">
                <Image src="/logo.png" alt="Guidon Brewing Co." width={350} height={194} className="h-10 w-auto rounded-lg" />
                <div>
                  <h1 className="font-heading text-2xl font-black text-gray-900">GUIDON BREWING CO.</h1>
                  <p className="text-[10px] uppercase tracking-[0.3em] text-gray-500 font-semibold">Veteran-Owned Craft Brewery</p>
                </div>
              </div>
              <div className="text-sm text-gray-500 space-y-0.5 mt-4">
                <p>415 8th Ave. E.</p>
                <p>Hendersonville, NC 28792</p>
                <p>info@guidonbrewing.com</p>
              </div>
            </div>
            <div className="text-right">
              <h2 className="font-heading text-3xl font-black text-gray-900 mb-2">INVOICE</h2>
              <p className="text-sm text-gray-500">{inv.id}</p>
              <p className="text-sm text-gray-500">Date: {formatDate(inv.issuedAt)}</p>
              <div className="mt-3">
                <StatusBadgePrint status={inv.status} />
              </div>
            </div>
          </div>

          <div className="h-1 bg-gradient-to-r from-gray-900 via-amber-600 to-gray-900 rounded mb-8" />

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

          <div className="mt-10 pt-6 border-t border-gray-200 text-center text-xs text-gray-400">
            <p>Guidon Brewing Company &bull; Veteran-Owned &bull; 415 8th Ave. E., Hendersonville, NC 28792</p>
          </div>

          {/* Derby Digital print footer */}
          <div className="mt-6 pt-4 border-t border-gray-100 flex items-center justify-center gap-2 text-[10px] text-gray-400">
            <span>Powered by</span>
            <span className="font-bold tracking-wider text-gray-500">DERBY DIGITAL</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {toast && (
        <div className="toast" style={{ color: toast.type === 'error' ? 'var(--ruby)' : 'var(--pine)' }}>
          {toast.text}
        </div>
      )}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <span className="section-label mb-1 block">Billing</span>
          <h2 className="font-heading text-2xl font-black text-cream">Invoices</h2>
        </div>
        <div className="flex items-center gap-3 self-start flex-wrap">
          <input type="text" placeholder="Search ID / order / business..." value={search} onChange={(e) => setSearch(e.target.value)}
            className="input max-w-[260px] text-sm" />
          <div className="flex items-center bg-charcoal-200 rounded-lg border border-white/[0.06] p-1">
            <button onClick={() => setView('table')}
              className={cn('px-3 py-1.5 text-xs font-semibold rounded transition-colors', view === 'table' ? 'bg-white/[0.08] text-cream' : 'text-cream/40 hover:text-cream/70')}>
              Table
            </button>
            <button onClick={() => setView('cards')}
              className={cn('px-3 py-1.5 text-xs font-semibold rounded transition-colors', view === 'cards' ? 'bg-white/[0.08] text-cream' : 'text-cream/40 hover:text-cream/70')}>
              Cards
            </button>
          </div>
          <a
            href="/api/invoices/export"
            className="btn-ghost text-xs px-3 py-1.5 border border-white/[0.06] rounded-lg"
            title="Download all invoices as CSV"
          >
            Export CSV
          </a>
        </div>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <SummaryStat label="Outstanding" value={formatCurrency(totals.outstanding)} hint="Unpaid + overdue" color="var(--brass)" />
        <SummaryStat label="Collected" value={formatCurrency(totals.collected)} hint="All-time paid" color="var(--pine)" />
        <SummaryStat label="In Drafts" value={formatCurrency(totals.drafts)} hint="Not yet sent" color="var(--muted)" />
      </div>

      {/* Create invoice bar */}
      <div className="card p-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="section-label mb-1">Create Invoice</div>
            <p className="text-xs text-cream/40">
              {ordersWithoutInvoice.length === 0
                ? 'Every order already has an invoice. Auto-create runs on new orders.'
                : `${ordersWithoutInvoice.length} order${ordersWithoutInvoice.length === 1 ? '' : 's'} without an invoice.`}
            </p>
          </div>
          {ordersWithoutInvoice.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <select value={creatingFor} onChange={(e) => setCreatingFor(e.target.value)} className="input max-w-[280px] text-sm">
                <option value="">Select an order...</option>
                {ordersWithoutInvoice.map((o) => {
                  const cust = customerMap.get(o.customerId);
                  return (
                    <option key={o.id} value={o.id}>
                      {o.id} · {cust?.businessName || o.customerId} · {formatCurrency(o.total)}
                    </option>
                  );
                })}
              </select>
              <button disabled={!creatingFor || updating === 'create'} onClick={() => handleCreate(creatingFor, false)} className="btn-secondary px-3 py-2 text-sm">
                Create Draft
              </button>
              <button disabled={!creatingFor || updating === 'create'} onClick={() => handleCreate(creatingFor, true)} className="btn-primary px-3 py-2 text-sm">
                Create + Send
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Filter chips */}
      <div className="flex items-center gap-2 flex-wrap">
        <FilterChip label={`All (${counts.all})`} active={filter === 'all'} onClick={() => setFilter('all')} />
        <FilterChip label={`Draft (${counts.draft})`} active={filter === 'draft'} onClick={() => setFilter('draft')} tooltip={STATUS_DESCRIPTIONS.draft} />
        <FilterChip label={`Unpaid (${counts.unpaid})`} active={filter === 'unpaid'} onClick={() => setFilter('unpaid')} tooltip={STATUS_DESCRIPTIONS.unpaid} />
        <FilterChip label={`Overdue (${counts.overdue})`} active={filter === 'overdue'} onClick={() => setFilter('overdue')} tooltip={STATUS_DESCRIPTIONS.overdue} />
        <FilterChip label={`Paid (${counts.paid})`} active={filter === 'paid'} onClick={() => setFilter('paid')} tooltip={STATUS_DESCRIPTIONS.paid} />
      </div>

      {filter !== 'all' && (
        <p className="text-xs text-cream/40 italic -mt-2">{STATUS_DESCRIPTIONS[filter]}</p>
      )}

      {/* List */}
      <div className="card p-0 overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="skeleton h-12 w-full" />)}</div>
        ) : filtered.length === 0 ? (
          <p className="p-6 text-cream/30 text-sm">
            {invoices.length === 0 ? 'No invoices yet. Create one from an order above.' : 'No invoices match this filter.'}
          </p>
        ) : view === 'table' ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-charcoal-200">
                <tr>
                  <th className="table-header">Invoice</th>
                  <th className="table-header">Order</th>
                  <th className="table-header">Customer</th>
                  <th className="table-header">Issued</th>
                  <th className="table-header">Status</th>
                  <th className="table-header text-right">Total</th>
                  <th className="table-header text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {filtered.map((inv) => (
                  <tr key={inv.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="table-cell font-semibold text-cream">{inv.id}</td>
                    <td className="table-cell text-cream/50">{inv.orderId}</td>
                    <td className="table-cell">{customerMap.get(inv.customerId)?.businessName || inv.customerId}</td>
                    <td className="table-cell text-cream/50">{formatDate(inv.issuedAt)}</td>
                    <td className="table-cell">
                      <select value={inv.status}
                        disabled={updating === inv.id || inv.status === 'paid'}
                        onChange={(e) => handleStatusChange(inv, e.target.value as InvoiceStatus)}
                        className={cn('badge border-0 cursor-pointer pr-6 appearance-none bg-transparent', getStatusColor(inv.status), updating === inv.id && 'opacity-50')}>
                        <option value="draft">Draft</option>
                        <option value="unpaid">Unpaid</option>
                        <option value="overdue">Overdue</option>
                        <option value="paid">Paid</option>
                      </select>
                    </td>
                    <td className="table-cell text-right font-semibold text-cream">{formatCurrency(inv.total)}</td>
                    <td className="table-cell text-right">
                      <div className="flex items-center justify-end gap-3">
                        <button onClick={() => setViewingInvoice(inv)}
                          className="text-gold/70 hover:text-gold text-sm font-semibold transition-colors">
                          View / PDF
                        </button>
                        {inv.status === 'draft' && (
                          <button onClick={() => handleStatusChange(inv, 'unpaid')}
                            disabled={updating === inv.id}
                            className="text-sm font-semibold transition-colors hover:underline"
                            style={{ color: 'var(--brass)' }}>
                            {updating === inv.id ? '...' : 'Send →'}
                          </button>
                        )}
                        {(inv.status === 'unpaid' || inv.status === 'overdue') && (
                          <button onClick={() => handleResend(inv)}
                            disabled={updating === inv.id}
                            className="text-sm font-semibold transition-colors hover:underline"
                            style={{ color: 'var(--muted)' }}>
                            {updating === inv.id ? '...' : 'Re-send'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          // Card grid view
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
            {filtered.map((inv) => {
              const cust = customerMap.get(inv.customerId);
              return (
                <div key={inv.id} className="bg-charcoal-200 rounded-lg border border-white/[0.06] p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold text-cream text-sm">{cust?.businessName || inv.customerId}</div>
                      <div className="text-xs text-cream/40">{inv.id}</div>
                    </div>
                    <span className={cn('badge', getStatusColor(inv.status))}>{inv.status}</span>
                  </div>
                  <div className="text-[10px] text-cream/30 uppercase tracking-wider">
                    Order {inv.orderId} · {formatDate(inv.issuedAt)}
                    {inv.sentAt && <span> · sent {formatDate(inv.sentAt)}</span>}
                    {inv.paidAt && <span> · paid {formatDate(inv.paidAt)}</span>}
                  </div>
                  <div className="text-2xl font-black text-cream font-heading">{formatCurrency(inv.total)}</div>
                  <div className="flex items-center justify-between pt-2 border-t border-white/[0.04]">
                    <button onClick={() => setViewingInvoice(inv)}
                      className="text-xs font-semibold text-gold/70 hover:text-gold">
                      View / PDF
                    </button>
                    {inv.status === 'draft' ? (
                      <button onClick={() => handleStatusChange(inv, 'unpaid')}
                        disabled={updating === inv.id}
                        className="text-xs font-semibold hover:underline" style={{ color: 'var(--brass)' }}>
                        {updating === inv.id ? '...' : 'Send →'}
                      </button>
                    ) : inv.status === 'paid' ? (
                      <span className="text-xs text-cream/30">Paid</span>
                    ) : (
                      <button onClick={() => handleResend(inv)}
                        disabled={updating === inv.id}
                        className="text-xs font-semibold hover:underline" style={{ color: 'var(--muted)' }}>
                        {updating === inv.id ? '...' : 'Re-send'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function FilterChip({ label, active, onClick, tooltip }: { label: string; active: boolean; onClick: () => void; tooltip?: string }) {
  return (
    <button onClick={onClick} title={tooltip}
      className={cn(
        'px-3 py-1.5 text-xs font-semibold rounded-full border transition-colors',
        active
          ? 'bg-white/[0.08] text-cream border-white/[0.12]'
          : 'bg-transparent text-cream/50 border-white/[0.06] hover:text-cream/80 hover:border-white/[0.12]'
      )}>
      {label}
    </button>
  );
}

function SummaryStat({ label, value, hint, color }: { label: string; value: string; hint: string; color: string }) {
  return (
    <div className="card p-4">
      <div className="section-label mb-1" style={{ color }}>{label}</div>
      <div className="font-heading text-2xl font-black text-cream">{value}</div>
      <div className="text-[10px] text-cream/30 mt-1">{hint}</div>
    </div>
  );
}

function StatusBadgePrint({ status }: { status: InvoiceStatus }) {
  if (status === 'paid') return (
    <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700 uppercase tracking-wider">Paid</span>
  );
  if (status === 'overdue') return (
    <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-orange-100 text-orange-700 uppercase tracking-wider">Overdue</span>
  );
  if (status === 'draft') return (
    <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-gray-200 text-gray-700 uppercase tracking-wider">Draft</span>
  );
  return (
    <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-red-100 text-red-700 uppercase tracking-wider">Unpaid</span>
  );
}
