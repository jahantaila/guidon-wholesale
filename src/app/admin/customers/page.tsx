'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { Customer, Order, Invoice } from '@/lib/types';
import { formatCurrency, formatDate } from '@/lib/utils';
import { adminFetch } from '@/lib/admin-fetch';

interface CustomerForm {
  businessName: string;
  contactName: string;
  email: string;
  phone: string;
  address: string;
  password: string;
}

const emptyForm: CustomerForm = { businessName: '', contactName: '', email: '', phone: '', address: '', password: '' };

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CustomerForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const loadCustomers = useCallback(async () => {
    try {
      const custPath = showArchived ? '/api/customers?includeArchived=true' : '/api/customers';
      const [custRes, ordRes, invRes] = await Promise.all([
        adminFetch(custPath),
        adminFetch('/api/orders'),
        adminFetch('/api/invoices'),
      ]);
      const [custData, ordData, invData] = await Promise.all([custRes.json(), ordRes.json(), invRes.json()]);
      setCustomers(Array.isArray(custData) ? custData : []);
      setOrders(Array.isArray(ordData) ? ordData : []);
      setInvoices(Array.isArray(invData) ? invData : []);
    } catch (err) { console.error('Failed to load customers', err); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadCustomers(); }, [loadCustomers, showArchived]);

  const restoreCustomer = async (id: string) => {
    try {
      const res = await adminFetch('/api/customers', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, archivedAt: null }),
      });
      if (res.ok) await loadCustomers();
    } catch { /* ignore */ }
  };

  // Per-customer metrics: LTV (sum of all order totals), last order date, outstanding invoice count + $
  const metricsByCustomer = useMemo(() => {
    const m = new Map<string, { ltv: number; orderCount: number; lastOrder: string | null; outstanding: number; outstandingCount: number }>();
    customers.forEach((c) => m.set(c.id, { ltv: 0, orderCount: 0, lastOrder: null, outstanding: 0, outstandingCount: 0 }));
    orders.forEach((o) => {
      const entry = m.get(o.customerId);
      if (!entry) return;
      entry.ltv += o.total;
      entry.orderCount += 1;
      if (!entry.lastOrder || o.createdAt > entry.lastOrder) entry.lastOrder = o.createdAt;
    });
    invoices.forEach((i) => {
      if (i.status !== 'unpaid' && i.status !== 'overdue') return;
      const entry = m.get(i.customerId);
      if (!entry) return;
      entry.outstanding += i.total;
      entry.outstandingCount += 1;
    });
    return m;
  }, [customers, orders, invoices]);

  const openAdd = () => { setForm(emptyForm); setEditingId(null); setModalOpen(true); };
  const openEdit = (customer: Customer) => {
    setForm({ businessName: customer.businessName, contactName: customer.contactName, email: customer.email, phone: customer.phone, address: customer.address, password: '' });
    setEditingId(customer.id); setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true);
    try {
      const method = editingId ? 'PUT' : 'POST';
      const body = editingId ? { id: editingId, ...form } : form;
      const res = await adminFetch('/api/customers', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (res.ok) { setModalOpen(false); setForm(emptyForm); setEditingId(null); await loadCustomers(); }
    } catch (err) { console.error('Failed to save customer', err); }
    finally { setSaving(false); }
  };

  const [deleteError, setDeleteError] = useState('');
  const handleDelete = async (id: string) => {
    setDeleteError('');
    try {
      const res = await adminFetch('/api/customers', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        setDeleteConfirm(null);
        await loadCustomers();
        if (data?.archived) {
          setDeleteError('Customer archived (had order history). Restore later from the archive view.');
          window.setTimeout(() => setDeleteError(''), 6000);
        }
      } else {
        const data = await res.json().catch(() => ({}));
        const raw = data?.error || 'Delete failed.';
        setDeleteError(raw);
        window.setTimeout(() => setDeleteError(''), 6000);
      }
    } catch (err) {
      console.error('Failed to delete customer', err);
      setDeleteError('Delete failed. Please try again.');
    }
  };

  const updateField = (field: keyof CustomerForm, value: string) => setForm((prev) => ({ ...prev, [field]: value }));

  return (
    <div className="space-y-6">
      {deleteError && <div className="toast" style={{ color: 'var(--ruby)' }}>{deleteError}</div>}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <span className="section-label mb-1 block">Management</span>
          <h2 className="font-heading text-2xl font-black text-cream">Customers</h2>
        </div>
        <div className="flex items-center gap-3 self-start">
          <label className="flex items-center gap-1.5 text-xs text-cream/50 cursor-pointer select-none">
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} className="accent-gold cursor-pointer" />
            Show archived
          </label>
          <input type="text" placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)}
            className="input max-w-[200px] text-sm" />
          <button onClick={openAdd} className="btn-primary">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Customer
          </button>
        </div>
      </div>

      <div className="card p-0 overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="skeleton h-12 w-full" />)}</div>
        ) : customers.length === 0 ? (
          <p className="p-6 text-cream/30 text-sm">No customers yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-charcoal-200">
                <tr>
                  <th className="table-header">Business</th>
                  <th className="table-header">Contact</th>
                  <th className="table-header text-right">Orders</th>
                  <th className="table-header text-right">LTV</th>
                  <th className="table-header text-right">Outstanding</th>
                  <th className="table-header">Last Order</th>
                  <th className="table-header text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {customers.filter(c => {
                  if (!search) return true;
                  const q = search.toLowerCase();
                  return c.businessName.toLowerCase().includes(q) || c.contactName.toLowerCase().includes(q) || c.email.toLowerCase().includes(q);
                }).map((c) => {
                  const m = metricsByCustomer.get(c.id);
                  return (
                  <tr key={c.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="table-cell font-semibold text-cream">
                      <Link href={`/admin/customers/${c.id}`} className="hover:underline" style={{ color: 'var(--brass)' }}>
                        {c.businessName}
                      </Link>
                      <div className="text-[10px] text-cream/30">{c.email}</div>
                    </td>
                    <td className="table-cell">
                      <div>{c.contactName}</div>
                      <div className="text-[10px] text-cream/30">{c.phone}</div>
                    </td>
                    <td className="table-cell text-right text-cream/60 font-variant-tabular">{m?.orderCount ?? 0}</td>
                    <td className="table-cell text-right font-semibold text-cream font-variant-tabular">{formatCurrency(m?.ltv ?? 0)}</td>
                    <td className="table-cell text-right font-variant-tabular">
                      {m && m.outstanding > 0 ? (
                        <span style={{ color: 'var(--ruby)' }}>
                          {formatCurrency(m.outstanding)} <span className="text-[10px] text-cream/30">({m.outstandingCount})</span>
                        </span>
                      ) : (
                        <span className="text-cream/25">—</span>
                      )}
                    </td>
                    <td className="table-cell text-cream/50 font-variant-tabular text-xs">
                      {m?.lastOrder ? formatDate(m.lastOrder) : <span className="text-cream/25 italic">never</span>}
                    </td>
                    <td className="table-cell text-right">
                      <div className="flex items-center justify-end gap-3">
                        {c.archivedAt ? (
                          <>
                            <span className="text-xs italic text-cream/30">archived {formatDate(c.archivedAt)}</span>
                            <button
                              onClick={() => restoreCustomer(c.id)}
                              className="text-sm font-semibold"
                              style={{ color: 'var(--pine)' }}
                            >
                              Restore
                            </button>
                          </>
                        ) : (
                          <>
                            <Link href={`/admin/customers/${c.id}`} className="text-sm font-semibold" style={{ color: 'var(--muted)' }}>
                              Details
                            </Link>
                            <button onClick={() => openEdit(c)} className="text-gold/70 hover:text-gold text-sm font-semibold transition-colors">
                              Edit
                            </button>
                            {deleteConfirm === c.id ? (
                              <div className="flex items-center gap-2">
                                <button onClick={() => handleDelete(c.id)} className="text-red-400 text-sm font-semibold">Confirm</button>
                                <button onClick={() => setDeleteConfirm(null)} className="text-cream/30 text-sm">Cancel</button>
                              </div>
                            ) : (
                              <button onClick={() => setDeleteConfirm(c.id)} className="text-red-400/50 hover:text-red-400 text-sm font-semibold transition-colors">
                                Delete
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-charcoal-100 border border-white/[0.08] rounded-2xl shadow-dark-lg max-w-lg w-full p-6 animate-scale-in">
            <h3 className="font-heading text-xl font-bold text-cream mb-5">
              {editingId ? 'Edit Customer' : 'Add Customer'}
            </h3>
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-cream/60 mb-1.5">Business Name</label>
                <input className="input" value={form.businessName} onChange={(e) => updateField('businessName', e.target.value)} required />
              </div>
              <div>
                <label className="block text-sm font-semibold text-cream/60 mb-1.5">Contact Name</label>
                <input className="input" value={form.contactName} onChange={(e) => updateField('contactName', e.target.value)} required />
              </div>
              <div>
                <label className="block text-sm font-semibold text-cream/60 mb-1.5">Email</label>
                <input type="email" className="input" value={form.email} onChange={(e) => updateField('email', e.target.value)} required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-cream/60 mb-1.5">Phone</label>
                  <input className="input" value={form.phone} onChange={(e) => updateField('phone', e.target.value)} required />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-cream/60 mb-1.5">Address</label>
                  <input className="input" value={form.address} onChange={(e) => updateField('address', e.target.value)} required />
                </div>
              </div>
              {!editingId && (
                <div>
                  <label className="block text-sm font-semibold text-cream/60 mb-1.5">Password</label>
                  <input type="text" className="input" placeholder="Set a login password" value={form.password} onChange={(e) => updateField('password', e.target.value)} required />
                  <p className="text-[10px] text-cream/20 mt-1">Share this with the customer so they can log into the portal.</p>
                </div>
              )}
              <div className="flex justify-end gap-3 pt-3">
                <button type="button" onClick={() => { setModalOpen(false); setEditingId(null); }}
                  className="btn-secondary px-4 py-2">Cancel</button>
                <button type="submit" disabled={saving} className="btn-primary">
                  {saving ? 'Saving...' : editingId ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
