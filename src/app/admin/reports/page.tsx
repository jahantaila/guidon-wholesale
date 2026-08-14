'use client';

import { useState, useEffect, useCallback } from 'react';
import { adminFetch } from '@/lib/admin-fetch';
import { formatCurrency } from '@/lib/utils';

/**
 * Sales by beer style and package type over a date range.
 *
 * "How much Kolsch in cans did we move last month" is the question this
 * answers. Per DESIGN.md this is a typographic ledger, not a dashboard: a
 * prose summary line, text-link filters, and one table. No stat cards.
 */

interface ReportRow {
  style: string;
  packageType: string;
  customer?: string;
  quantity: number;
  gallons: number;
  revenue: number;
  orderCount: number;
}

interface Report {
  rows: ReportRow[];
  totalQuantity: number;
  totalGallons: number;
  totalRevenue: number;
  orderCount: number;
  from: string | null;
  to: string | null;
  includeCustomer: boolean;
  includeCancelled: boolean;
}

/** US beer barrel = 31 US gallons. Barrels shown = gallons / 31. */
const GALLONS_PER_BARREL = 31;

/** Local calendar date (not UTC) so "today" matches the brewery's day. */
function localDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

type PresetKey = 'this_month' | 'last_month' | 'last_90' | 'ytd' | 'all';

function presetRange(key: PresetKey): { from: string; to: string } {
  const now = new Date();
  const today = localDate(now);
  switch (key) {
    case 'this_month':
      return { from: localDate(new Date(now.getFullYear(), now.getMonth(), 1)), to: today };
    case 'last_month': {
      const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const last = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from: localDate(first), to: localDate(last) };
    }
    case 'last_90': {
      const start = new Date(now);
      start.setDate(start.getDate() - 89);
      return { from: localDate(start), to: today };
    }
    case 'ytd':
      return { from: localDate(new Date(now.getFullYear(), 0, 1)), to: today };
    case 'all':
    default:
      return { from: '', to: '' };
  }
}

const PRESETS: { key: PresetKey; label: string }[] = [
  { key: 'this_month', label: 'This month' },
  { key: 'last_month', label: 'Last month' },
  { key: 'last_90', label: 'Last 90 days' },
  { key: 'ytd', label: 'Year to date' },
  { key: 'all', label: 'All time' },
];

export default function ReportsPage() {
  const initial = presetRange('this_month');
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [preset, setPreset] = useState<PresetKey>('this_month');
  const [includeCustomer, setIncludeCustomer] = useState(false);
  const [includeCancelled, setIncludeCancelled] = useState(false);

  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const query = useCallback(() => {
    const p = new URLSearchParams();
    if (from) p.set('from', from);
    if (to) p.set('to', to);
    if (includeCustomer) p.set('includeCustomer', 'true');
    if (includeCancelled) p.set('includeCancelled', 'true');
    return p.toString();
  }, [from, to, includeCustomer, includeCancelled]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    adminFetch(`/api/admin/reports/sales?${query()}`, { cache: 'no-store' })
      .then(async (r) => {
        const data = await r.json().catch(() => null);
        if (cancelled) return;
        if (!r.ok) {
          setError(data?.error || 'Could not load the report.');
          setReport(null);
          return;
        }
        setReport(data);
      })
      .catch(() => {
        if (!cancelled) setError('Could not load the report.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [query]);

  function applyPreset(key: PresetKey) {
    const r = presetRange(key);
    setPreset(key);
    setFrom(r.from);
    setTo(r.to);
  }

  // The CSV route is a plain GET, so a normal navigation would drop the
  // Authorization header that iframe-context admins rely on. Fetch it with
  // adminFetch and save the blob instead.
  const [downloading, setDownloading] = useState(false);
  async function downloadCsv() {
    setDownloading(true);
    try {
      const res = await adminFetch(`/api/admin/reports/sales?${query()}&format=csv`);
      if (!res.ok) {
        setError('Download failed.');
        return;
      }
      const blob = await res.blob();
      const disposition = res.headers.get('Content-Disposition') || '';
      const match = disposition.match(/filename="?([^"]+)"?/);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = match?.[1] || 'guidon-sales.csv';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError('Download failed.');
    } finally {
      setDownloading(false);
    }
  }

  const hasRows = !!report && report.rows.length > 0;
  const rangeLabel =
    report?.from || report?.to
      ? `${report?.from || 'the beginning'} to ${report?.to || 'today'}`
      : 'all time';

  return (
    <div>
      <div className="mb-2">
        <div className="overline" style={{ color: 'var(--brass)' }}>
          Reports
        </div>
        <h1 className="font-display text-3xl" style={{ color: 'var(--ink)' }}>
          Sales by style &amp; package
        </h1>
      </div>

      {/* Ledger line, not stat cards. DESIGN.md is explicit about this. */}
      <div className="ledger-line mb-6">
        {loading ? (
          <span style={{ color: 'var(--muted)' }}>Adding up the order book…</span>
        ) : error ? (
          <span style={{ color: 'var(--ruby)' }}>{error}</span>
        ) : hasRows ? (
          <>
            <span className="font-display italic mr-2" style={{ color: 'var(--muted)' }}>
              {rangeLabel},
            </span>
            <span className="ledger-num">{report!.totalQuantity}</span> units across{' '}
            <span className="ledger-num">{report!.rows.length}</span>{' '}
            {report!.includeCustomer ? 'style/package/customer' : 'style/package'}{' '}
            combination{report!.rows.length === 1 ? '' : 's'}, from{' '}
            <span className="ledger-num">{report!.orderCount}</span> order
            {report!.orderCount === 1 ? '' : 's'}.
            {report!.totalGallons > 0 && (
              <>
                {' '}
                <span className="ledger-num">{report!.totalGallons.toFixed(0)}</span> gallons (
                <span className="ledger-num">{(report!.totalGallons / GALLONS_PER_BARREL).toFixed(1)}</span> bbl).
              </>
            )}{' '}
            Beer revenue{' '}
            <span className="ledger-num">{formatCurrency(report!.totalRevenue)}</span>.
            {report!.includeCancelled && ' Cancelled orders included.'}
          </>
        ) : (
          <span style={{ color: 'var(--muted)' }}>
            No orders in {rangeLabel}. Try a wider date range.
          </span>
        )}
      </div>

      {/* Filters: left-aligned text links with a brass hairline on the active
          one, per DESIGN.md's document-table-of-contents pattern. */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mb-4 text-sm">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            onClick={() => applyPreset(p.key)}
            className="pb-1 transition-colors"
            style={{
              color: preset === p.key ? 'var(--ink)' : 'var(--muted)',
              borderBottom:
                preset === p.key ? '1px solid var(--brass)' : '1px solid transparent',
              fontWeight: preset === p.key ? 600 : 400,
            }}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-4 mb-6">
        <div>
          <label className="label block mb-1" htmlFor="from">
            From
          </label>
          <input
            id="from"
            type="date"
            className="input"
            value={from}
            max={to || undefined}
            onChange={(e) => {
              setFrom(e.target.value);
              setPreset('all');
            }}
          />
        </div>
        <div>
          <label className="label block mb-1" htmlFor="to">
            To
          </label>
          <input
            id="to"
            type="date"
            className="input"
            value={to}
            min={from || undefined}
            onChange={(e) => {
              setTo(e.target.value);
              setPreset('all');
            }}
          />
        </div>

        <label className="flex items-center gap-2 text-sm pb-2" style={{ color: 'var(--ink)' }}>
          <input
            type="checkbox"
            checked={includeCustomer}
            onChange={(e) => setIncludeCustomer(e.target.checked)}
          />
          Break out by customer
        </label>

        <label className="flex items-center gap-2 text-sm pb-2" style={{ color: 'var(--ink)' }}>
          <input
            type="checkbox"
            checked={includeCancelled}
            onChange={(e) => setIncludeCancelled(e.target.checked)}
          />
          Include cancelled orders
        </label>

        <button
          onClick={downloadCsv}
          disabled={downloading || loading || !hasRows}
          className="btn-secondary ml-auto"
        >
          {downloading ? 'Preparing…' : 'Download CSV'}
        </button>
      </div>

      <div style={{ borderTop: '1px solid var(--divider)' }}>
        {loading ? (
          <div className="py-6 space-y-2">
            <div className="skeleton h-4 w-2/3" />
            <div className="skeleton h-4 w-1/2" />
            <div className="skeleton h-4 w-3/5" />
          </div>
        ) : !hasRows ? (
          <p className="py-6 text-sm italic" style={{ color: 'var(--muted)' }}>
            {error ? 'Nothing to show.' : 'No orders in this period.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full" style={{ borderRadius: 0 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--divider)' }}>
                  <th className="overline text-left py-2">Beer style</th>
                  <th className="overline text-left py-2">Package</th>
                  {report!.includeCustomer && (
                    <th className="overline text-left py-2">Customer</th>
                  )}
                  <th className="overline text-right py-2">Qty</th>
                  <th className="overline text-right py-2">Gallons</th>
                  <th className="overline text-right py-2">Barrels</th>
                  <th className="overline text-right py-2">Revenue</th>
                  <th className="overline text-right py-2">Orders</th>
                </tr>
              </thead>
              <tbody>
                {report!.rows.map((row, i) => (
                  <tr
                    key={`${row.style}|${row.packageType}|${row.customer || ''}|${i}`}
                    style={{ borderBottom: '1px solid var(--divider)' }}
                  >
                    <td className="table-cell py-2">{row.style}</td>
                    <td className="table-cell py-2">{row.packageType}</td>
                    {report!.includeCustomer && (
                      <td className="table-cell py-2">{row.customer}</td>
                    )}
                    <td className="table-cell py-2 text-right font-semibold">{row.quantity}</td>
                    <td className="table-cell py-2 text-right font-variant-tabular">{row.gallons.toFixed(1)}</td>
                    <td className="table-cell py-2 text-right font-variant-tabular">{(row.gallons / GALLONS_PER_BARREL).toFixed(2)}</td>
                    <td className="table-cell py-2 text-right">{formatCurrency(row.revenue)}</td>
                    <td className="table-cell py-2 text-right" style={{ color: 'var(--muted)' }}>
                      {row.orderCount}
                    </td>
                  </tr>
                ))}
                <tr style={{ borderTop: '2px solid var(--divider)' }}>
                  <td className="table-cell py-2 font-semibold">Total</td>
                  <td className="table-cell py-2" />
                  {report!.includeCustomer && <td className="table-cell py-2" />}
                  <td className="table-cell py-2 text-right font-semibold">
                    {report!.totalQuantity}
                  </td>
                  <td className="table-cell py-2 text-right font-semibold font-variant-tabular">
                    {report!.totalGallons.toFixed(1)}
                  </td>
                  <td className="table-cell py-2 text-right font-semibold font-variant-tabular">
                    {(report!.totalGallons / GALLONS_PER_BARREL).toFixed(2)}
                  </td>
                  <td className="table-cell py-2 text-right font-semibold">
                    {formatCurrency(report!.totalRevenue)}
                  </td>
                  <td className="table-cell py-2 text-right" style={{ color: 'var(--muted)' }}>
                    {report!.orderCount}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="mt-4 text-xs" style={{ color: 'var(--faint)' }}>
        Counted by the date the order was placed, in brewery local time. Revenue excludes
        keg deposits, which are refundable. Cancelled orders are excluded unless you tick
        the box above.
      </p>
    </div>
  );
}
