'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Link from 'next/link';
import { Customer, Order, Invoice } from '@/lib/types';
import { formatCurrency, formatDate, cn, US_STATES } from '@/lib/utils';
import { adminFetch } from '@/lib/admin-fetch';
import { useBodyScrollLock } from '@/lib/use-body-scroll-lock';

interface CustomerForm {
  businessName: string;
  contactName: string;
  email: string;
  phone: string;
  streetAddress: string;
  city: string;
  state: string;
  zip: string;
  password: string;
}

const emptyForm: CustomerForm = {
  businessName: '', contactName: '', email: '', phone: '',
  streetAddress: '', city: '', state: '', zip: '', password: '',
};

type ViewMode = 'table' | 'cards' | 'kanban';

// Kanban buckets by ordering recency. Picked for the brewery's actual
// workflow — they want to see at a glance which accounts need a call.
// "New" = never ordered; "Active" = ordered in last 30 days; "At risk" =
// last order 30-90 days ago; "Lapsed" = > 90 days since last order.
type KanbanBucket = 'new' | 'active' | 'at-risk' | 'lapsed';
const KANBAN_LABELS: Record<KanbanBucket, string> = {
  new: 'New',
  active: 'Active',
  'at-risk': 'At Risk',
  lapsed: 'Lapsed',
};
const KANBAN_DESC: Record<KanbanBucket, string> = {
  new: 'Approved but hasn\u2019t placed their first order yet.',
  active: 'Ordered in the last 30 days.',
  'at-risk': 'Last order 30\u201390 days ago.',
  lapsed: 'No order in 90+ days.',
};

function bucketFor(lastOrder: string | null): KanbanBucket {
  if (!lastOrder) return 'new';
  const days = Math.floor((Date.now() - new Date(lastOrder).getTime()) / (1000 * 60 * 60 * 24));
  if (days <= 30) return 'active';
  if (days <= 90) return 'at-risk';
  return 'lapsed';
}

interface CustomerMetrics {
  ltv: number;
  orderCount: number;
  lastOrder: string | null;
  outstanding: number;
  outstandingCount: number;
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [view, setView] = useState<ViewMode>('table');
  const [modalOpen, setModalOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  useBodyScrollLock(modalOpen || importOpen);
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
    // Closure captures showArchived; include in deps so toggling refetches.
  }, [showArchived]);

  useEffect(() => { loadCustomers(); }, [loadCustomers]);

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

  const metricsByCustomer = useMemo(() => {
    const m = new Map<string, CustomerMetrics>();
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
    setForm({
      businessName: customer.businessName,
      contactName: customer.contactName,
      email: customer.email,
      phone: customer.phone,
      streetAddress: customer.streetAddress,
      city: customer.city,
      state: customer.state,
      zip: customer.zip,
      password: '',
    });
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

  // Shared filter for all three views.
  const filtered = useMemo(() => {
    if (!search.trim()) return customers;
    const q = search.toLowerCase();
    return customers.filter((c) =>
      c.businessName.toLowerCase().includes(q) ||
      c.contactName.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q),
    );
  }, [customers, search]);

  return (
    <div className="space-y-6">
      {deleteError && <div className="toast" style={{ color: 'var(--ruby)' }}>{deleteError}</div>}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <span className="section-label mb-1 block">Management</span>
          <h2
            className="font-display"
            style={{ fontSize: '2.5rem', fontVariationSettings: "'opsz' 72", color: 'var(--ink)', fontWeight: 500 }}
          >
            Customers
          </h2>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 self-start flex-wrap">
          <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none" style={{ color: 'var(--muted)' }}>
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} className="accent-gold cursor-pointer" />
            Show archived
          </label>
          <input type="text" placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)}
            className="input max-w-[140px] sm:max-w-[200px] text-sm" />
          {/* View toggle */}
          <div className="flex border border-divider" style={{ borderRadius: '3px', overflow: 'hidden' }}>
            {(['table', 'cards', 'kanban'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setView(m)}
                className="px-3 py-1.5 text-xs font-ui font-semibold transition-colors"
                style={{
                  background: view === m ? 'var(--brass)' : 'transparent',
                  color: view === m ? 'var(--paper)' : 'var(--ink)',
                  textTransform: 'capitalize',
                }}
              >
                {m}
              </button>
            ))}
          </div>
          <button
            onClick={() => setImportOpen(true)}
            className="btn-ghost text-xs px-3 py-1.5 border border-divider"
            style={{ borderRadius: '3px' }}
            title="Import customers from a CSV file"
          >
            Import CSV
          </button>
          <a
            href={showArchived ? '/api/customers/export?includeArchived=true' : '/api/customers/export'}
            className="btn-ghost text-xs px-3 py-1.5 border border-divider"
            style={{ borderRadius: '3px' }}
            title="Download customers + metrics as CSV"
          >
            Export CSV
          </a>
          <button onClick={openAdd} className="btn-primary">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Customer
          </button>
        </div>
      </div>

      {loading ? (
        <div className="p-6 space-y-3">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="skeleton h-12 w-full" />)}</div>
      ) : filtered.length === 0 ? (
        <p className="p-6 italic" style={{ color: 'var(--muted)' }}>No customers {search ? 'match the search' : 'yet'}.</p>
      ) : view === 'cards' ? (
        <CardsView
          customers={filtered}
          metricsByCustomer={metricsByCustomer}
          openEdit={openEdit}
          restoreCustomer={restoreCustomer}
          deleteConfirm={deleteConfirm}
          setDeleteConfirm={setDeleteConfirm}
          handleDelete={handleDelete}
        />
      ) : view === 'kanban' ? (
        <KanbanView
          customers={filtered}
          metricsByCustomer={metricsByCustomer}
        />
      ) : (
        <TableView
          customers={filtered}
          metricsByCustomer={metricsByCustomer}
          openEdit={openEdit}
          restoreCustomer={restoreCustomer}
          deleteConfirm={deleteConfirm}
          setDeleteConfirm={setDeleteConfirm}
          handleDelete={handleDelete}
        />
      )}

      {/* Add/Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-charcoal-100 border border-white/[0.08] rounded-2xl shadow-dark-lg max-w-lg w-full p-6 animate-scale-in">
            <h3 className="font-heading text-xl font-bold mb-5" style={{ color: 'var(--ink)' }}>
              {editingId ? 'Edit Customer' : 'Add Customer'}
            </h3>
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--muted)' }}>Business Name</label>
                <input className="input" value={form.businessName} onChange={(e) => updateField('businessName', e.target.value)} required />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--muted)' }}>Contact Name</label>
                <input className="input" value={form.contactName} onChange={(e) => updateField('contactName', e.target.value)} required />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--muted)' }}>Email</label>
                <input type="email" className="input" value={form.email} onChange={(e) => updateField('email', e.target.value)} required />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--muted)' }}>Phone</label>
                <input className="input" value={form.phone} onChange={(e) => updateField('phone', e.target.value)} required />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--muted)' }}>Street Address</label>
                <input className="input" value={form.streetAddress} onChange={(e) => updateField('streetAddress', e.target.value)} required autoComplete="street-address" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--muted)' }}>City</label>
                  <input className="input" value={form.city} onChange={(e) => updateField('city', e.target.value)} required autoComplete="address-level2" />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--muted)' }}>State</label>
                  <select className="input" value={form.state} onChange={(e) => updateField('state', e.target.value)} required autoComplete="address-level1">
                    <option value="">Select...</option>
                    {US_STATES.map((s) => (
                      <option key={s.code} value={s.code}>{s.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--muted)' }}>Zip</label>
                  <input className="input" value={form.zip} onChange={(e) => updateField('zip', e.target.value)} required autoComplete="postal-code" />
                </div>
              </div>
              {!editingId && (
                <div>
                  <label className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--muted)' }}>Password</label>
                  <input type="text" className="input" placeholder="Set a login password" value={form.password} onChange={(e) => updateField('password', e.target.value)} required />
                  <p className="text-[10px] mt-1 italic" style={{ color: 'var(--faint)' }}>Share this with the customer so they can log into the portal.</p>
                </div>
              )}
              <div className="flex justify-end gap-3 pt-3">
                <button type="button" onClick={() => { setModalOpen(false); setEditingId(null); }} className="btn-secondary px-4 py-2">Cancel</button>
                <button type="submit" disabled={saving} className="btn-primary">
                  {saving ? 'Saving...' : editingId ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CSV Import Modal */}
      {importOpen && (
        <ImportModal
          onClose={() => setImportOpen(false)}
          onDone={async () => { await loadCustomers(); setImportOpen(false); }}
        />
      )}
    </div>
  );
}

/* ================================================================== */
/*  Table view (default, existing behavior)                           */
/* ================================================================== */

function TableView({
  customers,
  metricsByCustomer,
  openEdit,
  restoreCustomer,
  deleteConfirm,
  setDeleteConfirm,
  handleDelete,
}: {
  customers: Customer[];
  metricsByCustomer: Map<string, CustomerMetrics>;
  openEdit: (c: Customer) => void;
  restoreCustomer: (id: string) => void;
  deleteConfirm: string | null;
  setDeleteConfirm: (id: string | null) => void;
  handleDelete: (id: string) => void;
}) {
  return (
    <div className="card p-0 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
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
          <tbody>
            {customers.map((c) => {
              const m = metricsByCustomer.get(c.id);
              return (
                <tr key={c.id}>
                  <td className="table-cell font-semibold">
                    <Link href={`/admin/customers/${c.id}`} className="hover:underline" style={{ color: 'var(--brass)' }}>
                      {c.businessName}
                    </Link>
                    <div className="text-[10px]" style={{ color: 'var(--muted)' }}>{c.email}</div>
                  </td>
                  <td className="table-cell">
                    <div>{c.contactName}</div>
                    <div className="text-[10px]" style={{ color: 'var(--muted)' }}>{c.phone}</div>
                  </td>
                  <td className="table-cell text-right font-variant-tabular">{m?.orderCount ?? 0}</td>
                  <td className="table-cell text-right font-semibold font-variant-tabular">{formatCurrency(m?.ltv ?? 0)}</td>
                  <td className="table-cell text-right font-variant-tabular">
                    {m && m.outstanding > 0 ? (
                      <span style={{ color: 'var(--ruby)' }}>
                        {formatCurrency(m.outstanding)} <span className="text-[10px]" style={{ color: 'var(--muted)' }}>({m.outstandingCount})</span>
                      </span>
                    ) : (
                      <span style={{ color: 'var(--faint)' }}>—</span>
                    )}
                  </td>
                  <td className="table-cell font-variant-tabular text-xs">
                    {m?.lastOrder ? formatDate(m.lastOrder) : <span className="italic" style={{ color: 'var(--faint)' }}>never</span>}
                  </td>
                  <td className="table-cell text-right">
                    <div className="flex items-center justify-end gap-3">
                      {c.archivedAt ? (
                        <>
                          <span className="text-xs italic" style={{ color: 'var(--muted)' }}>archived {formatDate(c.archivedAt)}</span>
                          <button onClick={() => restoreCustomer(c.id)} className="text-sm font-semibold" style={{ color: 'var(--pine)' }}>Restore</button>
                        </>
                      ) : (
                        <>
                          <Link href={`/admin/customers/${c.id}`} className="text-sm font-semibold" style={{ color: 'var(--muted)' }}>Details</Link>
                          <button onClick={() => openEdit(c)} className="text-sm font-semibold" style={{ color: 'var(--brass)' }}>Edit</button>
                          {deleteConfirm === c.id ? (
                            <div className="flex items-center gap-2">
                              <button onClick={() => handleDelete(c.id)} className="text-sm font-semibold" style={{ color: 'var(--ruby)' }}>Confirm</button>
                              <button onClick={() => setDeleteConfirm(null)} className="text-sm" style={{ color: 'var(--muted)' }}>Cancel</button>
                            </div>
                          ) : (
                            <button onClick={() => setDeleteConfirm(c.id)} className="text-sm font-semibold" style={{ color: 'var(--ruby)' }}>Delete</button>
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
    </div>
  );
}

/* ================================================================== */
/*  Cards view — grid of customer cards                               */
/* ================================================================== */

function CardsView({
  customers,
  metricsByCustomer,
  openEdit,
  restoreCustomer,
  deleteConfirm,
  setDeleteConfirm,
  handleDelete,
}: {
  customers: Customer[];
  metricsByCustomer: Map<string, CustomerMetrics>;
  openEdit: (c: Customer) => void;
  restoreCustomer: (id: string) => void;
  deleteConfirm: string | null;
  setDeleteConfirm: (id: string | null) => void;
  handleDelete: (id: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {customers.map((c) => {
        const m = metricsByCustomer.get(c.id);
        const b = bucketFor(m?.lastOrder || null);
        return (
          <article
            key={c.id}
            className="card p-0 overflow-hidden"
            style={{ border: '1px solid var(--divider)' }}
          >
            <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--divider)' }}>
              <div className="flex items-baseline justify-between gap-2">
                <Link
                  href={`/admin/customers/${c.id}`}
                  className="font-semibold truncate hover:underline"
                  style={{ color: 'var(--ink)' }}
                >
                  {c.businessName}
                </Link>
                <span
                  className="section-label text-[10px] shrink-0 px-1.5 py-0.5"
                  style={{
                    border: '1px solid var(--divider)',
                    color: 'var(--muted)',
                    borderRadius: '2px',
                  }}
                >
                  {KANBAN_LABELS[b]}
                </span>
              </div>
              <p className="text-xs truncate" style={{ color: 'var(--muted)' }}>
                {c.contactName} &middot; {c.email}
              </p>
              {c.archivedAt && (
                <p className="text-[10px] italic mt-1" style={{ color: 'var(--ruby)' }}>
                  archived {formatDate(c.archivedAt)}
                </p>
              )}
            </div>

            <div className="px-4 py-3 grid grid-cols-3 gap-3 text-sm">
              <div>
                <span className="section-label block mb-0.5" style={{ color: 'var(--muted)' }}>Orders</span>
                <p className="font-variant-tabular" style={{ color: 'var(--ink)' }}>{m?.orderCount ?? 0}</p>
              </div>
              <div>
                <span className="section-label block mb-0.5" style={{ color: 'var(--muted)' }}>LTV</span>
                <p className="font-semibold font-variant-tabular" style={{ color: 'var(--brass)' }}>
                  {formatCurrency(m?.ltv ?? 0)}
                </p>
              </div>
              <div>
                <span className="section-label block mb-0.5" style={{ color: 'var(--muted)' }}>Last</span>
                <p className="font-variant-tabular text-xs" style={{ color: 'var(--ink)' }}>
                  {m?.lastOrder ? formatDate(m.lastOrder) : <span className="italic" style={{ color: 'var(--faint)' }}>never</span>}
                </p>
              </div>
              {m && m.outstanding > 0 && (
                <div className="col-span-3 pt-2" style={{ borderTop: '1px solid var(--divider)' }}>
                  <span className="section-label block mb-0.5" style={{ color: 'var(--muted)' }}>Outstanding AR</span>
                  <p className="font-semibold font-variant-tabular" style={{ color: 'var(--ruby)' }}>
                    {formatCurrency(m.outstanding)}{' '}
                    <span className="text-xs" style={{ color: 'var(--muted)' }}>({m.outstandingCount} invoice{m.outstandingCount === 1 ? '' : 's'})</span>
                  </p>
                </div>
              )}
            </div>

            <div
              className="px-4 py-2 flex items-center justify-between gap-2"
              style={{ borderTop: '1px solid var(--divider)', background: 'color-mix(in srgb, var(--surface) 50%, transparent)' }}
            >
              {c.archivedAt ? (
                <button onClick={() => restoreCustomer(c.id)} className="btn-ghost text-xs" style={{ color: 'var(--pine)' }}>
                  Restore
                </button>
              ) : (
                <>
                  <Link href={`/admin/customers/${c.id}`} className="btn-ghost text-xs" style={{ color: 'var(--muted)' }}>
                    Details →
                  </Link>
                  <div className="flex items-center gap-2">
                    <button onClick={() => openEdit(c)} className="btn-ghost text-xs" style={{ color: 'var(--brass)' }}>Edit</button>
                    {deleteConfirm === c.id ? (
                      <>
                        <button onClick={() => handleDelete(c.id)} className="btn-ghost text-xs" style={{ color: 'var(--ruby)' }}>Confirm</button>
                        <button onClick={() => setDeleteConfirm(null)} className="btn-ghost text-xs" style={{ color: 'var(--muted)' }}>Cancel</button>
                      </>
                    ) : (
                      <button onClick={() => setDeleteConfirm(c.id)} className="btn-ghost text-xs" style={{ color: 'var(--ruby)' }}>Delete</button>
                    )}
                  </div>
                </>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}

/* ================================================================== */
/*  Kanban view — 4 columns grouped by ordering recency               */
/* ================================================================== */

function KanbanView({
  customers,
  metricsByCustomer,
}: {
  customers: Customer[];
  metricsByCustomer: Map<string, CustomerMetrics>;
}) {
  const columns: KanbanBucket[] = ['new', 'active', 'at-risk', 'lapsed'];
  const byBucket = new Map<KanbanBucket, Customer[]>(columns.map((k) => [k, []]));
  for (const c of customers) {
    const m = metricsByCustomer.get(c.id);
    const b = bucketFor(m?.lastOrder || null);
    byBucket.get(b)!.push(c);
  }
  // Sort each column by LTV desc so the most valuable accounts surface first.
  for (const col of columns) {
    byBucket.get(col)!.sort((a, b) => (metricsByCustomer.get(b.id)?.ltv ?? 0) - (metricsByCustomer.get(a.id)?.ltv ?? 0));
  }
  const bucketAccent: Record<KanbanBucket, string> = {
    new: 'var(--brass)',
    active: 'var(--pine)',
    'at-risk': 'var(--ember)',
    lapsed: 'var(--ruby)',
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
      {columns.map((col) => {
        const colCustomers = byBucket.get(col) || [];
        return (
          <div key={col} className="min-w-0">
            <div className="pb-2 mb-3" style={{ borderBottom: `2px solid ${bucketAccent[col]}` }}>
              <div className="flex items-baseline justify-between">
                <span className="section-label" style={{ textTransform: 'uppercase', color: bucketAccent[col] }}>
                  {KANBAN_LABELS[col]}
                </span>
                <span className="font-variant-tabular text-sm" style={{ color: 'var(--muted)' }}>
                  {colCustomers.length}
                </span>
              </div>
              <p className="text-xs italic mt-1" style={{ color: 'var(--muted)' }}>
                {KANBAN_DESC[col]}
              </p>
            </div>
            <div className="space-y-2">
              {colCustomers.length === 0 ? (
                <p className="text-xs italic py-2" style={{ color: 'var(--faint)' }}>—</p>
              ) : (
                colCustomers.map((c) => {
                  const m = metricsByCustomer.get(c.id);
                  return (
                    <Link
                      key={c.id}
                      href={`/admin/customers/${c.id}`}
                      className="block p-3 hover:bg-[var(--surface)] transition-colors"
                      style={{ border: '1px solid var(--divider)', borderRadius: '3px', background: 'var(--surface)' }}
                    >
                      <div className="flex items-baseline justify-between gap-2 mb-1">
                        <span className="font-semibold truncate" style={{ color: 'var(--ink)' }}>
                          {c.businessName}
                        </span>
                        <span className="font-semibold font-variant-tabular text-xs shrink-0" style={{ color: 'var(--brass)' }}>
                          {formatCurrency(m?.ltv ?? 0)}
                        </span>
                      </div>
                      <p className="text-xs truncate" style={{ color: 'var(--muted)' }}>
                        {c.contactName}
                      </p>
                      <p className="text-[10px] font-variant-tabular mt-1" style={{ color: 'var(--muted)' }}>
                        {m?.orderCount ?? 0} order{m?.orderCount === 1 ? '' : 's'}
                        {m?.lastOrder ? ` · last ${formatDate(m.lastOrder)}` : ''}
                        {m && m.outstanding > 0 ? (
                          <> · <span style={{ color: 'var(--ruby)' }}>{formatCurrency(m.outstanding)} outstanding</span></>
                        ) : null}
                      </p>
                    </Link>
                  );
                })
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ================================================================== */
/*  CSV Import Modal                                                  */
/* ================================================================== */

// Minimal CSV parser. Handles quoted fields with escaped quotes + commas.
// For our import flow we trust the admin's file; a full RFC 4180 parser
// would be overkill (and adding a dependency isn't worth it).
function parseCSV(text: string): Record<string, string>[] {
  const lines: string[] = [];
  let current = '';
  let inQuote = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (inQuote && text[i + 1] === '"') { current += '"'; i++; continue; }
      inQuote = !inQuote;
      current += ch;
      continue;
    }
    if ((ch === '\n' || ch === '\r') && !inQuote) {
      if (current) { lines.push(current); current = ''; }
      if (ch === '\r' && text[i + 1] === '\n') i++;
      continue;
    }
    current += ch;
  }
  if (current) lines.push(current);
  if (lines.length === 0) return [];
  const splitRow = (line: string): string[] => {
    const out: string[] = [];
    let cell = '';
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (q && line[i + 1] === '"') { cell += '"'; i++; continue; }
        q = !q; continue;
      }
      if (ch === ',' && !q) { out.push(cell); cell = ''; continue; }
      cell += ch;
    }
    out.push(cell);
    return out.map((s) => s.trim());
  };
  const header = splitRow(lines[0]).map((h) => h.toLowerCase().replace(/\s+/g, ''));
  const mapHeader = (h: string): string => {
    // Map common column-header variants to our field names.
    if (h === 'businessname' || h === 'business' || h === 'company') return 'businessName';
    if (h === 'contactname' || h === 'contact' || h === 'name') return 'contactName';
    if (h === 'email' || h === 'emailaddress') return 'email';
    if (h === 'phone' || h === 'phonenumber' || h === 'tel') return 'phone';
    if (h === 'streetaddress' || h === 'street' || h === 'street1') return 'streetAddress';
    if (h === 'city') return 'city';
    if (h === 'state' || h === 'st' || h === 'province') return 'state';
    if (h === 'zip' || h === 'zipcode' || h === 'postalcode' || h === 'postal') return 'zip';
    // Legacy single-string column. Server-side import treats this as a fallback
    // and lands it in streetAddress if no split columns are present.
    if (h === 'address' || h === 'location') return 'address';
    if (h === 'password' || h === 'pw') return 'password';
    if (h === 'notes' || h === 'note') return 'notes';
    if (h === 'tags') return 'tags';
    return h;
  };
  const keys = header.map(mapHeader);
  return lines.slice(1).map((line) => {
    const cells = splitRow(line);
    const row: Record<string, string> = {};
    keys.forEach((k, i) => { row[k] = cells[i] ?? ''; });
    return row;
  }).filter((r) => Object.values(r).some((v) => v)); // skip empty lines
}

function ImportModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [parseError, setParseError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ created: number; skipped: { email: string; reason: string }[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (f: File) => {
    setFile(f);
    setResult(null);
    setParseError('');
    try {
      const text = await f.text();
      const parsed = parseCSV(text);
      if (parsed.length === 0) {
        setParseError('No data rows found. Does the file have a header row?');
        setRows([]);
        return;
      }
      const missing: string[] = [];
      if (!('businessName' in parsed[0])) missing.push('businessName');
      if (!('contactName' in parsed[0])) missing.push('contactName');
      if (!('email' in parsed[0])) missing.push('email');
      if (missing.length > 0) {
        setParseError(`Missing required column${missing.length === 1 ? '' : 's'}: ${missing.join(', ')}. Expected headers: businessName, contactName, email, phone, streetAddress, city, state, zip, password, notes, tags.`);
        setRows([]);
        return;
      }
      setRows(parsed);
    } catch {
      setParseError('Could not read the file. Is it a CSV?');
      setRows([]);
    }
  };

  const submit = async () => {
    if (rows.length === 0) return;
    setSubmitting(true);
    try {
      const res = await adminFetch('/api/customers/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows }),
      });
      const data = await res.json();
      if (!res.ok) {
        setParseError(typeof data?.error === 'string' ? data.error : 'Import failed.');
        return;
      }
      setResult({ created: data.created, skipped: data.skipped || [] });
    } catch {
      setParseError('Network error during import.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-charcoal-100 border border-divider rounded-2xl shadow-lg max-w-2xl w-full p-6 animate-scale-in max-h-[90vh] overflow-y-auto">
        <h3 className="font-heading text-xl font-bold mb-1" style={{ color: 'var(--ink)' }}>Import Customers from CSV</h3>
        <p className="text-sm mb-5 italic" style={{ color: 'var(--muted)' }}>
          Required columns: <code>businessName</code>, <code>contactName</code>, <code>email</code>.
          Optional: <code>phone</code>, <code>streetAddress</code>, <code>city</code>, <code>state</code>, <code>zip</code>, <code>password</code>, <code>notes</code>, <code>tags</code>.
          Legacy single <code>address</code> column also accepted (lands in <code>streetAddress</code>).
          Duplicates by email are skipped.
        </p>

        {!result && (
          <div className="space-y-4">
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                className="block w-full text-sm"
                style={{ color: 'var(--ink)' }}
              />
              {file && (
                <p className="text-xs mt-2" style={{ color: 'var(--muted)' }}>
                  <strong>{file.name}</strong> &middot; {(file.size / 1024).toFixed(1)} KB
                  {rows.length > 0 && <> &middot; {rows.length} row{rows.length === 1 ? '' : 's'} parsed</>}
                </p>
              )}
            </div>

            {parseError && (
              <p className="text-sm px-3 py-2" style={{ color: 'var(--ruby)', background: 'color-mix(in srgb, var(--ruby) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--ruby) 40%, transparent)', borderRadius: '3px' }}>
                {parseError}
              </p>
            )}

            {rows.length > 0 && !parseError && (
              <div>
                <span className="section-label block mb-2">Preview (first 5 rows)</span>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr>
                        {Object.keys(rows[0]).map((k) => (
                          <th key={k} className="table-header">{k}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.slice(0, 5).map((row, i) => (
                        <tr key={i}>
                          {Object.keys(rows[0]).map((k) => (
                            <td key={k} className="table-cell">{row[k] || <span style={{ color: 'var(--faint)' }}>—</span>}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-3">
              <button type="button" onClick={onClose} className="btn-secondary px-4 py-2" disabled={submitting}>
                Cancel
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={submitting || rows.length === 0 || !!parseError}
                className="btn-primary"
              >
                {submitting ? 'Importing...' : `Import ${rows.length} customer${rows.length === 1 ? '' : 's'}`}
              </button>
            </div>
          </div>
        )}

        {result && (
          <div className="space-y-4">
            <div
              className="px-3 py-3 text-sm"
              style={{
                background: 'color-mix(in srgb, var(--pine) 10%, transparent)',
                border: '1px solid color-mix(in srgb, var(--pine) 40%, transparent)',
                borderRadius: '3px',
                color: 'var(--pine)',
              }}
            >
              <strong>{result.created}</strong> customer{result.created === 1 ? '' : 's'} imported.
              {result.skipped.length > 0 && <> <strong>{result.skipped.length}</strong> skipped.</>}
            </div>

            {result.skipped.length > 0 && (
              <div>
                <span className="section-label block mb-2">Skipped</span>
                <ul className="text-xs space-y-1 max-h-64 overflow-y-auto" style={{ color: 'var(--muted)' }}>
                  {result.skipped.map((s, i) => (
                    <li key={i}>
                      <strong style={{ color: 'var(--ink)' }}>{s.email || '(no email)'}</strong>
                      <span className="ml-2 italic">{s.reason}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-3">
              <button type="button" onClick={onDone} className="btn-primary">
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
