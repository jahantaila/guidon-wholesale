'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import type { Customer, Order, Invoice, KegLedgerEntry, KegBalance, RecurringOrder, CrmActivity, CrmActivityType } from '@/lib/types';
import { CRM_ACTIVITY_LABELS, CRM_ACTIVITY_TYPES } from '@/lib/types';
import { formatCurrency, formatDate, getStatusColor, cn, formatAddress, formatPhone, US_STATES } from '@/lib/utils';
import { adminFetch } from '@/lib/admin-fetch';

const TODAY = () => new Date().toISOString().slice(0, 10);

export default function CustomerDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [ledger, setLedger] = useState<KegLedgerEntry[]>([]);
  const [recurring, setRecurring] = useState<RecurringOrder[]>([]);

  // CRM activity — the SAME crm_activities the CRM page reads, so a call or
  // visit logged here shows up as the account's "last touch" over there, and
  // vice-versa. This is the notes/last-visit "sync" Mike asked for.
  const [activities, setActivities] = useState<CrmActivity[]>([]);
  const [logForm, setLogForm] = useState<{ type: CrmActivityType; date: string; note: string }>({
    type: 'spoke_phone',
    date: TODAY(),
    note: '',
  });
  const [logging, setLogging] = useState(false);

  // Edit + delete the customer from this page (no round-trip to the list).
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    businessName: '', contactName: '', email: '', phone: '',
    streetAddress: '', city: '', state: '', zip: '',
    abcPermitNumber: '', customerIdentification: '',
    preferredPaymentMethod: 'no_preference' as 'check' | 'fintech' | 'no_preference',
  });
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [ledgerFilter, setLedgerFilter] = useState<'all' | 'deposit' | 'return'>('all');
  const [ledgerSizeFilter, setLedgerSizeFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [sendingReminder, setSendingReminder] = useState(false);
  const [toast, setToast] = useState('');
  const [notesDraft, setNotesDraft] = useState('');
  const [tagsDraft, setTagsDraft] = useState('');
  const [autoSendDraft, setAutoSendDraft] = useState(false);
  const [followupDateDraft, setFollowupDateDraft] = useState('');
  const [followupNotesDraft, setFollowupNotesDraft] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);
  const [recurringName, setRecurringName] = useState('');
  const [recurringInterval, setRecurringInterval] = useState<number>(7);
  const [creatingRecurring, setCreatingRecurring] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const [customersRes, ordersRes, invoicesRes, ledgerRes, recurringRes, activitiesRes] = await Promise.all([
          adminFetch('/api/customers'),
          adminFetch(`/api/orders?customerId=${id}`),
          adminFetch(`/api/invoices?customerId=${id}`),
          adminFetch(`/api/keg-ledger?customerId=${id}`),
          adminFetch(`/api/recurring-orders?customerId=${id}`),
          adminFetch(`/api/admin/crm/activities?subjectId=${id}`),
        ]);
        const customers: Customer[] = await customersRes.json();
        const c = customers.find((x) => x.id === id) || null;
        setCustomer(c);
        const actData = await activitiesRes.json().catch(() => []);
        setActivities(Array.isArray(actData) ? actData : []);
        if (c) {
          setNotesDraft(c.notes || '');
          setTagsDraft((c.tags || []).join(', '));
          setAutoSendDraft(c.autoSendInvoices === true);
          setFollowupDateDraft(c.nextFollowupDate || '');
          setFollowupNotesDraft(c.nextFollowupNotes || '');
        }
        setOrders(await ordersRes.json());
        setInvoices(await invoicesRes.json());
        setLedger(await ledgerRes.json());
        const recData = await recurringRes.json().catch(() => []);
        setRecurring(Array.isArray(recData) ? recData : []);
      } catch (err) {
        console.error('Failed to load customer detail', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  const balance: KegBalance = useMemo(() => {
    const b: KegBalance = { '1/2bbl': 0, '1/4bbl': 0, '1/6bbl': 0 };
    for (const entry of ledger) {
      if (entry.type === 'deposit') b[entry.size] += entry.quantity;
      if (entry.type === 'return') b[entry.size] -= entry.quantity;
    }
    return b;
  }, [ledger]);

  const totalKegsOut = balance['1/2bbl'] + balance['1/4bbl'] + balance['1/6bbl'];
  const totalSpent = orders.reduce((sum, o) => sum + o.total, 0);
  // Last activity = the customer's most recent order date. Derived live from
  // the orders list so it's always accurate without a stored column.
  const lastOrderDate = useMemo(
    () =>
      orders.length === 0
        ? null
        : orders.reduce((latest, o) => (o.createdAt > latest ? o.createdAt : latest), orders[0].createdAt),
    [orders],
  );
  // Follow-up is "due" when the scheduled date is today or in the past.
  const followupDue =
    !!customer?.nextFollowupDate && customer.nextFollowupDate <= new Date().toISOString().slice(0, 10);
  const shippedOrders = orders.filter((o) => o.status === 'confirmed' || o.status === 'completed');
  const outstandingInvoices = invoices.filter((i) => i.status === 'unpaid' || i.status === 'overdue');
  const outstandingAmount = outstandingInvoices.reduce((s, i) => s + i.total, 0);

  // Schedule a recurring order using the customer's most recent order's items
  // as the template. Easiest flow: customer has placed at least one order
  // that Mike trusts → admin clicks to clone it into a weekly/biweekly cycle.
  const createRecurringFromLastOrder = async () => {
    const last = [...orders].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
    if (!last) return;
    const name = recurringName.trim() || `Every ${recurringInterval} days`;
    setCreatingRecurring(true);
    try {
      const res = await adminFetch('/api/recurring-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: customer?.id,
          name,
          items: last.items,
          intervalDays: recurringInterval,
        }),
      });
      if (res.ok) {
        const created = await res.json();
        setRecurring((prev) => [created, ...prev]);
        setRecurringName('');
        setToast(`Scheduled "${name}". Next order auto-creates in ${recurringInterval} days.`);
      } else {
        const data = await res.json().catch(() => ({}));
        setToast(data?.error || 'Failed to schedule.');
      }
    } catch {
      setToast('Failed to schedule.');
    } finally {
      setCreatingRecurring(false);
      window.setTimeout(() => setToast(''), 4000);
    }
  };

  const toggleRecurring = async (rec: RecurringOrder) => {
    try {
      const res = await adminFetch('/api/recurring-orders', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: rec.id, active: !rec.active }),
      });
      if (res.ok) {
        const updated = await res.json();
        setRecurring((prev) => prev.map((r) => (r.id === rec.id ? updated : r)));
      }
    } catch { /* ignore */ }
  };

  const deleteRecurring = async (recId: string) => {
    try {
      const res = await adminFetch('/api/recurring-orders', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: recId }),
      });
      if (res.ok) setRecurring((prev) => prev.filter((r) => r.id !== recId));
    } catch { /* ignore */ }
  };

  const saveNotes = async () => {
    if (!customer) return;
    setSavingNotes(true);
    try {
      const tags = tagsDraft
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      const res = await adminFetch('/api/customers', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: customer.id,
          notes: notesDraft,
          tags,
          autoSendInvoices: autoSendDraft,
          nextFollowupDate: followupDateDraft || null,
          nextFollowupNotes: followupNotesDraft,
        }),
      });
      if (res.ok) {
        const updated = await res.json();
        setCustomer(updated);
        setToast('Notes saved.');
      } else {
        const data = await res.json().catch(() => ({}));
        setToast(data?.error || 'Save failed.');
      }
    } catch {
      setToast('Save failed.');
    } finally {
      setSavingNotes(false);
      window.setTimeout(() => setToast(''), 3000);
    }
  };

  const refreshActivities = async () => {
    try {
      const res = await adminFetch(`/api/admin/crm/activities?subjectId=${id}`);
      const data = await res.json().catch(() => []);
      setActivities(Array.isArray(data) ? data : []);
    } catch {
      /* ignore */
    }
  };

  const submitLog = async () => {
    if (!customer) return;
    // Anchor the day at local noon so it doesn't slip in UTC.
    const occurredAt = new Date(`${logForm.date}T12:00:00`).toISOString();
    setLogging(true);
    try {
      const res = await adminFetch('/api/admin/crm/activities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subjectId: customer.id, type: logForm.type, occurredAt, notes: logForm.note.trim() }),
      });
      if (res.ok) {
        setLogForm({ type: 'spoke_phone', date: TODAY(), note: '' });
        setToast(`${CRM_ACTIVITY_LABELS[logForm.type]} logged.`);
        await refreshActivities();
      } else {
        const data = await res.json().catch(() => ({}));
        setToast(data?.error || 'Could not log that.');
      }
    } catch {
      setToast('Could not log that.');
    } finally {
      setLogging(false);
      window.setTimeout(() => setToast(''), 3000);
    }
  };

  const openEdit = () => {
    if (!customer) return;
    setEditForm({
      businessName: customer.businessName,
      contactName: customer.contactName,
      email: customer.email,
      phone: customer.phone,
      streetAddress: customer.streetAddress,
      city: customer.city,
      state: customer.state,
      zip: customer.zip,
      abcPermitNumber: customer.abcPermitNumber || '',
      customerIdentification: customer.customerIdentification || '',
      preferredPaymentMethod: customer.preferredPaymentMethod || 'no_preference',
    });
    setEditError('');
    setEditOpen(true);
  };

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customer) return;
    setSavingEdit(true);
    setEditError('');
    try {
      const res = await adminFetch('/api/customers', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: customer.id, ...editForm }),
      });
      if (res.ok) {
        const updated = await res.json();
        setCustomer(updated);
        setEditOpen(false);
        setToast('Customer updated.');
        window.setTimeout(() => setToast(''), 3000);
      } else {
        const data = await res.json().catch(() => ({}));
        setEditError(data?.error || 'Save failed.');
      }
    } catch {
      setEditError('Save failed. Please retry.');
    } finally {
      setSavingEdit(false);
    }
  };

  const deleteCustomer = async () => {
    if (!customer) return;
    setDeleting(true);
    try {
      const res = await adminFetch('/api/customers', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: customer.id }),
      });
      if (res.ok) {
        // Archived (had history) or hard-deleted — either way, back to the list.
        router.push('/admin/customers');
      } else {
        const data = await res.json().catch(() => ({}));
        setToast(data?.error || 'Delete failed.');
        window.setTimeout(() => setToast(''), 5000);
        setDeleteConfirm(false);
      }
    } catch {
      setToast('Delete failed.');
      window.setTimeout(() => setToast(''), 5000);
      setDeleteConfirm(false);
    } finally {
      setDeleting(false);
    }
  };

  const remindAboutKegs = async () => {
    if (shippedOrders.length === 0) return;
    setSendingReminder(true);
    try {
      // Send a reminder for the most recent confirmed/completed order that still has kegs.
      const target = shippedOrders.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )[0];
      const res = await adminFetch('/api/admin/remind-kegs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: target.id }),
      });
      if (res.ok) {
        setToast(`Reminder sent to ${customer?.email}.`);
      } else {
        const data = await res.json().catch(() => ({}));
        setToast(data.error || 'Reminder failed.');
      }
    } catch {
      setToast('Reminder failed.');
    } finally {
      setSendingReminder(false);
      window.setTimeout(() => setToast(''), 3500);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-8 w-64" />
        <div className="skeleton h-32 w-full" />
        <div className="skeleton h-64 w-full" />
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="space-y-4">
        <p className="italic" style={{ color: 'var(--muted)' }}>Customer not found.</p>
        <Link href="/admin/customers" className="btn-ghost">&larr; Back to customers</Link>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      {toast && <div className="toast">{toast}</div>}

      {/* Header */}
      <div className="flex items-start justify-between gap-6">
        <div>
          <Link
            href="/admin/customers"
            className="section-label hover:underline"
            style={{ color: 'var(--muted)' }}
          >
            &larr; All customers
          </Link>
          <h2
            className="font-display mt-1"
            style={{
              fontSize: '2.5rem',
              fontVariationSettings: "'opsz' 72",
              color: 'var(--ink)',
              fontWeight: 500,
            }}
          >
            {customer.businessName}
          </h2>
          <p className="mt-1" style={{ color: 'var(--muted)' }}>
            <span className="font-semibold">{customer.contactName}</span> &middot;{' '}
            <a href={`mailto:${customer.email}`} style={{ color: 'var(--brass)' }}>
              {customer.email}
            </a>
            {customer.phone && (
              <>
                {' '}&middot; <span className="font-variant-tabular">{formatPhone(customer.phone)}</span>
              </>
            )}
          </p>
          {formatAddress(customer) && (
            <p className="mt-1 italic" style={{ color: 'var(--muted)' }}>
              {formatAddress(customer)}
            </p>
          )}
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: 'var(--muted)' }}>
            <span>
              <span style={{ color: 'var(--faint)' }}>ID:</span>{' '}
              <span className="font-mono">{customer.id}</span>
            </span>
            <span>
              <span style={{ color: 'var(--faint)' }}>ABC Permit:</span>{' '}
              <span className="font-mono">{customer.abcPermitNumber || 'N/A'}</span>
            </span>
            {customer.customerIdentification && (
              <span>
                <span style={{ color: 'var(--faint)' }}>Customer Identification:</span>{' '}
                <span className="font-mono">{customer.customerIdentification}</span>
              </span>
            )}
            <span>
              <span style={{ color: 'var(--faint)' }}>Payment:</span>{' '}
              {(() => {
                const labels: Record<string, string> = { check: 'Check', fintech: 'Fintech', no_preference: 'No preference' };
                return labels[customer.preferredPaymentMethod || 'no_preference'];
              })()}
            </span>
            {customer.autoSendInvoices && (
              <span style={{ color: 'var(--pine)' }}>
                <span style={{ color: 'var(--faint)' }}>Auto-send invoices:</span>{' '}
                <span className="font-semibold">on</span>
              </span>
            )}
            <span>
              <span style={{ color: 'var(--faint)' }}>Last activity:</span>{' '}
              {lastOrderDate ? formatDate(lastOrderDate) : <span className="italic">Never ordered</span>}
            </span>
            {customer.nextFollowupDate && (
              <span style={{ color: followupDue ? 'var(--ember)' : 'var(--muted)' }}>
                <span style={{ color: 'var(--faint)' }}>Next follow-up:</span>{' '}
                <span className="font-semibold">{formatDate(customer.nextFollowupDate)}</span>
                {followupDue && ' (due)'}
              </span>
            )}
          </div>
          {Array.isArray(customer.tags) && customer.tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {customer.tags.map((t) => (
                <span key={t} className="text-[10px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5"
                  style={{ background: 'color-mix(in srgb, var(--brass) 15%, transparent)', color: 'var(--brass)' }}>{t}</span>
              ))}
            </div>
          )}
          {customer.notes && (
            <p className="mt-2 text-xs italic max-w-xl" style={{ color: 'var(--muted)' }}>
              <span style={{ color: 'var(--faint)' }}>Notes:</span> {customer.notes}
            </p>
          )}
          <p className="mt-1 text-xs" style={{ color: 'var(--faint)' }}>
            Customer since {formatDate(customer.createdAt)}
          </p>
        </div>
        <div className="flex flex-col gap-2 shrink-0">
          <Link
            href={`/order?customerId=${customer.id}&adminMode=1`}
            className="btn-primary text-sm text-center"
          >
            Place order &rarr;
          </Link>
          <button onClick={openEdit} className="btn-secondary text-sm">
            Edit details
          </button>
          {totalKegsOut > 0 && (
            <button
              onClick={remindAboutKegs}
              disabled={sendingReminder || shippedOrders.length === 0}
              className="btn-secondary text-sm"
            >
              {sendingReminder ? 'Sending…' : 'Remind about kegs'}
            </button>
          )}
          {deleteConfirm ? (
            <div className="flex flex-col gap-1 items-stretch">
              <button
                onClick={deleteCustomer}
                disabled={deleting}
                className="btn-secondary text-sm"
                style={{ color: 'var(--ruby)', borderColor: 'var(--ruby)' }}
              >
                {deleting ? 'Deleting…' : 'Confirm delete'}
              </button>
              <button onClick={() => setDeleteConfirm(false)} className="text-xs" style={{ color: 'var(--muted)' }}>
                Cancel
              </button>
            </div>
          ) : (
            <button onClick={() => setDeleteConfirm(true)} className="text-xs mt-1" style={{ color: 'var(--ruby)' }}>
              Delete customer
            </button>
          )}
        </div>
      </div>

      {/* Ledger line summary */}
      <div className="ledger-line">
        <span
          className="font-display italic mr-2"
          style={{ color: 'var(--muted)', fontVariationSettings: "'opsz' 24" }}
        >
          Snapshot:
        </span>
        <span className="ledger-num">{orders.length}</span> order{orders.length === 1 ? '' : 's'} to date,{' '}
        <span className="ledger-num">{formatCurrency(totalSpent)}</span> total spend.{' '}
        {totalKegsOut > 0 ? (
          <>
            <span className="ledger-num" style={{ color: 'var(--ember)' }}>{totalKegsOut}</span> keg
            {totalKegsOut === 1 ? '' : 's'} outstanding (
            <span className="font-variant-tabular">{balance['1/2bbl']}</span> half /{' '}
            <span className="font-variant-tabular">{balance['1/4bbl']}</span> quarter /{' '}
            <span className="font-variant-tabular">{balance['1/6bbl']}</span> sixth).{' '}
          </>
        ) : (
          <span style={{ color: 'var(--pine)' }}>No kegs outstanding.{' '}</span>
        )}
        {outstandingInvoices.length > 0 ? (
          <>
            <span className="ledger-num" style={{ color: 'var(--ruby)' }}>{outstandingInvoices.length}</span>{' '}
            invoice{outstandingInvoices.length === 1 ? '' : 's'} outstanding (
            <span className="ledger-num" style={{ color: 'var(--ruby)' }}>{formatCurrency(outstandingAmount)}</span>
            ).
          </>
        ) : (
          <span style={{ color: 'var(--pine)' }}>All invoices settled.</span>
        )}
      </div>

      {/* Brewery-only notes and tags. Customer never sees these. Saves only
          on the explicit "Save" click so staff can draft in peace. */}
      <section className="card p-5">
        <div className="flex items-baseline justify-between mb-2">
          <span className="section-label">Brewery Notes</span>
          <span className="text-xs italic" style={{ color: 'var(--muted)' }}>
            Internal — not shown to customer
          </span>
        </div>
        <textarea
          value={notesDraft}
          onChange={(e) => setNotesDraft(e.target.value)}
          rows={3}
          placeholder="e.g. Prefers Thursday deliveries. Pays in cash on arrival. Tap 4 is Guidon-only per contract."
          className="input w-full text-sm mb-3"
          style={{ resize: 'vertical' }}
        />
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-end">
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--muted)' }}>Tags <span className="font-normal">(comma-separated)</span></label>
            <input
              type="text"
              value={tagsDraft}
              onChange={(e) => setTagsDraft(e.target.value)}
              placeholder="priority, net-30, tasting-room"
              className="input w-full text-sm"
            />
          </div>
          <button
            onClick={saveNotes}
            disabled={savingNotes}
            className="btn-primary text-sm"
          >
            {savingNotes ? 'Saving...' : 'Save'}
          </button>
        </div>
        {/* CRM: next scheduled visit / follow-up + comments. Saved together
            with notes + tags on the Save button above. */}
        <div className="grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-3 mt-4 pt-4 border-t border-divider">
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--muted)' }}>
              Next visit / follow-up
            </label>
            <input
              type="date"
              value={followupDateDraft}
              onChange={(e) => setFollowupDateDraft(e.target.value)}
              className="input w-full text-sm font-variant-tabular"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--muted)' }}>
              Follow-up comments
            </label>
            <input
              type="text"
              value={followupNotesDraft}
              onChange={(e) => setFollowupNotesDraft(e.target.value)}
              placeholder="e.g. Check in about the fall seasonal order"
              className="input w-full text-sm"
            />
          </div>
        </div>
        <div className="flex items-center gap-3 mt-4 pt-4 border-t border-divider">
          <input
            type="checkbox"
            id="autoSend"
            checked={autoSendDraft}
            onChange={(e) => setAutoSendDraft(e.target.checked)}
            className="w-4 h-4 accent-gold cursor-pointer"
          />
          <label htmlFor="autoSend" className="text-sm cursor-pointer select-none" style={{ color: 'var(--ink)' }}>
            Auto-send invoices on delivery
          </label>
          <span className="text-xs italic flex-1" style={{ color: 'var(--muted)' }}>
            When on, this customer gets their invoice emailed the moment their order is confirmed. When off, admin reviews + clicks Send from the Invoices tab first.
          </span>
        </div>
        {customer.tags && customer.tags.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-divider">
            {customer.tags.map((t) => (
              <span key={t} className="badge-sm" style={{ color: 'var(--brass)', borderColor: 'var(--brass)' }}>{t}</span>
            ))}
          </div>
        )}
      </section>

      {/* CRM activity — the SAME crm_activities the CRM page reads. A call,
          visit or sample-drop logged here becomes this account's "last touch"
          in the CRM, and anything logged from the CRM shows up here. That is
          the notes / last-visit sync between Customers and CRM. */}
      <section className="card p-5">
        <div className="flex items-baseline justify-between mb-3">
          <span className="section-label">Activity</span>
          <span className="text-xs italic" style={{ color: 'var(--muted)' }}>Shared with the CRM</span>
        </div>
        <div className="flex flex-wrap items-end gap-2 mb-4">
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--muted)' }}>Activity</label>
            <select
              className="input text-sm"
              value={logForm.type}
              onChange={(e) => setLogForm((f) => ({ ...f, type: e.target.value as CrmActivityType }))}
            >
              {CRM_ACTIVITY_TYPES.map((t) => <option key={t} value={t}>{CRM_ACTIVITY_LABELS[t]}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--muted)' }}>Date</label>
            <input
              type="date"
              className="input text-sm font-variant-tabular"
              value={logForm.date}
              max={TODAY()}
              onChange={(e) => setLogForm((f) => ({ ...f, date: e.target.value }))}
            />
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--muted)' }}>Note (optional)</label>
            <input
              type="text"
              className="input text-sm w-full"
              placeholder="e.g. Dropped samples of the fall seasonal; owner liked it"
              value={logForm.note}
              onChange={(e) => setLogForm((f) => ({ ...f, note: e.target.value }))}
            />
          </div>
          <button onClick={submitLog} disabled={logging} className="btn-primary text-sm">
            {logging ? 'Saving…' : 'Log'}
          </button>
        </div>
        {activities.length === 0 ? (
          <p className="text-sm italic" style={{ color: 'var(--muted)' }}>
            No calls, visits or emails logged yet. Orders count as touches automatically.
          </p>
        ) : (
          <ul className="border-t border-divider">
            {activities.map((a) => (
              <li key={a.id} className="py-2 border-b border-divider flex items-baseline gap-3 flex-wrap">
                <span className="font-variant-tabular text-xs shrink-0" style={{ color: 'var(--muted)', minWidth: 92 }}>
                  {formatDate(a.occurredAt)}
                </span>
                <span className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                  {CRM_ACTIVITY_LABELS[a.type] || a.type}
                </span>
                {a.notes && (
                  <span className="text-sm italic" style={{ color: 'var(--muted)' }}>— {a.notes}</span>
                )}
                {a.source === 'system' && (
                  <span className="text-[10px] ml-auto" style={{ color: 'var(--faint)' }}>auto-logged</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Recurring orders: admin-managed cron-fed templates. Daily cron
          (/api/cron/recurring-orders at 13:00 UTC) creates a pending order
          for this customer every interval_days. Pause or delete anytime. */}
      <section className="card p-5">
        <div className="mb-3">
          <span className="section-label">Recurring Orders</span>
          <p className="text-xs italic mt-1" style={{ color: 'var(--muted)' }}>
            Daily cron creates a pending order from the saved items every N days. Admin reviews each one before delivery.
          </p>
        </div>
        {/* Quick-create from last order */}
        {orders.length > 0 && (
          <div className="mb-4 p-3 bg-charcoal-200 rounded-lg border border-white/[0.04]">
            <p className="text-xs mb-2" style={{ color: 'var(--muted)' }}>
              Clone the customer&rsquo;s most recent order ({orders[0]?.id}) as a template:
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <input
                type="text"
                value={recurringName}
                onChange={(e) => setRecurringName(e.target.value)}
                placeholder="Name (optional, e.g. Weekly Tuesday)"
                className="input flex-1 min-w-[180px] text-sm"
              />
              <select
                value={recurringInterval}
                onChange={(e) => setRecurringInterval(Number(e.target.value))}
                className="input max-w-[140px] text-sm"
              >
                <option value={7}>Every 7 days</option>
                <option value={14}>Every 14 days</option>
                <option value={28}>Every 28 days</option>
              </select>
              <button
                onClick={createRecurringFromLastOrder}
                disabled={creatingRecurring}
                className="btn-primary text-xs"
              >
                {creatingRecurring ? 'Scheduling...' : 'Schedule'}
              </button>
            </div>
          </div>
        )}
        {recurring.length === 0 ? (
          <p className="text-sm italic" style={{ color: 'var(--muted)' }}>
            {orders.length === 0
              ? 'Place at least one order for this customer first; then you can clone it as a recurring order.'
              : 'No recurring orders yet.'}
          </p>
        ) : (
          <ul className="border-t border-divider">
            {recurring.map((r) => (
              <li key={r.id} className="py-3 border-b border-divider flex items-center gap-4">
                <div className="flex-1">
                  <p className="font-semibold" style={{ color: 'var(--ink)' }}>
                    {r.name}
                    {!r.active && (
                      <span className="ml-2 text-xs font-normal italic" style={{ color: 'var(--muted)' }}>
                        (paused)
                      </span>
                    )}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--muted)' }}>
                    Every {r.intervalDays} days &middot; {r.items.length} item{r.items.length === 1 ? '' : 's'} &middot;
                    next {r.active ? formatDate(r.nextRunAt) : 'paused'}
                  </p>
                </div>
                <button
                  onClick={() => toggleRecurring(r)}
                  className="btn-ghost text-xs"
                  style={{ color: r.active ? 'var(--muted)' : 'var(--brass)' }}
                >
                  {r.active ? 'Pause' : 'Resume'}
                </button>
                <button
                  onClick={() => deleteRecurring(r.id)}
                  className="btn-ghost text-xs"
                  style={{ color: 'var(--ruby)' }}
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Two-column editorial layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
        {/* Order history */}
        <section>
          <span className="section-label mb-3 block">Order History</span>
          {orders.length === 0 ? (
            <p className="italic" style={{ color: 'var(--muted)' }}>No orders yet.</p>
          ) : (
            <ul className="border-t border-divider">
              {orders
                .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                .map((order) => (
                  <li
                    key={order.id}
                    className="py-3 border-b border-divider flex items-baseline justify-between gap-4"
                  >
                    <div className="flex-1 min-w-0">
                      <Link
                        href={`/admin/orders/${order.id}`}
                        className="font-semibold hover:underline"
                        style={{ color: 'var(--brass)' }}
                      >
                        {order.id}
                      </Link>
                      <p className="text-sm" style={{ color: 'var(--muted)' }}>
                        {formatDate(order.createdAt)} &middot; {order.items.length} item
                        {order.items.length === 1 ? '' : 's'}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-semibold font-variant-tabular" style={{ color: 'var(--ink)' }}>
                        {formatCurrency(order.total)}
                      </p>
                      <span className={cn('badge-sm', getStatusColor(order.status))}>
                        {order.status}
                      </span>
                    </div>
                  </li>
                ))}
            </ul>
          )}
        </section>

        {/* Invoices */}
        <section>
          <span className="section-label mb-3 block">Invoices</span>
          {invoices.length === 0 ? (
            <p className="italic" style={{ color: 'var(--muted)' }}>No invoices yet.</p>
          ) : (
            <ul className="border-t border-divider">
              {invoices
                .sort((a, b) => new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime())
                .map((inv) => (
                  <li
                    key={inv.id}
                    className="py-3 border-b border-divider flex items-baseline justify-between gap-4"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold" style={{ color: 'var(--ink)' }}>
                        {inv.id}
                      </p>
                      <p className="text-sm" style={{ color: 'var(--muted)' }}>
                        Order {inv.orderId} &middot; issued {formatDate(inv.issuedAt)}
                        {inv.paidAt && <> &middot; paid {formatDate(inv.paidAt)}</>}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-semibold font-variant-tabular" style={{ color: 'var(--ink)' }}>
                        {formatCurrency(inv.total)}
                      </p>
                      <span
                        className="badge-sm"
                        style={{
                          color:
                            inv.status === 'paid'
                              ? 'var(--pine)'
                              : inv.status === 'overdue'
                              ? 'var(--ruby)'
                              : inv.status === 'draft'
                              ? 'var(--muted)'
                              : 'var(--ember)',
                          borderColor:
                            inv.status === 'paid'
                              ? 'var(--pine)'
                              : inv.status === 'overdue'
                              ? 'var(--ruby)'
                              : inv.status === 'draft'
                              ? 'var(--muted)'
                              : 'var(--ember)',
                        }}
                      >
                        {inv.status}
                      </span>
                    </div>
                  </li>
                ))}
            </ul>
          )}
        </section>
      </div>

      {/* Keg ledger */}
      <section>
        <div className="flex items-baseline justify-between mb-3 flex-wrap gap-3">
          <span className="section-label">Keg Ledger</span>
          {ledger.length > 0 && (() => {
            const deposits = ledger.filter((e) => e.type === 'deposit').reduce((s, e) => s + e.quantity, 0);
            const returns = ledger.filter((e) => e.type === 'return').reduce((s, e) => s + e.quantity, 0);
            const outstanding = deposits - returns;
            return (
              <span className="text-xs" style={{ color: 'var(--muted)' }}>
                <strong style={{ color: 'var(--ink)' }}>{deposits}</strong> sent &middot;{' '}
                <strong style={{ color: 'var(--pine)' }}>{returns}</strong> returned &middot;{' '}
                <strong style={{ color: outstanding > 0 ? 'var(--ember)' : 'var(--pine)' }}>{outstanding}</strong> still out
              </span>
            );
          })()}
        </div>

        {ledger.length === 0 ? (
          <p className="italic" style={{ color: 'var(--muted)' }}>
            No keg movements on record. Entries appear here when orders are confirmed or returns are requested.
          </p>
        ) : (
          <>
            {/* Filter chips: type + size */}
            <div className="flex flex-wrap gap-2 mb-3">
              {(['all', 'deposit', 'return'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setLedgerFilter(t)}
                  className="px-3 py-1 text-xs font-semibold font-ui border"
                  style={{
                    borderRadius: '3px',
                    borderColor: ledgerFilter === t ? 'var(--brass-dim)' : 'var(--divider)',
                    background: ledgerFilter === t ? 'var(--brass)' : 'transparent',
                    color: ledgerFilter === t ? 'var(--paper)' : 'var(--ink)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                  }}
                >
                  {t === 'all' ? 'All' : t === 'deposit' ? 'Deposits' : 'Returns'}
                </button>
              ))}
              <span className="text-xs italic self-center mx-1" style={{ color: 'var(--muted)' }}>&middot;</span>
              {(['all', ...Array.from(new Set(ledger.map((e) => e.size)))] as string[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setLedgerSizeFilter(s)}
                  className="px-3 py-1 text-xs font-semibold font-ui border"
                  style={{
                    borderRadius: '3px',
                    borderColor: ledgerSizeFilter === s ? 'var(--brass-dim)' : 'var(--divider)',
                    background: ledgerSizeFilter === s ? 'var(--brass)' : 'transparent',
                    color: ledgerSizeFilter === s ? 'var(--paper)' : 'var(--ink)',
                  }}
                >
                  {s === 'all' ? 'All sizes' : s}
                </button>
              ))}
            </div>

          <table className="w-full">
            <thead>
              <tr>
                <th className="table-header">Date</th>
                <th className="table-header">Type</th>
                <th className="table-header">Size</th>
                <th className="table-header text-right">Qty</th>
                <th className="table-header">Order</th>
                <th className="table-header">Note</th>
              </tr>
            </thead>
            <tbody>
              {ledger
                .filter((e) => ledgerFilter === 'all' || e.type === ledgerFilter)
                .filter((e) => ledgerSizeFilter === 'all' || e.size === ledgerSizeFilter)
                .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                .map((e) => (
                  <tr key={e.id}>
                    <td className="table-cell font-variant-tabular">{formatDate(e.date)}</td>
                    <td className="table-cell">
                      <span
                        className="section-label"
                        style={{ color: e.type === 'deposit' ? 'var(--brass)' : 'var(--pine)' }}
                      >
                        {e.type}
                      </span>
                    </td>
                    <td className="table-cell font-variant-tabular">{e.size}</td>
                    <td className="table-cell text-right font-variant-tabular" style={{ color: e.type === 'return' ? 'var(--pine)' : 'var(--ink)' }}>
                      {e.type === 'return' ? '-' : '+'}{e.quantity}
                    </td>
                    <td className="table-cell font-variant-tabular" style={{ color: 'var(--muted)' }}>
                      {e.orderId || <span className="italic">—</span>}
                    </td>
                    <td className="table-cell text-sm italic" style={{ color: 'var(--muted)' }}>
                      {e.notes || <span style={{ color: 'var(--faint)' }}>—</span>}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
          </>
        )}
      </section>

      {/* Edit customer — same fields as the list-page modal, so Mike can fix
          details without leaving the account. */}
      {editOpen && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => !savingEdit && setEditOpen(false)}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={saveEdit}
            className="bg-charcoal-100 border border-white/[0.08] rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6"
          >
            <h3 className="font-heading text-xl font-bold mb-5" style={{ color: 'var(--ink)' }}>Edit Customer</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--muted)' }}>Business Name</label>
                <input className="input" value={editForm.businessName} onChange={(e) => setEditForm((f) => ({ ...f, businessName: e.target.value }))} required />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--muted)' }}>Contact Name</label>
                <input className="input" value={editForm.contactName} onChange={(e) => setEditForm((f) => ({ ...f, contactName: e.target.value }))} required autoComplete="name" />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--muted)' }}>Email</label>
                <input type="email" className="input" value={editForm.email} onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))} required autoComplete="email" />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--muted)' }}>Phone</label>
                <input type="tel" className="input" value={editForm.phone} onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))} autoComplete="tel" />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--muted)' }}>Street Address</label>
                <input className="input" value={editForm.streetAddress} onChange={(e) => setEditForm((f) => ({ ...f, streetAddress: e.target.value }))} autoComplete="street-address" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_1.5fr_1fr] gap-3">
                <div>
                  <label className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--muted)' }}>City</label>
                  <input className="input" value={editForm.city} onChange={(e) => setEditForm((f) => ({ ...f, city: e.target.value }))} autoComplete="address-level2" />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--muted)' }}>State</label>
                  <select className="input" value={editForm.state} onChange={(e) => setEditForm((f) => ({ ...f, state: e.target.value }))} autoComplete="address-level1">
                    <option value="">Select...</option>
                    {US_STATES.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--muted)' }}>Zip</label>
                  <input className="input" value={editForm.zip} onChange={(e) => setEditForm((f) => ({ ...f, zip: e.target.value }))} autoComplete="postal-code" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--muted)' }}>ABC Permit Number</label>
                  <input className="input font-mono" value={editForm.abcPermitNumber} onChange={(e) => setEditForm((f) => ({ ...f, abcPermitNumber: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--muted)' }}>Payment Method</label>
                  <select className="input" value={editForm.preferredPaymentMethod} onChange={(e) => setEditForm((f) => ({ ...f, preferredPaymentMethod: e.target.value as 'check' | 'fintech' | 'no_preference' }))}>
                    <option value="no_preference">No preference</option>
                    <option value="check">Check</option>
                    <option value="fintech">Fintech</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1.5" style={{ color: 'var(--muted)' }}>
                  Customer Identification <span className="font-normal text-xs">(admin-only)</span>
                </label>
                <input className="input font-mono" value={editForm.customerIdentification} onChange={(e) => setEditForm((f) => ({ ...f, customerIdentification: e.target.value }))} />
              </div>
              {editError && <p className="text-sm" style={{ color: 'var(--ruby)' }}>{editError}</p>}
            </div>
            <div className="flex justify-end gap-3 pt-5">
              <button type="button" onClick={() => setEditOpen(false)} className="btn-secondary px-4 py-2">Cancel</button>
              <button type="submit" disabled={savingEdit} className="btn-primary">{savingEdit ? 'Saving...' : 'Save'}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
