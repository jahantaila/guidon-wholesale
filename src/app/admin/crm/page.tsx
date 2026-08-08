'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { adminFetch } from '@/lib/admin-fetch';
import { formatPhone } from '@/lib/utils';
import { CRM_ACTIVITY_LABELS, CRM_ACTIVITY_TYPES } from '@/lib/types';
import type { CrmListRow, CrmActivityType, CrmListStatus } from '@/lib/types';

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
  counts: { total: number; lead: number; prospect: number; customer: number };
}

type Filter = 'all' | 'lead' | 'prospect' | 'customer';

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

  /** One click = one logged touch. Optimistic, so the row updates where Mike
   *  is already looking instead of behind a toast. */
  async function logActivity(row: CrmListRow, type: CrmActivityType) {
    setBusy(row.id);
    setLogOpenFor(null);
    const now = new Date().toISOString();
    setData((prev) =>
      prev
        ? {
            ...prev,
            rows: prev.rows.map((r) =>
              r.id === row.id
                ? { ...r, recentActivityAt: now, recentActivitySource: CRM_ACTIVITY_LABELS[type] }
                : r,
            ),
          }
        : prev,
    );
    try {
      const res = await adminFetch('/api/admin/crm/activities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subjectId: row.id, type }),
      });
      if (!res.ok) {
        setError('Could not log that. Refresh and try again.');
        await load();
      } else {
        setFlash(`${CRM_ACTIVITY_LABELS[type]} logged for ${row.businessName}.`);
        setTimeout(() => setFlash(''), 3000);
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
      await adminFetch('/api/admin/crm/contacts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: row.id, status: 'prospect' }),
      });
      await load();
      setBusy(null);
      return;
    }
    // prospect -> customer is a one-way door: it creates a real account and
    // moves the history. Confirm, and say what actually happens.
    const email = window.prompt(
      `Convert ${row.businessName} to a customer?\n\n` +
        `This creates a customer account and moves their logged history across.\n` +
        `It does NOT give them a portal login — that is still a separate step.\n\n` +
        `Email for the account:`,
      row.email || '',
    );
    if (email === null) return;
    setBusy(row.id);
    try {
      const res = await adminFetch('/api/admin/crm/contacts/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: row.id, email }),
      });
      const b = await res.json().catch(() => null);
      if (!res.ok) {
        setError(b?.error || 'Could not convert that lead.');
      } else {
        setFlash(`${row.businessName} is now a customer.`);
        setTimeout(() => setFlash(''), 4000);
      }
      await load();
    } finally {
      setBusy(null);
    }
  }

  const rows = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    return data.rows.filter((r) => {
      if (filter !== 'all' && r.status !== filter) return false;
      if (!q) return true;
      return (
        r.businessName.toLowerCase().includes(q) ||
        r.contactName.toLowerCase().includes(q) ||
        r.phone.includes(q) ||
        r.email.toLowerCase().includes(q)
      );
    });
  }, [data, filter, search]);

  const today = new Date().toISOString().slice(0, 10);
  const dueFollowups = data?.rows.filter((r) => r.nextFollowupDate && r.nextFollowupDate <= today) ?? [];
  const neverTouched = data?.rows.filter((r) => !r.recentActivityAt).length ?? 0;

  const FILTERS: { key: Filter; label: string; count: number }[] = data
    ? [
        { key: 'all', label: 'All', count: data.counts.total },
        { key: 'lead', label: 'Leads', count: data.counts.lead },
        { key: 'prospect', label: 'Prospects', count: data.counts.prospect },
        { key: 'customer', label: 'Customers', count: data.counts.customer },
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
            {dueFollowups.length > 0 && (
              <>
                <span className="ledger-num" style={{ color: 'var(--ember)' }}>
                  {dueFollowups.length}
                </span>{' '}
                follow-up{dueFollowups.length === 1 ? '' : 's'} due.{' '}
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
          placeholder="Search name, phone, email"
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
                Nothing matches. {filter !== 'all' && 'Try All, or clear the search.'}
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
                  <th className="overline text-right py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const days = daysAgo(row.recentActivityAt);
                  const cold = days !== null && days >= 45;
                  const due = row.nextFollowupDate && row.nextFollowupDate <= today;
                  return (
                    <tr key={row.id} style={{ borderBottom: '1px solid var(--divider)' }}>
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
                        {due && (
                          <span className="ml-2 text-xs" style={{ color: 'var(--ember)' }}>
                            follow-up due
                          </span>
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
                        <span
                          title={row.recentActivityAt || 'no recorded contact'}
                          style={{ color: cold || days === null ? 'var(--ember)' : 'var(--ink)' }}
                        >
                          {relative(row.recentActivityAt)}
                        </span>
                        {row.recentActivitySource && (
                          <span className="text-xs ml-1" style={{ color: 'var(--muted)' }}>
                            · {row.recentActivitySource}
                          </span>
                        )}
                      </td>
                      <td className="table-cell py-2 text-right whitespace-nowrap">
                        {logOpenFor === row.id ? (
                          <span className="flex flex-wrap gap-2 justify-end">
                            {CRM_ACTIVITY_TYPES.map((t) => (
                              <button
                                key={t}
                                onClick={() => logActivity(row, t)}
                                className="text-xs underline"
                                style={{ color: 'var(--brass)' }}
                              >
                                {CRM_ACTIVITY_LABELS[t]}
                              </button>
                            ))}
                            <button
                              onClick={() => setLogOpenFor(null)}
                              className="text-xs"
                              style={{ color: 'var(--faint)' }}
                            >
                              cancel
                            </button>
                          </span>
                        ) : (
                          <span className="flex gap-3 justify-end">
                            <button
                              onClick={() => setLogOpenFor(row.id)}
                              disabled={busy === row.id}
                              className="text-sm underline"
                              style={{ color: 'var(--brass)' }}
                            >
                              Log
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
                                onClick={() => promote(row)}
                                disabled={busy === row.id}
                                className="text-sm underline"
                                style={{ color: 'var(--olive)' }}
                              >
                                {row.status === 'lead' ? '→ Prospect' : 'Convert →'}
                              </button>
                            )}
                          </span>
                        )}
                      </td>
                    </tr>
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
