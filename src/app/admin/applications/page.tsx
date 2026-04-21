'use client';

import { useState, useEffect, useCallback } from 'react';
import { WholesaleApplication, Customer } from '@/lib/types';
import { formatDate, cn, getStatusColor } from '@/lib/utils';
import { adminFetch } from '@/lib/admin-fetch';

// Use the shared badge-status-* classes so the paper-theme colors match
// everywhere (orders, invoices, keg ledger, applications). Unknown status
// (rare — a fresh application row with null status) reads as 'pending'.
function statusColor(status: string | undefined): string {
  return getStatusColor(status || 'pending');
}

interface CustomerForm {
  businessName: string;
  contactName: string;
  email: string;
  phone: string;
  address: string;
  password: string;
}

export default function ApplicationsPage() {
  const [applications, setApplications] = useState<(WholesaleApplication & { status?: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [rejectConfirm, setRejectConfirm] = useState<string | null>(null);

  // Customer creation modal
  const [showCreateCustomer, setShowCreateCustomer] = useState(false);
  const [customerForm, setCustomerForm] = useState<CustomerForm>({ businessName: '', contactName: '', email: '', phone: '', address: '', password: '' });
  const [savingCustomer, setSavingCustomer] = useState(false);
  const [customerSuccess, setCustomerSuccess] = useState('');

  const loadApplications = useCallback(async () => {
    try {
      const res = await adminFetch('/api/applications');
      const data = await res.json();
      setApplications(Array.isArray(data) ? data : []);
    } catch (err) { console.error('Failed to load applications', err); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadApplications(); }, [loadApplications]);

  // Dispatched after approve/reject so the sidebar badge count refreshes
  // immediately instead of waiting up to 60s for the layout's poll.
  const notifyNavRefresh = () => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('guidon:nav-refresh'));
    }
  };

  const handleApprove = async (app: WholesaleApplication & { status?: string }) => {
    setUpdating(app.id);
    try {
      const res = await adminFetch('/api/applications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: app.id, status: 'approved' }),
      });
      if (res.ok) {
        setApplications(prev => prev.map(a => a.id === app.id ? { ...a, status: 'approved' } : a));
        notifyNavRefresh();
        // Pre-fill customer creation form
        setCustomerForm({
          businessName: app.businessName,
          contactName: app.contactName,
          email: app.email,
          phone: app.phone || '',
          address: app.address || '',
          password: '',
        });
        setShowCreateCustomer(true);
      } else {
        const data = await res.json().catch(() => ({}));
        const msg = typeof data?.error === 'string' ? data.error : `Approve failed (HTTP ${res.status})`;
        alert(msg);
      }
    } catch (err) {
      console.error('Failed to approve application', err);
      alert('Network error approving application. Please retry.');
    }
    finally { setUpdating(null); }
  };

  const handleReject = async (id: string) => {
    setUpdating(id);
    try {
      const res = await adminFetch('/api/applications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: 'rejected' }),
      });
      if (res.ok) {
        setApplications(prev => prev.map(a => a.id === id ? { ...a, status: 'rejected' } : a));
        notifyNavRefresh();
        setRejectConfirm(null);
      }
    } catch (err) { console.error('Failed to reject application', err); }
    finally { setUpdating(null); }
  };

  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingCustomer(true);
    setCustomerSuccess('');
    try {
      const res = await adminFetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(customerForm),
      });
      if (res.ok) {
        const cust: Customer = await res.json();
        setCustomerSuccess(`Customer account created: ${cust.businessName}`);
        setTimeout(() => {
          setShowCreateCustomer(false);
          setCustomerSuccess('');
        }, 2000);
      } else {
        const data = await res.json().catch(() => ({}));
        const msg = typeof data?.error === 'string' ? data.error : `Create failed (HTTP ${res.status})`;
        alert(msg);
      }
    } catch (err) {
      console.error('Failed to create customer', err);
      alert('Network error creating customer. Please retry.');
    }
    finally { setSavingCustomer(false); }
  };

  const pending = applications.filter(a => !a.status || a.status === 'pending');

  return (
    <div className="space-y-6">
      <div>
        <span className="section-label mb-1 block">Review</span>
        <h2 className="font-heading text-2xl font-black text-cream">Applications</h2>
      </div>

      {/* Pending Applications */}
      {pending.length > 0 && (
        <div>
          <span className="section-label mb-3 block">Pending ({pending.length})</span>
          <div className="space-y-2">
            {pending.map(app => (
              <div key={app.id} className="card-interactive p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 cursor-pointer flex-1" onClick={() => setExpandedId(expandedId === app.id ? null : app.id)}>
                    <div>
                      <p className="font-heading font-bold text-cream text-sm">{app.businessName}</p>
                      <p className="text-xs text-cream/25">{app.contactName} &middot; {app.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-cream/20">{formatDate(app.createdAt)}</span>
                    <button
                      onClick={() => handleApprove(app)}
                      disabled={updating === app.id}
                      className="text-xs font-heading font-bold px-3 py-1.5 rounded transition-all disabled:opacity-50"
                      style={{
                        color: 'var(--pine)',
                        background: 'color-mix(in srgb, var(--pine) 10%, transparent)',
                        border: '1px solid color-mix(in srgb, var(--pine) 45%, transparent)',
                      }}
                    >
                      Approve
                    </button>
                    {rejectConfirm === app.id ? (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleReject(app.id)}
                          disabled={updating === app.id}
                          className="text-xs font-bold px-2 py-1"
                          style={{ color: 'var(--ruby)' }}
                        >
                          Confirm
                        </button>
                        <button
                          onClick={() => setRejectConfirm(null)}
                          className="text-xs px-2 py-1"
                          style={{ color: 'var(--muted)' }}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setRejectConfirm(app.id)}
                        className="text-xs font-heading font-bold px-3 py-1.5 rounded transition-all"
                        style={{
                          color: 'var(--ruby)',
                          background: 'color-mix(in srgb, var(--ruby) 10%, transparent)',
                          border: '1px solid color-mix(in srgb, var(--ruby) 45%, transparent)',
                        }}
                      >
                        Reject
                      </button>
                    )}
                  </div>
                </div>
                {expandedId === app.id && (
                  <div className="mt-3 pt-3 border-t border-white/[0.04] grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs animate-fade-in">
                    <div><span className="text-cream/25">Phone:</span><p className="text-cream/60 mt-0.5">{app.phone || 'N/A'}</p></div>
                    <div><span className="text-cream/25">Address:</span><p className="text-cream/60 mt-0.5">{app.address || 'N/A'}</p></div>
                    <div><span className="text-cream/25">Business Type:</span><p className="text-cream/60 mt-0.5">{app.businessType || 'N/A'}</p></div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* All Applications Table */}
      <div>
        <span className="section-label mb-3 block">All Applications</span>
        <div className="card p-0 overflow-hidden">
          {loading ? (
            <div className="p-6 space-y-3">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-12 w-full rounded-lg" />)}</div>
          ) : applications.length === 0 ? (
            <p className="p-6 text-cream/25 text-sm">No applications yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-charcoal-200">
                  <tr>
                    <th className="table-header">Business</th>
                    <th className="table-header">Contact</th>
                    <th className="table-header">Email</th>
                    <th className="table-header">Type</th>
                    <th className="table-header">Date</th>
                    <th className="table-header">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {applications.map(app => (
                    <tr key={app.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="table-cell font-heading font-bold text-cream">{app.businessName}</td>
                      <td className="table-cell">{app.contactName}</td>
                      <td className="table-cell text-cream/40">{app.email}</td>
                      <td className="table-cell text-cream/40">{app.businessType || '—'}</td>
                      <td className="table-cell text-cream/30">{formatDate(app.createdAt)}</td>
                      <td className="table-cell">
                        <span className={cn('badge-sm', statusColor(app.status || 'pending'))}>
                          {app.status || 'pending'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Create Customer Modal */}
      {showCreateCustomer && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-charcoal-100 border border-white/[0.08] rounded-2xl max-w-lg w-full p-6 animate-scale-in">
            <h3 className="font-heading text-lg font-bold text-cream mb-1">Create Customer Account</h3>
            <p className="text-xs text-cream/25 mb-5">Pre-filled from the approved application. Adjust if needed.</p>

            {customerSuccess ? (
              <div className="text-center py-6">
                <div
                  className="w-12 h-12 flex items-center justify-center mx-auto mb-3 rounded"
                  style={{
                    background: 'color-mix(in srgb, var(--pine) 12%, transparent)',
                    border: '2px solid color-mix(in srgb, var(--pine) 45%, transparent)',
                  }}
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: 'var(--pine)' }}>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-sm font-heading font-bold" style={{ color: 'var(--pine)' }}>{customerSuccess}</p>
              </div>
            ) : (
              <form onSubmit={handleCreateCustomer} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-cream/40 mb-1.5">Business Name</label>
                  <input className="input" value={customerForm.businessName}
                    onChange={e => setCustomerForm(p => ({ ...p, businessName: e.target.value }))} required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-cream/40 mb-1.5">Contact Name</label>
                  <input className="input" value={customerForm.contactName}
                    onChange={e => setCustomerForm(p => ({ ...p, contactName: e.target.value }))} required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-cream/40 mb-1.5">Email</label>
                  <input type="email" className="input" value={customerForm.email}
                    onChange={e => setCustomerForm(p => ({ ...p, email: e.target.value }))} required />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-cream/40 mb-1.5">Phone</label>
                    <input className="input" value={customerForm.phone}
                      onChange={e => setCustomerForm(p => ({ ...p, phone: e.target.value }))} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-cream/40 mb-1.5">Address</label>
                    <input className="input" value={customerForm.address}
                      onChange={e => setCustomerForm(p => ({ ...p, address: e.target.value }))} />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-cream/40 mb-1.5">Password</label>
                  <input type="text" className="input" placeholder="Set a login password" value={customerForm.password}
                    onChange={e => setCustomerForm(p => ({ ...p, password: e.target.value }))} required />
                  <p className="text-[10px] text-cream/20 mt-1">Share this with the customer so they can log in.</p>
                </div>
                <div className="flex justify-end gap-3 pt-3">
                  <button type="button" onClick={() => setShowCreateCustomer(false)} className="btn-secondary px-4 py-2">Skip</button>
                  <button type="submit" disabled={savingCustomer} className="btn-primary">
                    {savingCustomer ? 'Creating...' : 'Create Account'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
