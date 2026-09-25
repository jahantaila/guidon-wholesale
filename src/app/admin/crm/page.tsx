'use client';

import { useState, useEffect, useCallback, useMemo, Fragment } from 'react';
import Link from 'next/link';
import { adminFetch } from '@/lib/admin-fetch';
import { formatPhone, formatDate, formatDay, US_STATES } from '@/lib/utils';
import { breweryLocalDate } from '@/lib/sales-report';
import { followupState, scheduledFollowups } from '@/lib/crm';
import { CRM_ACTIVITY_LABELS, CRM_ACTIVITY_TYPES } from '@/lib/types';
import type { CrmListRow, CrmActivityType, CrmListStatus, CrmStatus } from '@/lib/types';

/**
 * CRM: leads, prospects and customers in one list.
 *
 * Shaped by what the production data actually showed. Of 93 customers, exactly
 * one had a follow-up date (a test account) and none had follow-up notes, two
 * months after those fields shipped. So this page is built on the assumption
 * that Mike will NOT reliably type into it:
 *
 *   - "Recent activity" is derived from orders first, hand-logged touches
 *     second. It maintains itself.
 *   - Quiet accounts need no data entry at all, which is why they lead.
 *   - Logging a call is one click from the row, not a form behind a nav step.
 *     The old design cost six interactions; that is how activity logs die.
 *
 * Per DESIGN.md: prose ledger line, text-link filters, one typographic table.
 * Status is a plain label — colour is reserved for urgency, not for category.
 */

interface QuietAccount {
  id: string;
  businessName: string;
  phone: string;
  lastOrderAt: string;
  daysSince: number;
  orderCount: number;
}

interface Summary {
  rows: CrmListRow[];
  quiet: QuietAccount[];
  quietDays: number;
  counts: { total: number; lead: number; prospect: number; customer: number; followups?: number };
}

type Filter = 'all' | 'lead' | 'prospect' | 'customer' | 'followups';

function daysAgo(iso: string | null): number | null {
  if (!iso) return null;
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
}

function relative(iso: string | null): string {
  const d = daysAgo(iso);
  if (d === null) return 'never';
  if (d === 0) return 'today';
  if (d === 1) return 'yesterday';
  return `${d}d ago`;
}

const STATUS_LABEL: Record<CrmListStatus, string> = {
  lead: 'Lead',
  prospect: 'Prospect',
  customer: 'Customer',
};

export default function CrmPage() {
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [logOpenFor, setLogOpenFor] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [flash, setFlash] = useState('');

  // Per-row log form: activity type + date (defaults today) + optional note.
  // Replaces the old one-click log so Mike can back-date a call he forgot to
  // record and add a note in the same step.
  const [logForm, setLogForm] = useState<{ type: CrmActivityType; date: string; note: string }>({
    type: 'spoke_phone',
    date: new Date().toISOString().slice(0, 10),
    note: '',
  });

  // Convert-to-customer modal (replaces the old window.prompt, which could be
  // blocked in embedded contexts and swallowed errors).
  const [convertFor, setConvertFor] = useState<CrmListRow | null>(null);
  const [convertEmail, setConvertEmail] = useState('');
  const [converting, setConverting] = useState(false);
  const [convertError, setConvertError] = useState('');

  // Edit-contact modal (leads + prospects) + inline delete confirm.
  const [editFor, setEditFor] = useState<CrmListRow | null>(null);
  const [contactForm, setContactForm] = useState({
    businessName: '', contactName: '', email: '', phone: '',
    streetAddress: '', city: '', state: '', zip: '',
    status: 'lead' as CrmStatus, notes: '',
  });
  const [savingContact, setSavingContact] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  // Per-row follow-up form. Writes the same next-follow-up fields as the
  // customer page, so Mike can schedule one without leaving the CRM.
  const [followupOpenFor, setFollowupOpenFor] = useState<string | null>(null);
  const [followupForm, setFollowupForm] = useState({ date: '', notes: '' });
  const [followupError, setFollowupError] = useState('');

  const [addOpen, setAddOpen] = useState(false);
  const [newLead, setNewLead] = useState({ businessName: '', contactName: '', phone: '', email: '' });

  // Compose state. One recipient at a time.
  const [emailTo, setEmailTo] = useState<CrmListRow | null>(null);
  const [draft, setDraft] = useState({ subject: '', body: '' });
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');

  async function sendEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!emailTo) return;
    setSending(true);
    setSendError('');
    try {
      const res = await adminFetch('/api/admin/crm/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subjectId: emailTo.id, ...draft }),
      });
      const b = await res.json().catch(() => null);
      if (!res.ok) {
        setSendError(b?.error || 'Could not send that email.');
        return;
      }
      setFlash(`Email sent to ${emailTo.businessName}. Logged on their history.`);
      setTimeout(() => setFlash(''), 4000);
      setEmailTo(null);
      setDraft({ subject: '', body: '' });
      // Refresh so the send shows up as the account's latest touch.
      await load();
    } catch {
      setSendError('Could not send that email.');
    } finally {
      setSending(false);
    }
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await adminFetch('/api/admin/crm/summary', { cache: 'no-store' });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.error || 'Could not load the CRM.');
        return;
      }
      setData(body);
    } catch {
      setError('Could not load the CRM.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Deep link from the follow-up reminder email: /admin/crm?filter=followups
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('filter') === 'followups') setFilter('followups');
  }, []);

  /** Open the log form for a row, resetting to a today-dated entry. */
  function openLog(rowId: string) {
    setLogForm({ type: 'spoke_phone', date: new Date().toISOString().slice(0, 10), note: '' });
    setFollowupOpenFor(null);
    setLogOpenFor(rowId);
  }

  /** Open the follow-up form for a row, prefilled with what is scheduled. */
  function openFollowup(row: CrmListRow) {
    setFollowupForm({ date: row.nextFollowupDate || '', notes: row.nextFollowupNotes || '' });
    setFollowupError('');
    setLogOpenFor(null);
    setFollowupOpenFor(row.id);
  }

  /** Schedule (date) or clear (null) a row's follow-up. The server reads the
   *  value back and errors if it did not stick; the list is then reloaded so
   *  what Mike sees is what is stored. */
  async function saveFollowup(row: CrmListRow, date: string | null) {
    setBusy(row.id);
    setFollowupError('');
    try {
      const res = await adminFetch('/api/admin/crm/followup', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subjectId: row.id, date, notes: followupForm.notes }),
      });
      const b = await res.json().catch(() => null);
      if (!res.ok) {
        setFollowupError(b?.error || 'The follow-up did not save. Please try again.');
        return;
      }
      setFollowupOpenFor(null);
      setFlash(
        b.nextFollowupDate
          ? `Follow-up saved: ${row.businessName} on ${formatDay(b.nextFollowupDate)}.`
          : `Follow-up cleared for ${row.businessName}.`,
      );
      setTimeout(() => setFlash(''), 4000);
      await load();
    } catch {
      setFollowupError('The follow-up did not save. Please try again.');
    } finally {
      setBusy(null);
    }
  }

  /** Log a touch: activity type + date (defaults today, but back-datable) +
   *  optional note. Optimistic so the row updates where Mike is already
   *  looking, then reloads so derived fields (last touch) settle. */
  async function submitLog(row: CrmListRow) {
    const { type, date, note } = logForm;
    // Anchor the chosen day at local noon so it doesn't slip a day in UTC.
    const occurredAt = new Date(`${date}T12:00:00`).toISOString();
    setBusy(row.id);
    setLogOpenFor(null);
    setData((prev) =>
      prev
        ? {
            ...prev,
            rows: prev.rows.map((r) =>
              r.id === row.id
                ? { ...r, recentActivityAt: occurredAt, recentActivitySource: CRM_ACTIVITY_LABELS[type] }
                : r,
            ),
          }
        : prev,
    );
    try {
      const res = await adminFetch('/api/admin/crm/activities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subjectId: row.id, type, occurredAt, notes: note.trim() }),
      });
      if (!res.ok) {
        setError('Could not log that. Refresh and try again.');
        await load();
      } else {
        setFlash(`${CRM_ACTIVITY_LABELS[type]} logged for ${row.businessName}.`);
        setTimeout(() => setFlash(''), 3000);
        await load();
      }
    } catch {
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function addLead(e: React.FormEvent) {
    e.preventDefault();
    if (!newLead.businessName.trim()) return;
    setBusy('new');
    try {
      const res = await adminFetch('/api/admin/crm/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newLead),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => null);
        setError(b?.error || 'Could not add that lead.');
        return;
      }
      setNewLead({ businessName: '', contactName: '', phone: '', email: '' });
      setAddOpen(false);
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function promote(row: CrmListRow) {
    if (row.status === 'lead') {
      setBusy(row.id);
      try {
        const res = await adminFetch('/api/admin/crm/contacts', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: row.id, status: 'prospect' }),
        });
        if (!res.ok) {
          const b = await res.json().catch(() => null);
          setError(b?.error || 'Could not promote that lead to prospect.');
        }
        await load();
      } finally {
        setBusy(null);
      }
      return;
    }
    // prospect -> customer is a one-way door: it creates a real account, sets
    // up a portal login and emails the welcome. Collect the email in a proper
    // modal (window.prompt could be blocked in the embedded admin and hid
    // server errors).
    setConvertFor(row);
    setConvertEmail(row.email || '');
    setConvertError('');
  }

  /** Runs the prospect -> customer conversion. The server creates the
   *  customer, provisions a portal login (temp password), moves the logged
   *  history and emails the welcome. */
  async function doConvert() {
    // Re-entry guard: the modal's Enter handler and the button can both fire,
    // and a double-submit races two conversions of the same prospect.
    if (!convertFor || converting) return;
    const email = convertEmail.trim();
    if (!email) {
      setConvertError('An email address is required to create the account.');
      return;
    }
    setConverting(true);
    setConvertError('');
    try {
      const res = await adminFetch('/api/admin/crm/contacts/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: convertFor.id, email }),
      });
      const b = await res.json().catch(() => null);
      if (!res.ok) {
        setConvertError(b?.error || 'Could not convert that prospect.');
        return;
      }
      const emailed = b?.welcomeEmailed;
      setFlash(
        `${convertFor.businessName} is now a customer` +
          (emailed ? ' — welcome email sent with their login.' : '.'),
      );
      setTimeout(() => setFlash(''), 5000);
      setConvertFor(null);
      setConvertEmail('');
      await load();
    } catch {
      setConvertError('Could not convert that prospect.');
    } finally {
      setConverting(false);
    }
  }

  /** Open the edit modal for a lead/prospect, prefilling from the row and
   *  fetching its notes (not carried on the list row). */
  async function openEditContact(row: CrmListRow) {
    setContactForm({
      businessName: row.businessName,
      contactName: row.contactName,
      email: row.email,
      phone: row.phone,
      streetAddress: row.streetAddress,
      city: row.city,
      state: row.state,
      zip: row.zip,
      status: (row.status === 'prospect' ? 'prospect' : 'lead'),
      notes: '',
    });
    setEditFor(row);
    try {
      const res = await adminFetch('/api/admin/crm/contacts');
      const all = await res.json();
      const full = Array.isArray(all) ? all.find((c) => c.id === row.id) : null;
      if (full) setContactForm((f) => ({ ...f, notes: full.notes || '', status: full.status || f.status }));
    } catch {
      /* notes prefill is best-effort */
    }
  }

  async function saveContact(e: React.FormEvent) {
    e.preventDefault();
    if (!editFor) return;
    setSavingContact(true);
    try {
      const res = await adminFetch('/api/admin/crm/contacts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editFor.id, ...contactForm }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => null);
        setError(b?.error || 'Could not save that contact.');
        return;
      }
      setFlash(`Saved ${contactForm.businessName || 'contact'}.`);
      setTimeout(() => setFlash(''), 3000);
      setEditFor(null);
      await load();
    } finally {
      setSavingContact(false);
    }
  }

  /** Delete a lead/prospect (and its logged touches). Hard delete — the
   *  server clears the activity history first so the DB's one-subject check
   *  can't reject the delete. */
  async function deleteContact(row: CrmListRow) {
    setBusy(row.id);
    try {
      const res = await adminFetch('/api/admin/crm/contacts', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: row.id }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => null);
        setError(b?.error || 'Could not delete that contact.');
      } else {
        setFlash(`Deleted ${row.businessName}.`);
        setTimeout(() => setFlash(''), 3000);
      }
      setDeleteConfirmId(null);
      await load();
    } finally {
      setBusy(null);
    }
  }

  const rows = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    const matched = data.rows.filter((r) => {
      if (filter === 'followups') {
        if (!r.nextFollowupDate) return false;
      } else if (filter !== 'all' && r.status !== filter) return false;
      if (!q) return true;
      return (
        r.businessName.toLowerCase().includes(q) ||
        r.contactName.toLowerCase().includes(q) ||
        r.phone.includes(q) ||
        r.email.toLowerCase().includes(q) ||
        r.streetAddress.toLowerCase().includes(q) ||
        r.city.toLowerCase().includes(q) ||
        r.state.toLowerCase().includes(q) ||
        r.zip.toLowerCase().includes(q) ||
        (r.nextFollowupNotes || '').toLowerCase().includes(q)
      );
    });
    // The follow-up view reads as an agenda: soonest (and overdue) first.
    return filter === 'followups' ? scheduledFollowups(matched) : matched;
  }, [data, filter, search]);

  // Brewery-local, not UTC: after 8pm Eastern the UTC date is already
  // tomorrow, which would mark tomorrow's follow-ups as due tonight.
  const today = breweryLocalDate(new Date().toISOString());
  const scheduled = data?.rows.filter((r) => r.nextFollowupDate) ?? [];
  const dueFollowups = scheduled.filter((r) => (r.nextFollowupDate as string) <= today);
  const neverTouched = data?.rows.filter((r) => !r.recentActivityAt).length ?? 0;

  const FILTERS: { key: Filter; label: string; count: number }[] = data
    ? [
        { key: 'all', label: 'All', count: data.counts.total },
        { key: 'lead', label: 'Leads', count: data.counts.lead },
        { key: 'prospect', label: 'Prospects', count: data.counts.prospect },
        { key: 'customer', label: 'Customers', count: data.counts.customer },
        { key: 'followups', label: 'Follow-ups', count: scheduled.length },
      ]
    : [];

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-2">
        <div>
          <div className="overline" style={{ color: 'var(--brass)' }}>
            CRM
          </div>
          <h1 className="font-display text-3xl" style={{ color: 'var(--ink)' }}>
            Leads &amp; accounts
          </h1>
        </div>
        <button className="btn-primary" onClick={() => setAddOpen((v) => !v)}>
          {addOpen ? 'Cancel' : 'Add lead'}
        </button>
      </div>

      {/* Leads with what needs doing, not with a headcount. */}
      <div className="ledger-line mb-5">
        {loading ? (
          <span style={{ color: 'var(--muted)' }}>Opening the book…</span>
        ) : error ? (
          <span style={{ color: 'var(--ruby)' }}>{error}</span>
        ) : data ? (
          <>
            {scheduled.length > 0 && (
              <>
                <button
                  onClick={() => setFilter('followups')}
                  className="underline"
                  style={{ color: 'inherit' }}
                  title="Show only accounts with a follow-up scheduled"
                >
                  <span className="ledger-num" style={{ color: dueFollowups.length > 0 ? 'var(--ember)' : undefined }}>
                    {scheduled.length}
                  </span>{' '}
                  follow-up{scheduled.length === 1 ? '' : 's'} scheduled
                  {dueFollowups.length > 0 && `, ${dueFollowups.length} due`}
                </button>
                .{' '}
              </>
            )}
            {data.quiet.length > 0 && (
              <>
                <span className="ledger-num" style={{ color: 'var(--ember)' }}>
                  {data.quiet.length}
                </span>{' '}
                account{data.quiet.length === 1 ? '' : 's'} quiet for {data.quietDays}+ days.{' '}
              </>
            )}
            {neverTouched > 0 && (
              <>
                <span className="ledger-num">{neverTouched}</span> never contacted.{' '}
              </>
            )}
            <span className="font-display italic" style={{ color: 'var(--muted)' }}>
              {data.counts.total} on the book
            </span>{' '}
            — {data.counts.lead} lead{data.counts.lead === 1 ? '' : 's'}, {data.counts.prospect}{' '}
            prospect{data.counts.prospect === 1 ? '' : 's'}, {data.counts.customer} customer
            {data.counts.customer === 1 ? '' : 's'}.
          </>
        ) : null}
      </div>

      {flash && (
        <p className="mb-4 text-sm" style={{ color: 'var(--pine)' }}>
          {flash}
        </p>
      )}

      {addOpen && (
        <form
          onSubmit={addLead}
          className="mb-6 p-4 flex flex-wrap gap-3 items-end"
          style={{ background: 'var(--surface)', border: '1px solid var(--divider)', borderRadius: 4 }}
        >
          <div>
            <label className="label block mb-1">Business name *</label>
            <input
              className="input"
              autoFocus
              value={newLead.businessName}
              onChange={(e) => setNewLead({ ...newLead, businessName: e.target.value })}
              placeholder="The bar you just drove past"
            />
          </div>
          <div>
            <label className="label block mb-1">Contact</label>
            <input
              className="input"
              value={newLead.contactName}
              onChange={(e) => setNewLead({ ...newLead, contactName: e.target.value })}
            />
          </div>
          <div>
            <label className="label block mb-1">Phone</label>
            <input
              className="input"
              value={newLead.phone}
              onChange={(e) => setNewLead({ ...newLead, phone: e.target.value })}
            />
          </div>
          <div>
            <label className="label block mb-1">Email</label>
            <input
              className="input"
              type="email"
              value={newLead.email}
              onChange={(e) => setNewLead({ ...newLead, email: e.target.value })}
            />
          </div>
          <button className="btn-primary" disabled={busy === 'new' || !newLead.businessName.trim()}>
            {busy === 'new' ? 'Saving…' : 'Save lead'}
          </button>
          <p className="w-full text-xs" style={{ color: 'var(--faint)' }}>
            Only the business name is required. Everything else can come later.
          </p>
        </form>
      )}

      {/* Quiet accounts. No data entry involved — this is derived entirely from
          the order book, which is why it is the part most likely to still be
          useful in six months. */}
      {!loading && data && data.quiet.length > 0 && (
        <div className="mb-6 pb-4" style={{ borderBottom: '1px solid var(--divider)' }}>
          <div className="overline mb-2" style={{ color: 'var(--ember)' }}>
            Gone quiet — no order in {data.quietDays}+ days
          </div>
          <ul className="text-sm space-y-1">
            {data.quiet.slice(0, 5).map((q) => (
              <li key={q.id} className="flex flex-wrap items-baseline gap-x-2">
                <Link
                  href={`/admin/customers/${q.id}`}
                  className="font-semibold hover:underline"
                  style={{ color: 'var(--ink)' }}
                >
                  {q.businessName}
                </Link>
                <span style={{ color: 'var(--muted)' }}>
                  last ordered {relative(q.lastOrderAt)} · {q.orderCount} order
                  {q.orderCount === 1 ? '' : 's'} all time
                </span>
                {q.phone && (
                  <a href={`tel:${q.phone}`} style={{ color: 'var(--brass)' }}>
                    {formatPhone(q.phone)}
                  </a>
                )}
              </li>
            ))}
          </ul>
          {data.quiet.length > 5 && (
            <p className="text-xs mt-1" style={{ color: 'var(--faint)' }}>
              and {data.quiet.length - 5} more.
            </p>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mb-3 text-sm">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className="pb-1"
            style={{
              color: filter === f.key ? 'var(--ink)' : 'var(--muted)',
              borderBottom: filter === f.key ? '1px solid var(--brass)' : '1px solid transparent',
              fontWeight: filter === f.key ? 600 : 400,
            }}
          >
            {f.label} ({f.count})
          </button>
        ))}
        <input
          className="input ml-auto"
          style={{ maxWidth: 260 }}
          placeholder="Search name, phone, email, city, zip"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div style={{ borderTop: '1px solid var(--divider)' }}>
        {loading ? (
          <div className="py-6 space-y-2">
            <div className="skeleton h-4 w-2/3" />
            <div className="skeleton h-4 w-1/2" />
            <div className="skeleton h-4 w-3/5" />
          </div>
        ) : rows.length === 0 ? (
          <div className="py-8">
            {data && data.counts.total === 0 ? (
              <>
                <p className="mb-2" style={{ color: 'var(--ink)' }}>
                  Nothing on the book yet.
                </p>
                <p className="text-sm" style={{ color: 'var(--muted)' }}>
                  A <em>lead</em> is a bar you want to sell to but haven&apos;t yet. Add one with
                  just a business name, log a call when you make it, and convert it to a customer
                  when they order.
                </p>
              </>
            ) : (
              <p className="text-sm italic" style={{ color: 'var(--muted)' }}>
                {filter === 'followups' && !search.trim()
                  ? 'No follow-ups scheduled. Use Follow-up on any row to schedule one.'
                  : <>Nothing matches. {filter !== 'all' && 'Try All, or clear the search.'}</>}
              </p>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--divider)' }}>
                  <th className="overline text-left py-2">Business</th>
                  <th className="overline text-left py-2">Contact</th>
                  <th className="overline text-left py-2">Status</th>
                  <th className="overline text-left py-2">Last touch</th>
                  <th className="overline text-left py-2">Last ordered</th>
                  <th className="overline text-left py-2">Next follow-up</th>
                  <th className="overline text-right py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const days = daysAgo(row.recentActivityAt);
                  const cold = days !== null && days >= 45;
                  const fState = followupState(row.nextFollowupDate, today);
                  const panelOpen = logOpenFor === row.id || followupOpenFor === row.id;
                  return (
                    <Fragment key={row.id}>
                    <tr style={{ borderBottom: panelOpen ? 'none' : '1px solid var(--divider)' }}>
                      <td className="table-cell py-2">
                        {row.status === 'customer' ? (
                          <Link
                            href={`/admin/customers/${row.id}`}
                            className="hover:underline"
                            style={{ color: 'var(--ink)' }}
                          >
                            {row.businessName}
                          </Link>
                        ) : (
                          row.businessName
                        )}
                      </td>
                      <td className="table-cell py-2">
                        <div>{row.contactName || <span style={{ color: 'var(--faint)' }}>—</span>}</div>
                        {row.phone && (
                          <a href={`tel:${row.phone}`} className="text-xs" style={{ color: 'var(--brass)' }}>
                            {formatPhone(row.phone)}
                          </a>
                        )}
                      </td>
                      <td className="table-cell py-2" style={{ color: 'var(--muted)' }}>
                        {STATUS_LABEL[row.status]}
                      </td>
                      <td className="table-cell py-2">
                        {row.recentActivityAt ? (
                          <span
                            className="font-variant-tabular"
                            title={relative(row.recentActivityAt)}
                            style={{ color: cold ? 'var(--ember)' : 'var(--ink)' }}
                          >
                            {formatDate(row.recentActivityAt)}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--ember)' }}>never</span>
                        )}
                        {row.recentActivitySource && (
                          <span className="text-xs ml-1" style={{ color: 'var(--muted)' }}>
                            · {row.recentActivitySource}
                          </span>
                        )}
                      </td>
                      <td className="table-cell py-2 font-variant-tabular" style={{ color: row.lastOrderAt ? 'var(--ink)' : 'var(--faint)' }}>
                        {row.lastOrderAt ? formatDate(row.lastOrderAt) : '—'}
                      </td>
                      <td className="table-cell py-2">
                        {row.nextFollowupDate ? (
                          <>
                            <span
                              className="font-variant-tabular"
                              style={{ color: fState === 'upcoming' ? 'var(--ink)' : 'var(--ember)' }}
                            >
                              {formatDay(row.nextFollowupDate)}
                            </span>
                            {fState !== 'upcoming' && (
                              <span className="text-xs ml-1" style={{ color: 'var(--ember)' }}>
                                {fState === 'today' ? 'today' : 'overdue'}
                              </span>
                            )}
                            {row.nextFollowupNotes && (
                              <span className="block text-xs" style={{ color: 'var(--muted)' }}>
                                {row.nextFollowupNotes}
                              </span>
                            )}
                          </>
                        ) : (
                          <span style={{ color: 'var(--faint)' }}>—</span>
                        )}
                      </td>
                      <td className="table-cell py-2 text-right whitespace-nowrap">
                        <span className="flex flex-wrap gap-x-3 gap-y-1 justify-end items-center">
                          <button
                            onClick={() => (logOpenFor === row.id ? setLogOpenFor(null) : openLog(row.id))}
                            disabled={busy === row.id}
                            className="text-sm underline"
                            style={{ color: 'var(--brass)' }}
                          >
                            {logOpenFor === row.id ? 'Close' : 'Log'}
                          </button>
                          <button
                            onClick={() => (followupOpenFor === row.id ? setFollowupOpenFor(null) : openFollowup(row))}
                            disabled={busy === row.id}
                            className="text-sm underline"
                            style={{ color: 'var(--brass)' }}
                          >
                            {followupOpenFor === row.id ? 'Close' : 'Follow-up'}
                          </button>
                          {row.email && (
                            <button
                              onClick={() => {
                                setEmailTo(row);
                                setDraft({ subject: '', body: '' });
                                setSendError('');
                              }}
                              className="text-sm underline"
                              style={{ color: 'var(--brass)' }}
                            >
                              Email
                            </button>
                          )}
                          {row.status !== 'customer' && (
                            <button
                              onClick={() => openEditContact(row)}
                              className="text-sm underline"
                              style={{ color: 'var(--muted)' }}
                            >
                              Edit
                            </button>
                          )}
                          {row.status !== 'customer' && (
                            <button
                              onClick={() => promote(row)}
                              disabled={busy === row.id}
                              className="text-sm underline"
                              style={{ color: 'var(--olive)' }}
                            >
                              {row.status === 'lead' ? '→ Prospect' : 'Convert →'}
                            </button>
                          )}
                          {row.status !== 'customer' &&
                            (deleteConfirmId === row.id ? (
                              <span className="inline-flex gap-2 items-center">
                                <button
                                  onClick={() => deleteContact(row)}
                                  disabled={busy === row.id}
                                  className="text-sm underline"
                                  style={{ color: 'var(--ruby)' }}
                                >
                                  Confirm delete
                                </button>
                                <button
                                  onClick={() => setDeleteConfirmId(null)}
                                  className="text-sm"
                                  style={{ color: 'var(--faint)' }}
                                >
                                  cancel
                                </button>
                              </span>
                            ) : (
                              <button
                                onClick={() => setDeleteConfirmId(row.id)}
                                className="text-sm underline"
                                style={{ color: 'var(--ruby)' }}
                              >
                                Delete
                              </button>
                            ))}
                        </span>
                      </td>
                    </tr>
                    {logOpenFor === row.id && (
                      <tr style={{ borderBottom: '1px solid var(--divider)' }}>
                        <td colSpan={7} className="pb-3">
                          <div
                            className="flex flex-wrap items-end gap-2 p-3"
                            style={{ background: 'var(--surface)', border: '1px solid var(--divider)', borderRadius: 4 }}
                          >
                            <div>
                              <label className="label block mb-1 text-xs">Activity</label>
                              <select
                                className="input"
                                value={logForm.type}
                                onChange={(e) => setLogForm((f) => ({ ...f, type: e.target.value as CrmActivityType }))}
                              >
                                {CRM_ACTIVITY_TYPES.map((t) => (
                                  <option key={t} value={t}>{CRM_ACTIVITY_LABELS[t]}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="label block mb-1 text-xs">Date</label>
                              <input
                                type="date"
                                className="input font-variant-tabular"
                                value={logForm.date}
                                max={today}
                                onChange={(e) => setLogForm((f) => ({ ...f, date: e.target.value }))}
                              />
                            </div>
                            <div className="flex-1 min-w-[200px]">
                              <label className="label block mb-1 text-xs">Note (optional)</label>
                              <input
                                type="text"
                                className="input w-full"
                                placeholder="What happened? e.g. Owner wants a fall seasonal drop-off next week"
                                value={logForm.note}
                                onChange={(e) => setLogForm((f) => ({ ...f, note: e.target.value }))}
                              />
                            </div>
                            <button className="btn-primary" onClick={() => submitLog(row)} disabled={busy === row.id}>
                              {busy === row.id ? 'Saving…' : 'Save log'}
                            </button>
                            <button className="btn-secondary" onClick={() => setLogOpenFor(null)}>
                              Cancel
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                    {followupOpenFor === row.id && (
                      <tr style={{ borderBottom: '1px solid var(--divider)' }}>
                        <td colSpan={7} className="pb-3">
                          <form
                            onSubmit={(e) => {
                              e.preventDefault();
                              if (followupForm.date) saveFollowup(row, followupForm.date);
                            }}
                            className="flex flex-wrap items-end gap-2 p-3"
                            style={{ background: 'var(--surface)', border: '1px solid var(--divider)', borderRadius: 4 }}
                          >
                            <div>
                              <label className="label block mb-1 text-xs">Follow up on</label>
                              <input
                                type="date"
                                required
                                className="input font-variant-tabular"
                                value={followupForm.date}
                                onChange={(e) => setFollowupForm((f) => ({ ...f, date: e.target.value }))}
                              />
                            </div>
                            <div className="flex-1 min-w-[200px]">
                              <label className="label block mb-1 text-xs">Note (optional)</label>
                              <input
                                type="text"
                                className="input w-full"
                                maxLength={2000}
                                placeholder="e.g. Call and ask for Marshall"
                                value={followupForm.notes}
                                onChange={(e) => setFollowupForm((f) => ({ ...f, notes: e.target.value }))}
                              />
                            </div>
                            <button className="btn-primary" disabled={busy === row.id || !followupForm.date}>
                              {busy === row.id ? 'Saving…' : 'Save follow-up'}
                            </button>
                            {row.nextFollowupDate && (
                              <button
                                type="button"
                                className="btn-secondary"
                                disabled={busy === row.id}
                                onClick={() => saveFollowup(row, null)}
                              >
                                Clear
                              </button>
                            )}
                            <button type="button" className="btn-secondary" onClick={() => setFollowupOpenFor(null)}>
                              Cancel
                            </button>
                            {followupError && (
                              <p className="w-full text-sm" style={{ color: 'var(--ruby)' }}>{followupError}</p>
                            )}
                          </form>
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

      {/* Compose. One recipient, plain text, sent from the brewery's address
          with replies going to sales@guidonbrewing.com. Sending logs itself on
          the account, so the history stays current without anyone typing. */}
      {emailTo && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-6"
          style={{ background: 'rgba(42, 36, 22, 0.45)' }}
          onClick={() => !sending && setEmailTo(null)}
        >
          <form
            onSubmit={sendEmail}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xl mt-12 p-6"
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--divider)',
              borderRadius: 4,
              boxShadow: 'var(--shadow-sm)',
            }}
          >
            <div className="overline mb-1" style={{ color: 'var(--brass)' }}>
              Email
            </div>
            <h2 className="font-display text-2xl mb-1" style={{ color: 'var(--ink)' }}>
              {emailTo.businessName}
            </h2>
            <p className="text-xs mb-4" style={{ color: 'var(--muted)' }}>
              To {emailTo.email} · replies come back to sales@guidonbrewing.com
            </p>

            <label className="label block mb-1">Subject</label>
            <input
              className="input w-full mb-3"
              autoFocus
              maxLength={200}
              value={draft.subject}
              onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
              placeholder="Fall seasonal is ready"
            />

            <label className="label block mb-1">Message</label>
            <textarea
              className="input w-full mb-1"
              rows={9}
              maxLength={20000}
              value={draft.body}
              onChange={(e) => setDraft({ ...draft, body: e.target.value })}
              placeholder={`Hi ${emailTo.contactName || 'there'},\n\n`}
            />
            <p className="text-xs mb-4" style={{ color: 'var(--faint)' }}>
              Plain text. It gets wrapped in the Guidon letterhead automatically.
            </p>

            {sendError && (
              <p className="text-sm mb-3" style={{ color: 'var(--ruby)' }}>
                {sendError}
              </p>
            )}

            <div className="flex items-center gap-3">
              <button
                className="btn-primary"
                disabled={sending || !draft.subject.trim() || !draft.body.trim()}
              >
                {sending ? 'Sending…' : 'Send email'}
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setEmailTo(null)}
                disabled={sending}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Convert prospect → customer. Collects the email, then the server
          creates the account, provisions a portal login and emails the
          welcome. Replaces the old window.prompt. */}
      {convertFor && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-6"
          style={{ background: 'rgba(42, 36, 22, 0.45)' }}
          onClick={() => !converting && setConvertFor(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md mt-16 p-6"
            style={{ background: 'var(--surface)', border: '1px solid var(--divider)', borderRadius: 4, boxShadow: 'var(--shadow-sm)' }}
          >
            <div className="overline mb-1" style={{ color: 'var(--brass)' }}>Convert to customer</div>
            <h2 className="font-display text-2xl mb-1" style={{ color: 'var(--ink)' }}>{convertFor.businessName}</h2>
            <p className="text-sm mb-4" style={{ color: 'var(--muted)' }}>
              Creates a customer account, sets up a portal login (temporary password{' '}
              <strong style={{ color: 'var(--ink)' }}>guidon</strong>, changed on first sign-in), moves this
              prospect&rsquo;s logged history across, and emails them a welcome with their login. This
              can&rsquo;t be undone.
            </p>
            <label className="label block mb-1">Account email</label>
            <input
              className="input w-full mb-1"
              type="email"
              autoFocus
              value={convertEmail}
              onChange={(e) => setConvertEmail(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') doConvert(); }}
              placeholder="owner@thebar.com"
            />
            <p className="text-xs mb-4" style={{ color: 'var(--faint)' }}>The welcome email is sent here.</p>
            {convertError && <p className="text-sm mb-3" style={{ color: 'var(--ruby)' }}>{convertError}</p>}
            <div className="flex items-center gap-3">
              <button className="btn-primary" onClick={doConvert} disabled={converting || !convertEmail.trim()}>
                {converting ? 'Converting…' : 'Convert + email login'}
              </button>
              <button className="btn-secondary" onClick={() => setConvertFor(null)} disabled={converting}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit a lead / prospect inline — no more round-trip to the Customers
          page just to fix a phone number. */}
      {editFor && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-6"
          style={{ background: 'rgba(42, 36, 22, 0.45)' }}
          onClick={() => !savingContact && setEditFor(null)}
        >
          <form
            onSubmit={saveContact}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg mt-12 p-6"
            style={{ background: 'var(--surface)', border: '1px solid var(--divider)', borderRadius: 4, boxShadow: 'var(--shadow-sm)' }}
          >
            <div className="overline mb-1" style={{ color: 'var(--brass)' }}>
              Edit {editFor.status === 'prospect' ? 'prospect' : 'lead'}
            </div>
            <h2 className="font-display text-2xl mb-4" style={{ color: 'var(--ink)' }}>
              {contactForm.businessName || editFor.businessName}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="label block mb-1">Business name</label>
                <input className="input w-full" value={contactForm.businessName} onChange={(e) => setContactForm((f) => ({ ...f, businessName: e.target.value }))} required />
              </div>
              <div>
                <label className="label block mb-1">Contact</label>
                <input className="input w-full" value={contactForm.contactName} onChange={(e) => setContactForm((f) => ({ ...f, contactName: e.target.value }))} />
              </div>
              <div>
                <label className="label block mb-1">Phone</label>
                <input className="input w-full" value={contactForm.phone} onChange={(e) => setContactForm((f) => ({ ...f, phone: e.target.value }))} />
              </div>
              <div className="sm:col-span-2">
                <label className="label block mb-1">Email</label>
                <input className="input w-full" type="email" value={contactForm.email} onChange={(e) => setContactForm((f) => ({ ...f, email: e.target.value }))} />
              </div>
              <div className="sm:col-span-2">
                <label className="label block mb-1">Street address</label>
                <input className="input w-full" value={contactForm.streetAddress} onChange={(e) => setContactForm((f) => ({ ...f, streetAddress: e.target.value }))} />
              </div>
              <div>
                <label className="label block mb-1">City</label>
                <input className="input w-full" value={contactForm.city} onChange={(e) => setContactForm((f) => ({ ...f, city: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="label block mb-1">State</label>
                  <select className="input w-full" value={contactForm.state} onChange={(e) => setContactForm((f) => ({ ...f, state: e.target.value }))}>
                    <option value="">—</option>
                    {US_STATES.map((s) => <option key={s.code} value={s.code}>{s.code}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label block mb-1">Zip</label>
                  <input className="input w-full" value={contactForm.zip} onChange={(e) => setContactForm((f) => ({ ...f, zip: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="label block mb-1">Stage</label>
                <select className="input w-full" value={contactForm.status} onChange={(e) => setContactForm((f) => ({ ...f, status: e.target.value as CrmStatus }))}>
                  <option value="lead">Lead</option>
                  <option value="prospect">Prospect</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="label block mb-1">Notes</label>
                <textarea className="input w-full" rows={3} value={contactForm.notes} onChange={(e) => setContactForm((f) => ({ ...f, notes: e.target.value }))} />
              </div>
            </div>
            <div className="flex items-center gap-3 mt-4">
              <button className="btn-primary" disabled={savingContact || !contactForm.businessName.trim()}>
                {savingContact ? 'Saving…' : 'Save changes'}
              </button>
              <button type="button" className="btn-secondary" onClick={() => setEditFor(null)} disabled={savingContact}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <p className="mt-4 text-xs" style={{ color: 'var(--faint)' }}>
        &quot;Last touch&quot; is whichever is more recent: an order they placed, an email you sent
        from here, or a call you logged. Orders count automatically, so customers stay current without you typing anything.{' '}
        <Link href="/admin/customers" className="underline">
          Customers
        </Link>{' '}
        remains the place for orders, invoices and billing.
      </p>
    </div>
  );
}
