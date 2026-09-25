'use client';

import { useState, useEffect, useCallback } from 'react';
import { adminFetch } from '@/lib/admin-fetch';
import { formatDate, formatDay as day } from '@/lib/utils';
import type { OrderReportingDateChange } from '@/lib/types';

/** One place for the copy. Mike chose "Order date" (Sept 2026); it sits
 *  next to the fixed "Placed" date. */
export const REPORTING_DATE_LABEL = 'Order date';

interface State {
  placedDate: string;
  reportingDate: string | null;
  history: OrderReportingDateChange[];
}

/**
 * Which day — and so which month — an order counts toward in the sales
 * report. For orders entered after month-end that belong to last month. The
 * placed date is shown alongside and never changes; every change here is
 * kept in the history underneath.
 */
export default function ReportingDateControl({
  orderId,
  onChange,
}: {
  orderId: string;
  onChange?: (reportingDate: string | null) => void;
}) {
  const [state, setState] = useState<State | null>(null);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await adminFetch(`/api/admin/orders/reporting-date?orderId=${encodeURIComponent(orderId)}`);
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.error || 'Could not load the order date.');
        return;
      }
      setState(body);
      setDraft(body.reportingDate || body.placedDate);
    } catch {
      setError('Could not load the order date.');
    }
  }, [orderId]);

  useEffect(() => {
    load();
  }, [load]);

  async function save(next: string | null) {
    setSaving(true);
    setError('');
    setSaved('');
    try {
      const res = await adminFetch('/api/admin/orders/reporting-date', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, reportingDate: next }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.error || 'Could not save the order date.');
        return;
      }
      setState(body);
      setDraft(body.reportingDate || body.placedDate);
      setSaved(
        body.reportingDate
          ? `Saved. This order now counts in reports on ${day(body.reportingDate)}.`
          : 'Saved. This order counts on the day it was placed.',
      );
      onChange?.(body.reportingDate);
    } catch {
      setError('Could not save the order date.');
    } finally {
      setSaving(false);
    }
  }

  if (!state) {
    return error ? (
      <p className="text-sm" style={{ color: 'var(--ruby)' }}>{error}</p>
    ) : null;
  }

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const effective = state.reportingDate || state.placedDate;
  const dirty = draft !== effective;

  return (
    <section
      id="reporting-date"
      className="p-4"
      style={{ background: 'var(--surface)', border: '1px solid var(--divider)', borderRadius: 4 }}
    >
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="reporting-date-input" className="section-label block mb-1">
            {REPORTING_DATE_LABEL}
          </label>
          <input
            id="reporting-date-input"
            type="date"
            className="input font-variant-tabular"
            value={draft}
            max={today}
            onChange={(e) => {
              setDraft(e.target.value);
              setSaved('');
            }}
          />
        </div>
        <button className="btn-primary" onClick={() => save(draft || null)} disabled={saving || !dirty || !draft}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        {state.reportingDate && (
          <button className="btn-secondary" onClick={() => save(null)} disabled={saving}>
            Use placed date
          </button>
        )}
      </div>
      <p className="text-xs mt-2" style={{ color: 'var(--muted)' }}>
        Placed {day(state.placedDate)} — that never changes.{' '}
        {state.reportingDate ? (
          <strong style={{ color: 'var(--ember)' }}>
            Counts in the sales report on {day(state.reportingDate)}.
          </strong>
        ) : (
          'Counts in the sales report on the day it was placed.'
        )}{' '}
        Entering last month&rsquo;s order late? Set this to a day in that month.
      </p>
      {dirty && !saving && (
        <p className="text-xs mt-1" style={{ color: 'var(--ember)' }}>Not saved yet.</p>
      )}
      {saved && <p className="text-sm mt-2" style={{ color: 'var(--pine)' }}>{saved}</p>}
      {error && <p className="text-sm mt-2" style={{ color: 'var(--ruby)' }}>{error}</p>}
      {state.history.length > 0 && (
        <ul className="text-xs mt-3 space-y-0.5" style={{ color: 'var(--faint)' }}>
          {state.history.map((h) => (
            <li key={h.id}>
              {formatDate(h.changedAt)}: changed from{' '}
              {h.previousDate ? day(h.previousDate) : 'placed date'} to{' '}
              {h.newDate ? day(h.newDate) : 'placed date'}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
