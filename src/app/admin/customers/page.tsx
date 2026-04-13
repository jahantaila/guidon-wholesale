'use client';

import { useState, useEffect, useCallback } from 'react';
import { Customer } from '@/lib/types';
import { formatDate } from '@/lib/utils';

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
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CustomerForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const loadCustomers = useCallback(async () => {
    try {
      const res = await fetch('/api/customers');
      const data = await res.json();
      setCustomers(Array.isArray(data) ? data : []);
    } catch (err) { console.error('Failed to load customers', err); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadCustomers(); }, [loadCustomers]);

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
      const res = await fetch('/api/customers', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (res.ok) { setModalOpen(false); setForm(emptyForm); setEditingId(null); await loadCustomers(); }
    } catch (err) { console.error('Failed to save customer', err); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch('/api/customers', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
      if (res.ok) { setDeleteConfirm(null); await loadCustomers(); }
    } catch (err) { console.error('Failed to delete customer', err); }
  };

  const updateField = (field: keyof CustomerForm, value: string) => setForm((prev) => ({ ...prev, [field]: value }));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <span className="section-label mb-1 block">Management</span>
          <h2 className="font-heading text-2xl font-black text-cream">Customers</h2>
        </div>
        <div className="flex items-center gap-3 self-start">
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
                  <th className="table-header">Business Name</th>
                  <th className="table-header">Contact</th>
                  <th className="table-header">Email</th>
                  <th className="table-header">Phone</th>
                  <th className="table-header">Joined</th>
                  <th className="table-header text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {customers.filter(c => {
                  if (!search) return true;
                  const q = search.toLowerCase();
                  return c.businessName.toLowerCase().includes(q) || c.contactName.toLowerCase().includes(q) || c.email.toLowerCase().includes(q);
                }).map((c) => (
                  <tr key={c.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="table-cell font-semibold text-cream">{c.businessName}</td>
                    <td className="table-cell">{c.contactName}</td>
                    <td className="table-cell text-cream/50">{c.email}</td>
                    <td className="table-cell text-cream/50">{c.phone}</td>
                    <td className="table-cell text-cream/40">{formatDate(c.createdAt)}</td>
                    <td className="table-cell text-right">
                      <div className="flex items-center justify-end gap-3">
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
                      </div>
                    </td>
                  </tr>
                ))}
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
