'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import type { Order, Product, KegSize } from '@/lib/types';
import { formatDate } from '@/lib/utils';
import { adminFetch } from '@/lib/admin-fetch';

type RowKey = `${string}::${KegSize}`;

type ProductionRow = {
  productId: string;
  productName: string;
  size: KegSize;
  committed: number; // sum of open order quantities
  inventory: number; // on-hand for this size
  deficit: number; // committed - inventory (positive = need to brew)
  earliestDelivery: string | null;
};

const SIZE_LABELS: Record<KegSize, string> = {
  '1/2bbl': '1/2 Barrel',
  '1/4bbl': '1/4 Barrel',
  '1/6bbl': '1/6 Barrel',
};

const SIZE_ORDER: KegSize[] = ['1/2bbl', '1/4bbl', '1/6bbl'];

export default function ProductionPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      adminFetch('/api/orders').then((r) => r.json()),
      adminFetch('/api/products?all=true').then((r) => r.json()),
    ])
      .then(([o, p]) => {
        setOrders(Array.isArray(o) ? o : []);
        setProducts(Array.isArray(p) ? p : []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const productMap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const rows = useMemo<ProductionRow[]>(() => {
    const openOrders = orders.filter(
      (o) => o.status === 'pending' || o.status === 'confirmed',
    );

    const acc = new Map<RowKey, ProductionRow>();

    // Initialize from all product × size combos so zero-committed beers show up too.
    for (const product of products) {
      for (const size of product.sizes) {
        const key: RowKey = `${product.id}::${size.size}`;
        acc.set(key, {
          productId: product.id,
          productName: product.name,
          size: size.size,
          committed: 0,
          inventory: size.inventoryCount ?? 0,
          deficit: 0,
          earliestDelivery: null,
        });
      }
    }

    // Roll up open orders
    for (const order of openOrders) {
      for (const item of order.items) {
        const key: RowKey = `${item.productId}::${item.size}`;
        let row = acc.get(key);
        if (!row) {
          row = {
            productId: item.productId,
            productName: item.productName,
            size: item.size,
            committed: 0,
            inventory: 0,
            deficit: 0,
            earliestDelivery: null,
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

    // Compute deficit + filter-out product rows that have no order AND no inventory
    // (e.g., out-of-stock discontinued beers)
    return Array.from(acc.values())
      .map((r) => ({ ...r, deficit: Math.max(0, r.committed - r.inventory) }))
      .filter((r) => r.committed > 0 || r.inventory > 0)
      .sort((a, b) => {
        if (b.deficit !== a.deficit) return b.deficit - a.deficit;
        if (b.committed !== a.committed) return b.committed - a.committed;
        const ai = SIZE_ORDER.indexOf(a.size);
        const bi = SIZE_ORDER.indexOf(b.size);
        if (ai !== bi) return ai - bi;
        return a.productName.localeCompare(b.productName);
      });
  }, [orders, products]);

  // Roll-up aggregates
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

  return (
    <div className="space-y-8">
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

      {/* Summary ledger — brewmaster's morning read */}
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
              <th className="table-header text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const isShort = row.deficit > 0;
              const isTight = !isShort && row.committed > 0 && row.inventory - row.committed < 3;
              return (
                <tr
                  key={`${row.productId}::${row.size}`}
                  style={{
                    background: isShort ? 'color-mix(in srgb, var(--ruby) 5%, transparent)' : 'transparent',
                  }}
                >
                  <td className="table-cell">
                    <span className="font-semibold">{row.productName}</span>
                  </td>
                  <td className="table-cell">
                    <span className="section-label">{SIZE_LABELS[row.size]}</span>
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
                  <td className="table-cell text-right">
                    {isShort ? (
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

      <p className="text-sm italic" style={{ color: 'var(--muted)' }}>
        Committed = sum of item quantities on all pending + confirmed orders. On-hand reflects the{' '}
        <Link href="/admin/products" className="underline" style={{ color: 'var(--brass)' }}>
          inventory editor
        </Link>
        . Adjust there and this page recalculates.
      </p>
    </div>
  );
}
