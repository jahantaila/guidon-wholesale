'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import type { Order, Product, KegSize, BrewSchedule } from '@/lib/types';
import { formatDate } from '@/lib/utils';
import { adminFetch } from '@/lib/admin-fetch';
import { buildBrewScheduleFilter, filterBrewsByRange, brewScheduleQuickFilters, type BrewQuickFilter } from '@/lib/brew-schedule-filter';
import { renderBrewSchedulePrintHtml } from '@/lib/brew-schedule-pdf';

type RowKey = `${string}::${string}`;

type ProductionRow = {
  productId: string;
  productName: string;
  size: KegSize;
  committed: number; // sum of open order quantities
  inventory: number; // on-hand for this size
  deficit: number; // committed - inventory (positive = need to brew)
  earliestDelivery: string | null;
  nextBrewDate: string | null; // earliest scheduled brewDate for this product+size
  nextBrewYield: number; // yield of that scheduled brew
};

const SIZE_LABELS: Record<string, string> = {
  '1/2bbl': '1/2 Barrel',
  '1/4bbl': '1/4 Barrel',
  '1/6bbl': '1/6 Barrel',
};

const LEGACY_SIZE_ORDER: KegSize[] = ['1/2bbl', '1/4bbl', '1/6bbl'];

function sizeLabel(size: string): string {
  return SIZE_LABELS[size] || size;
}

export default function ProductionPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [brews, setBrews] = useState<BrewSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');

  const reloadBrews = useCallback(async () => {
    try {
      const r = await adminFetch('/api/admin/brew-schedule', { cache: 'no-store' });
      const data = await r.json();
      setBrews(Array.isArray(data) ? data : []);
    } catch { /* ignore */ }
  }, []);

  const reloadAll = useCallback(async () => {
    try {
      const [o, p, b] = await Promise.all([
        adminFetch('/api/orders', { cache: 'no-store' }).then((r) => r.json()),
        adminFetch('/api/products?all=true', { cache: 'no-store' }).then((r) => r.json()),
        adminFetch('/api/admin/brew-schedule', { cache: 'no-store' }).then((r) => r.json()),
      ]);
      setOrders(Array.isArray(o) ? o : []);
      setProducts(Array.isArray(p) ? p : []);
      setBrews(Array.isArray(b) ? b : []);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { reloadAll(); }, [reloadAll]);

  // earliest uncompleted brewDate per product+size
  const nextBrewByKey = useMemo(() => {
    const m = new Map<RowKey, BrewSchedule>();
    for (const b of brews) {
      if (b.completedAt) continue;
      const k: RowKey = `${b.productId}::${b.size}`;
      const existing = m.get(k);
      if (!existing || b.brewDate < existing.brewDate) m.set(k, b);
    }
    return m;
  }, [brews]);

  const rows = useMemo<ProductionRow[]>(() => {
    const openOrders = orders.filter(
      (o) => o.status === 'pending' || o.status === 'confirmed',
    );

    const acc = new Map<RowKey, ProductionRow>();

    for (const product of products) {
      for (const size of product.sizes) {
        const key: RowKey = `${product.id}::${size.size}`;
        const nextBrew = nextBrewByKey.get(key);
        acc.set(key, {
          productId: product.id,
          productName: product.name,
          size: size.size,
          committed: 0,
          inventory: size.inventoryCount ?? 0,
          deficit: 0,
          earliestDelivery: null,
          nextBrewDate: nextBrew?.brewDate ?? null,
          nextBrewYield: nextBrew?.expectedYield ?? 0,
        });
      }
    }

    for (const order of openOrders) {
      for (const item of order.items) {
        const key: RowKey = `${item.productId}::${item.size}`;
        let row = acc.get(key);
        if (!row) {
          const nextBrew = nextBrewByKey.get(key);
          row = {
            productId: item.productId,
            productName: item.productName,
            size: item.size,
            committed: 0,
            inventory: 0,
            deficit: 0,
            earliestDelivery: null,
            nextBrewDate: nextBrew?.brewDate ?? null,
            nextBrewYield: nextBrew?.expectedYield ?? 0,
          };
          acc.set(key, row);
        }
        row.committed += item.quantity;
        if (
          !row.earliestDelivery ||
          (order.deliveryDate && order.deliveryDate < row.earliestDelivery)
        ) {
          row.earliestDelivery = order.deliveryDate;
        }
      }
    }

    return Array.from(acc.values())
      .map((r) => ({ ...r, deficit: Math.max(0, r.committed - r.inventory) }))
      .filter((r) => r.committed > 0 || r.inventory > 0 || r.nextBrewDate)
      .sort((a, b) => {
        if (b.deficit !== a.deficit) return b.deficit - a.deficit;
        if (b.committed !== a.committed) return b.committed - a.committed;
        const ai = LEGACY_SIZE_ORDER.indexOf(a.size);
        const bi = LEGACY_SIZE_ORDER.indexOf(b.size);
        if (ai !== bi) return ai - bi;
        return a.productName.localeCompare(b.productName);
      });
  }, [orders, products, nextBrewByKey]);

  const totals = useMemo(() => {
    const totalCommitted = rows.reduce((s, r) => s + r.committed, 0);
    const totalDeficit = rows.reduce((s, r) => s + r.deficit, 0);
    const beersNeedingBrew = new Set(
      rows.filter((r) => r.deficit > 0).map((r) => r.productId),
    ).size;
    return { totalCommitted, totalDeficit, beersNeedingBrew };
  }, [rows]);

  const earliestDeficit = rows
    .filter((r) => r.deficit > 0 && r.earliestDelivery)
    .sort((a, b) => (a.earliestDelivery! < b.earliestDelivery! ? -1 : 1))[0];

  const flash = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(''), 3500);
  };

  return (
    <div className="space-y-8">
      {toast && <div className="toast">{toast}</div>}

      <div>
        <span className="section-label mb-1 block">Production Planning</span>
        <h2
          className="font-display"
          style={{
            fontSize: '2.5rem',
            fontVariationSettings: "'opsz' 72",
            color: 'var(--ink)',
            fontWeight: 500,
          }}
        >
          What to Brew
        </h2>
      </div>

      {!loading && (
        <div className="ledger-line">
          <span
            className="font-display italic mr-2"
            style={{
              color: 'var(--muted)',
              fontVariationSettings: "'opsz' 24",
            }}
          >
            In the book:
          </span>
          <span className="ledger-num">{totals.totalCommitted}</span>{' '}
          keg{totals.totalCommitted === 1 ? '' : 's'} committed across{' '}
          <span className="ledger-num">
            {orders.filter((o) => o.status === 'pending' || o.status === 'confirmed').length}
          </span>{' '}
          open order{orders.filter((o) => o.status === 'pending' || o.status === 'confirmed').length === 1 ? '' : 's'}.{' '}
          {totals.totalDeficit > 0 ? (
            <>
              <span className="ledger-num" style={{ color: 'var(--ruby)' }}>
                {totals.totalDeficit}
              </span>{' '}
              keg{totals.totalDeficit === 1 ? '' : 's'} short across{' '}
              <span className="ledger-num" style={{ color: 'var(--ruby)' }}>
                {totals.beersNeedingBrew}
              </span>{' '}
              beer{totals.beersNeedingBrew === 1 ? '' : 's'} &mdash; brew before{' '}
              {earliestDeficit?.earliestDelivery ? (
                <span className="ledger-num" style={{ color: 'var(--ruby)' }}>
                  {formatDate(earliestDeficit.earliestDelivery)}
                </span>
              ) : (
                'the next delivery'
              )}
              .
            </>
          ) : (
            <span style={{ color: 'var(--pine)' }}>
              All committed orders fully covered by on-hand inventory.
            </span>
          )}
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          <div className="skeleton h-8 w-2/3" />
          <div className="skeleton h-16 w-full" />
          <div className="skeleton h-16 w-full" />
        </div>
      ) : rows.length === 0 ? (
        <p className="italic text-[var(--muted)]">
          No open orders and no inventory on file. Quiet day.
        </p>
      ) : (
        <table className="w-full">
          <thead>
            <tr>
              <th className="table-header">Beer</th>
              <th className="table-header">Size</th>
              <th className="table-header text-right">Committed</th>
              <th className="table-header text-right">On Hand</th>
              <th className="table-header text-right">Deficit</th>
              <th className="table-header">Earliest Delivery</th>
              <th className="table-header">Back In Stock By</th>
              <th className="table-header text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const isShort = row.deficit > 0;
              const isTight = !isShort && row.committed > 0 && row.inventory - row.committed < 3;
              const coveredByBrew = isShort && row.nextBrewDate && row.nextBrewYield >= row.deficit;
              return (
                <tr
                  key={`${row.productId}::${row.size}`}
                  style={{
                    background: isShort && !coveredByBrew
                      ? 'color-mix(in srgb, var(--ruby) 5%, transparent)'
                      : 'transparent',
                  }}
                >
                  <td className="table-cell">
                    <span className="font-semibold">{row.productName}</span>
                  </td>
                  <td className="table-cell">
                    <span className="section-label">{sizeLabel(row.size)}</span>
                  </td>
                  <td className="table-cell text-right font-variant-tabular">{row.committed}</td>
                  <td className="table-cell text-right font-variant-tabular">
                    <span
                      style={{
                        color: row.inventory === 0 ? 'var(--ruby)' : row.inventory < 5 ? 'var(--ember)' : 'var(--ink)',
                      }}
                    >
                      {row.inventory}
                    </span>
                  </td>
                  <td className="table-cell text-right font-variant-tabular">
                    <span
                      style={{
                        color: isShort ? 'var(--ruby)' : 'var(--muted)',
                        fontWeight: isShort ? 600 : 400,
                      }}
                    >
                      {isShort ? `+${row.deficit}` : '0'}
                    </span>
                  </td>
                  <td className="table-cell font-variant-tabular">
                    {row.earliestDelivery ? formatDate(row.earliestDelivery) : <span className="italic" style={{ color: 'var(--faint)' }}>no open orders</span>}
                  </td>
                  <td className="table-cell font-variant-tabular">
                    {row.nextBrewDate ? (
                      <span style={{ color: coveredByBrew ? 'var(--pine)' : 'var(--ink)' }}>
                        {formatDate(row.nextBrewDate)}
                        {row.nextBrewYield > 0 && (
                          <span className="text-xs ml-1" style={{ color: 'var(--muted)' }}>
                            (+{row.nextBrewYield})
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="italic" style={{ color: 'var(--faint)' }}>not scheduled</span>
                    )}
                  </td>
                  <td className="table-cell text-right">
                    {isShort && coveredByBrew ? (
                      <span className="section-label" style={{ color: 'var(--pine)' }}>
                        Brew Scheduled
                      </span>
                    ) : isShort ? (
                      <span className="section-label" style={{ color: 'var(--ruby)' }}>
                        Brew &#x2192;
                      </span>
                    ) : isTight ? (
                      <span className="section-label" style={{ color: 'var(--ember)' }}>
                        Tight
                      </span>
                    ) : row.committed === 0 && row.inventory > 10 ? (
                      <span className="section-label" style={{ color: 'var(--muted)' }}>
                        Surplus
                      </span>
                    ) : (
                      <span className="section-label" style={{ color: 'var(--pine)' }}>
                        Covered
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <BrewScheduleSection
        products={products}
        brews={brews}
        loading={loading}
        onChanged={reloadAll}
        flash={flash}
      />

      <p className="text-sm italic" style={{ color: 'var(--muted)' }}>
        Committed = sum of item quantities on all pending + confirmed orders. On-hand reflects the{' '}
        <Link href="/admin/products" className="underline" style={{ color: 'var(--brass)' }}>
          inventory editor
        </Link>
        . &ldquo;Back In Stock By&rdquo; shows the earliest unfinished brew in the schedule below;
        mark a brew complete to add its yield to on-hand inventory automatically.
      </p>
    </div>
  );
}

/* ================================================================== */
/*  BREW SCHEDULE SECTION                                             */
/* ================================================================== */

function BrewScheduleSection({
  products,
  brews,
  loading,
  onChanged,
  flash,
}: {
  products: Product[];
  brews: BrewSchedule[];
  loading: boolean;
  onChanged: () => void | Promise<void>;
  flash: (msg: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({
    productId: '',
    size: '',
    brewDate: '',
    expectedYield: 10,
    notes: '',
  });
  const [quickFilter, setQuickFilter] = useState<BrewQuickFilter>('all');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  const productMap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const activeRange = useMemo(
    () => buildBrewScheduleFilter(quickFilter, { from: customFrom, to: customTo }),
    [quickFilter, customFrom, customTo],
  );

  const sortedBrews = useMemo(() => {
    const filtered = filterBrewsByRange(brews, activeRange);
    return [...filtered].sort((a, b) => a.brewDate.localeCompare(b.brewDate));
  }, [brews, activeRange]);

  const filterLabel = useMemo(() => {
    const def = brewScheduleQuickFilters.find((q) => q.key === quickFilter);
    if (!def) return 'All Brews';
    if (quickFilter === 'custom') {
      if (customFrom && customTo) return `Custom: ${customFrom} to ${customTo}`;
      if (customFrom) return `Custom: from ${customFrom}`;
      if (customTo) return `Custom: through ${customTo}`;
      return 'All Brews';
    }
    return def.label;
  }, [quickFilter, customFrom, customTo]);

  const downloadPdf = useCallback(() => {
    const html = renderBrewSchedulePrintHtml({
      brews: sortedBrews,
      products,
      filterLabel,
    });
    // Popup-blocker-safe: requires a user gesture, which we have (button
    // click). If the browser still blocks the popup, we surface a toast so
    // Mike knows to allow popups for this origin.
    const win = window.open('', '_blank', 'width=960,height=720');
    if (!win) {
      flash('Enable popups for this site to download the PDF.');
      return;
    }
    win.document.open();
    win.document.write(html);
    win.document.close();
  }, [sortedBrews, products, filterLabel, flash]);

  const reset = () => setForm({ productId: '', size: '', brewDate: '', expectedYield: 10, notes: '' });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.productId || !form.size || !form.brewDate) {
      flash('Pick a beer, size, and brew date.');
      return;
    }
    try {
      const res = await adminFetch('/api/admin/brew-schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        flash(data.error || 'Could not save brew.');
        return;
      }
      reset();
      setAdding(false);
      flash('Brew scheduled.');
      await onChanged();
    } catch {
      flash('Network error scheduling brew.');
    }
  };

  const markComplete = async (id: string) => {
    if (!window.confirm('Mark this brew complete? This adds the expected yield to on-hand inventory.')) return;
    try {
      const res = await adminFetch('/api/admin/brew-schedule', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, complete: true }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        flash(data.error || 'Could not mark complete.');
        return;
      }
      flash('Brew marked complete; inventory updated.');
      await onChanged();
    } catch {
      flash('Network error.');
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm('Delete this scheduled brew? This does not affect inventory.')) return;
    try {
      const res = await adminFetch(`/api/admin/brew-schedule?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        flash(data.error || 'Could not delete.');
        return;
      }
      flash('Brew removed from schedule.');
      await onChanged();
    } catch {
      flash('Network error.');
    }
  };

  const availableSizesForProduct = (productId: string): string[] => {
    const p = productMap.get(productId);
    if (!p) return [];
    return [...p.sizes]
      .sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999))
      .map((s) => s.size);
  };

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <span className="section-label">Brewing Schedule</span>
          <p className="text-sm italic mt-1" style={{ color: 'var(--muted)' }}>
            Tell the system what&rsquo;s on deck. Each row projects a &ldquo;back in
            stock by&rdquo; date for that product + size above.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={downloadPdf}
            className="btn-ghost text-xs"
            title="Open a print-friendly view; use your browser's Save as PDF to download."
          >
            Download PDF
          </button>
          {!adding && (
            <button
              onClick={() => setAdding(true)}
              className="btn-primary text-xs"
            >
              + Schedule Brew
            </button>
          )}
        </div>
      </div>

      {/* Quick-range filters + optional custom date range. We filter on
          brewDate so "This Week" means "brews scheduled to happen this week"
          rather than "brews created this week." */}
      <div className="flex flex-wrap items-center gap-2 py-2">
        <span className="section-label" style={{ color: 'var(--muted)' }}>Filter:</span>
        {brewScheduleQuickFilters.map((f) => {
          const selected = quickFilter === f.key;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setQuickFilter(f.key)}
              className="text-xs px-2.5 py-1 rounded-full transition-all"
              style={{
                background: selected ? 'color-mix(in srgb, var(--brass) 16%, transparent)' : 'transparent',
                border: `1px solid ${selected ? 'color-mix(in srgb, var(--brass) 55%, transparent)' : 'var(--divider)'}`,
                color: selected ? 'var(--brass)' : 'var(--muted)',
                fontWeight: selected ? 600 : 400,
              }}
            >
              {f.label}
            </button>
          );
        })}
        {quickFilter === 'custom' && (
          <div className="flex items-center gap-2 ml-2">
            <input
              type="date"
              className="input text-xs"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              aria-label="From date"
            />
            <span className="text-xs" style={{ color: 'var(--muted)' }}>to</span>
            <input
              type="date"
              className="input text-xs"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              aria-label="To date"
            />
          </div>
        )}
        {activeRange && sortedBrews.length === 0 && brews.length > 0 && (
          <span className="text-xs italic ml-2" style={{ color: 'var(--muted)' }}>
            {brews.length} brew{brews.length === 1 ? '' : 's'} hidden by filter
          </span>
        )}
      </div>

      {adding && (
        <form
          onSubmit={submit}
          className="grid grid-cols-1 sm:grid-cols-5 gap-2 p-3"
          style={{ border: '1px solid var(--divider)', borderRadius: '3px', background: 'var(--surface)' }}
        >
          <select
            className="input text-sm"
            value={form.productId}
            onChange={(e) => setForm((f) => ({ ...f, productId: e.target.value, size: '' }))}
            required
          >
            <option value="">Beer…</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <select
            className="input text-sm"
            value={form.size}
            onChange={(e) => setForm((f) => ({ ...f, size: e.target.value }))}
            required
            disabled={!form.productId}
          >
            <option value="">Size…</option>
            {availableSizesForProduct(form.productId).map((s) => (
              <option key={s} value={s}>{sizeLabel(s)}</option>
            ))}
          </select>
          <input
            type="date"
            className="input text-sm"
            value={form.brewDate}
            onChange={(e) => setForm((f) => ({ ...f, brewDate: e.target.value }))}
            required
          />
          <input
            type="number"
            className="input text-sm"
            placeholder="Yield (kegs)"
            min={1}
            value={form.expectedYield}
            onChange={(e) => setForm((f) => ({ ...f, expectedYield: Math.max(1, Number(e.target.value)) }))}
          />
          <div className="flex gap-2">
            <button type="submit" className="btn-primary text-sm px-3 flex-1">Save</button>
            <button
              type="button"
              onClick={() => { setAdding(false); reset(); }}
              className="btn-ghost text-sm px-3"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {!loading && sortedBrews.length === 0 && !adding && (
        <p className="text-sm italic py-3" style={{ color: 'var(--faint)' }}>
          {brews.length === 0
            ? 'No brews scheduled. Click "Schedule Brew" to add one — the Back In Stock By column above will fill in automatically.'
            : 'No brews match the current filter. Try "All" to see everything on the calendar.'}
        </p>
      )}

      {sortedBrews.length > 0 && (
        <table className="w-full">
          <thead>
            <tr>
              <th className="table-header">Beer</th>
              <th className="table-header">Size</th>
              <th className="table-header">Brew Date</th>
              <th className="table-header text-right">Expected Yield</th>
              <th className="table-header">Notes</th>
              <th className="table-header text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {sortedBrews.map((b) => {
              const p = productMap.get(b.productId);
              return (
                <tr key={b.id}>
                  <td className="table-cell font-semibold">{p?.name || b.productId}</td>
                  <td className="table-cell">
                    <span className="section-label">{sizeLabel(b.size)}</span>
                  </td>
                  <td className="table-cell font-variant-tabular">{formatDate(b.brewDate)}</td>
                  <td className="table-cell text-right font-variant-tabular">+{b.expectedYield}</td>
                  <td className="table-cell text-sm" style={{ color: 'var(--muted)' }}>{b.notes || '—'}</td>
                  <td className="table-cell text-right">
                    <div className="inline-flex gap-3">
                      <button
                        onClick={() => markComplete(b.id)}
                        className="section-label hover:underline"
                        style={{ color: 'var(--pine)' }}
                        title="Mark brew complete + add expected yield to on-hand inventory"
                      >
                        Mark Complete
                      </button>
                      <button
                        onClick={() => remove(b.id)}
                        className="section-label hover:underline"
                        style={{ color: 'var(--ruby)' }}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
