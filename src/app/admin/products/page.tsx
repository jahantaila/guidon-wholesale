'use client';

import { useState, useEffect, useCallback } from 'react';
import { Product, KegSize } from '@/lib/types';
import { formatCurrency, cn } from '@/lib/utils';
import { adminFetch } from '@/lib/admin-fetch';

const KEG_SIZES: KegSize[] = ['1/2bbl', '1/4bbl', '1/6bbl'];
const SIZE_LABELS: Record<KegSize, string> = { '1/2bbl': '1/2 Barrel', '1/4bbl': '1/4 Barrel', '1/6bbl': '1/6 Barrel' };

const CATEGORIES = ['Ale', 'IPA', 'Stout', 'Porter', 'Lager', 'Wheat', 'Sour', 'Other'];

interface ProductForm {
  name: string;
  style: string;
  abv: number;
  ibu: number | '';
  description: string;
  category: string;
  available: boolean;
  newRelease: boolean;
  limitedRelease: boolean;
  imageUrl: string;
  awards: string[];
  sizes: { size: KegSize; price: number; deposit: number; inventoryCount: number; available: boolean }[];
}

const DEFAULT_DEPOSITS: Record<KegSize, number> = { '1/2bbl': 50, '1/4bbl': 40, '1/6bbl': 30 };

const emptyForm: ProductForm = {
  name: '', style: '', abv: 0, ibu: '', description: '', category: 'Ale',
  available: true, newRelease: false, limitedRelease: false, imageUrl: '',
  awards: [],
  sizes: KEG_SIZES.map(s => ({ size: s, price: 0, deposit: DEFAULT_DEPOSITS[s], inventoryCount: 0, available: true })),
};

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);

  const loadProducts = useCallback(async () => {
    try {
      const res = await adminFetch('/api/products?all=true');
      const data = await res.json();
      setProducts(Array.isArray(data) ? data : []);
    } catch (err) { console.error('Failed to load products', err); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadProducts(); }, [loadProducts]);

  const openAdd = () => {
    setForm(emptyForm);
    setEditingId(null);
    setModalOpen(true);
  };

  // Duplicate an existing product into the Add form pre-populated. Useful
  // for seasonal variants (Winter Doppelbock → Spring Doppelbock with the
  // same ABV / IBU / description but a new name + inventory). Admin tweaks
  // what's different and hits Create.
  const openDuplicate = (product: Product) => {
    const sizesMap = new Map(product.sizes.map(s => [s.size, s]));
    setForm({
      name: `${product.name} (copy)`,
      style: product.style,
      abv: product.abv,
      ibu: product.ibu ?? '',
      description: product.description,
      category: product.category,
      available: product.available,
      newRelease: product.newRelease ?? false,
      limitedRelease: product.limitedRelease ?? false,
      imageUrl: product.imageUrl ?? '',
      awards: product.awards ?? [],
      sizes: KEG_SIZES.map((s) => {
        const existing = sizesMap.get(s);
        return existing
          ? {
              size: s,
              price: existing.price,
              deposit: existing.deposit,
              inventoryCount: 0, // start duplicates at 0 stock
              available: existing.available ?? true,
            }
          : {
              size: s,
              price: 0,
              deposit: 0,
              inventoryCount: 0,
              available: false,
            };
      }),
    });
    setEditingId(null); // treat as a new product, not an edit
    setModalOpen(true);
  };

  const openEdit = (product: Product) => {
    const sizesMap = new Map(product.sizes.map(s => [s.size, s]));
    setForm({
      name: product.name,
      style: product.style,
      abv: product.abv,
      ibu: product.ibu ?? '',
      description: product.description,
      category: product.category,
      available: product.available,
      newRelease: product.newRelease ?? false,
      limitedRelease: product.limitedRelease ?? false,
      imageUrl: product.imageUrl ?? '',
      awards: product.awards ?? [],
      sizes: KEG_SIZES.map((s) => {
        const existing = sizesMap.get(s);
        return existing
          ? {
              size: s,
              price: existing.price,
              deposit: existing.deposit,
              inventoryCount: existing.inventoryCount ?? 0,
              available: existing.available ?? true,
            }
          : { size: s, price: 0, deposit: DEFAULT_DEPOSITS[s], inventoryCount: 0, available: false };
      }),
    });
    setEditingId(product.id);
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const activeSizes = form.sizes.filter(s => s.price > 0);
      // Normalize: coerce ibu '' -> undefined so the API doesn't persist NaN;
      // trim empty awards so '' doesn't become a visible bullet on the card.
      const cleanAwards = form.awards.map(a => a.trim()).filter(Boolean);
      const body = {
        ...form,
        ibu: form.ibu === '' ? undefined : Number(form.ibu),
        awards: cleanAwards,
        imageUrl: form.imageUrl.trim() || undefined,
        sizes: activeSizes,
      };

      if (editingId) {
        const res = await adminFetch('/api/products', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editingId, ...body }),
        });
        if (res.ok) { setModalOpen(false); await loadProducts(); }
      } else {
        const res = await adminFetch('/api/products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (res.ok) { setModalOpen(false); await loadProducts(); }
      }
    } catch (err) { console.error('Failed to save product', err); }
    finally { setSaving(false); }
  };

  const handleToggleAvailability = async (product: Product) => {
    setToggling(product.id);
    try {
      const res = await adminFetch('/api/products', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: product.id, available: !product.available }),
      });
      if (res.ok) {
        setProducts(prev => prev.map(p => p.id === product.id ? { ...p, available: !p.available } : p));
      }
    } catch (err) { console.error('Failed to toggle availability', err); }
    finally { setToggling(null); }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await adminFetch('/api/products', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (res.ok) { setDeleteConfirm(null); await loadProducts(); }
    } catch (err) { console.error('Failed to delete product', err); }
  };

  const updateSize = <K extends keyof ProductForm['sizes'][number]>(
    sizeKey: KegSize,
    field: K,
    value: ProductForm['sizes'][number][K],
  ) => {
    setForm((prev) => ({
      ...prev,
      sizes: prev.sizes.map((s) => (s.size === sizeKey ? { ...s, [field]: value } : s)),
    }));
  };

  const [adjustingInventory, setAdjustingInventory] = useState<string | null>(null);

  const [invError, setInvError] = useState('');

  const adjustInventory = async (productId: string, size: KegSize, delta: number) => {
    const key = `${productId}-${size}`;
    setAdjustingInventory(key);
    setInvError('');
    try {
      const res = await adminFetch('/api/admin/inventory', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, size, delta }),
      });
      if (res.ok) {
        const { inventoryCount } = await res.json();
        setProducts(prev =>
          prev.map(p =>
            p.id !== productId
              ? p
              : {
                  ...p,
                  sizes: p.sizes.map(s =>
                    s.size === size ? { ...s, inventoryCount } : s,
                  ),
                },
          ),
        );
      } else {
        const err = await res.json().catch(() => ({}));
        setInvError(err.error || 'Inventory update failed.');
        window.setTimeout(() => setInvError(''), 4000);
      }
    } catch (err) {
      console.error('Failed to adjust inventory', err);
    } finally {
      setAdjustingInventory(null);
    }
  };

  const setInventoryAbsolute = async (productId: string, size: KegSize, count: number) => {
    const key = `${productId}-${size}`;
    setAdjustingInventory(key);
    setInvError('');
    try {
      const res = await adminFetch('/api/admin/inventory', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, size, count }),
      });
      if (res.ok) {
        const { inventoryCount } = await res.json();
        setProducts(prev =>
          prev.map(p =>
            p.id !== productId
              ? p
              : {
                  ...p,
                  sizes: p.sizes.map(s =>
                    s.size === size ? { ...s, inventoryCount } : s,
                  ),
                },
          ),
        );
      } else {
        const err = await res.json().catch(() => ({}));
        setInvError(err.error || 'Inventory update failed.');
        window.setTimeout(() => setInvError(''), 4000);
      }
    } catch (err) {
      console.error('Failed to set inventory', err);
    } finally {
      setAdjustingInventory(null);
    }
  };

  return (
    <div className="space-y-6">
      {invError && <div className="toast" style={{ color: 'var(--ruby)' }}>{invError}</div>}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <span className="section-label mb-1 block">Inventory</span>
          <h2 className="font-heading text-2xl font-black text-cream">Products</h2>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 self-start flex-wrap">
          <input type="text" placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)}
            className="input max-w-[140px] sm:max-w-[200px] text-sm" />
          <button onClick={openAdd} className="btn-primary">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Product
          </button>
        </div>
      </div>

      <div className="card p-0 overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-14 w-full rounded-lg" />)}</div>
        ) : products.length === 0 ? (
          <p className="p-6 text-cream/25 text-sm">No products yet. Add your first beer.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-charcoal-200">
                <tr>
                  <th className="table-header">Name</th>
                  <th className="table-header">Style</th>
                  <th className="table-header">ABV</th>
                  <th className="table-header">Category</th>
                  <th className="table-header">Pricing + Inventory</th>
                  <th className="table-header">Status</th>
                  <th className="table-header text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {products.filter(p => {
                  if (!search) return true;
                  const q = search.toLowerCase();
                  return p.name.toLowerCase().includes(q) || p.style.toLowerCase().includes(q) || p.category.toLowerCase().includes(q);
                }).map(product => (
                  <tr key={product.id} className={cn('transition-colors', product.available ? 'hover:bg-white/[0.02]' : 'opacity-50')}>
                    <td className="table-cell font-heading font-bold text-cream">{product.name}</td>
                    <td className="table-cell text-cream/50">{product.style}</td>
                    <td className="table-cell text-cream/50">{product.abv}%</td>
                    <td className="table-cell">
                      <span className="badge-sm bg-olive/20 text-olive-300 border border-olive/30">{product.category}</span>
                    </td>
                    <td className="table-cell">
                      <div className="space-y-1">
                        {product.sizes.map(s => {
                          const key = `${product.id}-${s.size}`;
                          const busy = adjustingInventory === key;
                          const count = s.inventoryCount ?? 0;
                          const lowStock = count > 0 && count < 3;
                          const outOfStock = count === 0;
                          const countColor = outOfStock
                            ? 'var(--ruby)'
                            : lowStock
                            ? 'var(--ember)'
                            : 'var(--pine)';
                          return (
                            <div
                              key={s.size}
                              className="flex items-center gap-2 text-xs font-variant-tabular"
                            >
                              <span className="section-label w-12 shrink-0">{s.size}</span>
                              <span style={{ color: 'var(--muted)' }} className="w-14 shrink-0">
                                {formatCurrency(s.price)}
                              </span>
                              <button
                                onClick={() => adjustInventory(product.id, s.size, -1)}
                                disabled={busy || count === 0}
                                className="w-5 h-5 flex items-center justify-center border border-divider hover:bg-surface transition-colors disabled:opacity-30"
                                style={{ borderRadius: '2px', color: 'var(--muted)' }}
                                title="Remove 1 keg from inventory"
                              >
                                &minus;
                              </button>
                              <input
                                type="number"
                                min={0}
                                value={count}
                                onBlur={(e) => {
                                  const n = parseInt(e.target.value, 10);
                                  if (!isNaN(n) && n !== count) setInventoryAbsolute(product.id, s.size, n);
                                }}
                                onChange={(e) => {
                                  const n = parseInt(e.target.value, 10);
                                  if (!isNaN(n)) {
                                    setProducts(prev =>
                                      prev.map(p =>
                                        p.id !== product.id
                                          ? p
                                          : {
                                              ...p,
                                              sizes: p.sizes.map(sz =>
                                                sz.size === s.size ? { ...sz, inventoryCount: n } : sz,
                                              ),
                                            },
                                      ),
                                    );
                                  }
                                }}
                                className="w-12 text-center font-semibold font-variant-tabular bg-transparent border-b"
                                style={{ borderColor: 'var(--divider)', color: countColor }}
                                disabled={busy}
                              />
                              <button
                                onClick={() => adjustInventory(product.id, s.size, 1)}
                                disabled={busy}
                                className="w-5 h-5 flex items-center justify-center border border-divider hover:bg-surface transition-colors disabled:opacity-30"
                                style={{ borderRadius: '2px', color: 'var(--muted)' }}
                                title="Add 1 keg to inventory"
                              >
                                +
                              </button>
                              <span className="text-xs italic" style={{ color: 'var(--muted)' }}>
                                {outOfStock ? 'out' : lowStock ? 'low' : 'in stock'}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </td>
                    <td className="table-cell">
                      <button
                        onClick={() => handleToggleAvailability(product)}
                        disabled={toggling === product.id}
                        className={cn(
                          'badge-sm cursor-pointer transition-all',
                          product.available
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : 'bg-red-500/20 text-red-400 border border-red-500/30'
                        )}
                      >
                        {product.available ? 'Available' : 'Unavailable'}
                      </button>
                    </td>
                    <td className="table-cell text-right">
                      <div className="flex items-center justify-end gap-3">
                        <button onClick={() => openEdit(product)} className="text-gold/60 hover:text-gold text-sm font-bold transition-colors">
                          Edit
                        </button>
                        <button
                          onClick={() => openDuplicate(product)}
                          className="text-cream/40 hover:text-cream/70 text-sm font-bold transition-colors"
                          title="Create a new product pre-filled from this one"
                        >
                          Duplicate
                        </button>
                        {deleteConfirm === product.id ? (
                          <div className="flex items-center gap-1">
                            <button onClick={() => handleDelete(product.id)} className="text-red-400 text-sm font-bold">Confirm</button>
                            <button onClick={() => setDeleteConfirm(null)} className="text-cream/30 text-sm">Cancel</button>
                          </div>
                        ) : (
                          <button onClick={() => setDeleteConfirm(product.id)} className="text-red-400/40 hover:text-red-400 text-sm font-bold transition-colors">
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

      {/* Product Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-charcoal-100 border border-white/[0.08] rounded-2xl max-w-xl w-full max-h-[90vh] overflow-y-auto p-6 animate-scale-in">
            <h3 className="font-heading text-lg font-bold text-cream mb-5">
              {editingId ? 'Edit Product' : 'Add Product'}
            </h3>
            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-cream/40 mb-1.5">Beer Name</label>
                  <input className="input" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-cream/40 mb-1.5">Style</label>
                  <input className="input" placeholder="e.g. West Coast IPA" value={form.style} onChange={e => setForm(p => ({ ...p, style: e.target.value }))} required />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-cream/40 mb-1.5">ABV (%)</label>
                  <input type="number" step="0.1" min="0" max="20" className="input" value={form.abv}
                    onChange={e => setForm(p => ({ ...p, abv: parseFloat(e.target.value) || 0 }))} required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-cream/40 mb-1.5">IBU <span className="text-xs text-cream/25">(optional)</span></label>
                  <input type="number" step="1" min="0" max="200" className="input"
                    placeholder="e.g. 25" value={form.ibu}
                    onChange={e => setForm(p => ({ ...p, ibu: e.target.value === '' ? '' : parseInt(e.target.value) || 0 }))} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-cream/40 mb-1.5">Category</label>
                  <select className="input" value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))}>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-cream/40 mb-1.5">Description</label>
                <textarea className="input resize-none" rows={2} value={form.description}
                  onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
              </div>

              {/* Awards / accolades — render as ◆ lines on the product card */}
              <div>
                <label className="block text-sm font-medium text-cream/40 mb-1.5">
                  Tags &amp; Awards
                  <span className="text-xs text-cream/25 ml-2 font-normal">
                    (one per line — e.g. &ldquo;2025 N.C. Brewers Cup, Gold Medal Winner&rdquo;)
                  </span>
                </label>
                <textarea
                  className="input resize-none font-mono text-xs"
                  rows={3}
                  placeholder="2025 N.C. Brewers Cup, Honorable Mention&#10;Blue Ribbon Winner, Brew Horizons Fest"
                  value={form.awards.join('\n')}
                  onChange={(e) => setForm((p) => ({ ...p, awards: e.target.value.split('\n') }))}
                />
                <p className="text-[10px] text-cream/20 mt-1">
                  These render as &#9670; accolades on the customer-facing product card.
                </p>
              </div>

              {/* Release flags + image URL */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="flex items-center gap-2 p-3 rounded-xl bg-charcoal-200 border border-white/[0.04] cursor-pointer hover:border-gold/30 transition-colors">
                  <input type="checkbox" checked={form.newRelease}
                    onChange={e => setForm(p => ({ ...p, newRelease: e.target.checked }))}
                    className="w-4 h-4" />
                  <span className="text-sm text-cream/60">New Release badge</span>
                </label>
                <label className="flex items-center gap-2 p-3 rounded-xl bg-charcoal-200 border border-white/[0.04] cursor-pointer hover:border-gold/30 transition-colors">
                  <input type="checkbox" checked={form.limitedRelease}
                    onChange={e => setForm(p => ({ ...p, limitedRelease: e.target.checked }))}
                    className="w-4 h-4" />
                  <span className="text-sm text-cream/60">Limited Release badge</span>
                </label>
              </div>

              <div>
                <label className="block text-sm font-medium text-cream/40 mb-1.5">
                  Image URL
                  <span className="text-xs text-cream/25 ml-2 font-normal">(optional)</span>
                </label>
                <input type="url" className="input" placeholder="https://... or /images/products/mybeer.png"
                  value={form.imageUrl}
                  onChange={e => setForm(p => ({ ...p, imageUrl: e.target.value }))} />
                <p className="text-[10px] text-cream/20 mt-1">
                  Leave blank to use the typographic card treatment (no photo).
                </p>
              </div>

              {/* Keg Sizes: price + initial inventory + per-size available toggle */}
              <div>
                <span className="section-label mb-3 block">Keg Sizes</span>
                <div className="space-y-2">
                  {KEG_SIZES.map((size) => {
                    const sizeData = form.sizes.find((s) => s.size === size);
                    return (
                      <div
                        key={size}
                        className="grid grid-cols-12 items-end gap-3 p-3 rounded-xl bg-charcoal-200 border border-white/[0.04]"
                        style={{ opacity: sizeData?.available ? 1 : 0.5 }}
                      >
                        <span className="col-span-3 text-xs font-heading font-bold text-cream/60">
                          {SIZE_LABELS[size]}
                        </span>
                        <div className="col-span-3">
                          <label className="text-[10px] text-cream/35 block mb-0.5">Price ($)</label>
                          <input
                            type="number"
                            step="1"
                            min="0"
                            className="input text-sm py-1.5"
                            value={sizeData?.price || 0}
                            onChange={(e) => updateSize(size, 'price', parseInt(e.target.value) || 0)}
                            disabled={!sizeData?.available}
                          />
                        </div>
                        <div className="col-span-3">
                          <label className="text-[10px] text-cream/35 block mb-0.5">
                            Inventory
                            <span className="text-cream/20 ml-1">(on-hand kegs)</span>
                          </label>
                          <input
                            type="number"
                            step="1"
                            min="0"
                            className="input text-sm py-1.5"
                            value={sizeData?.inventoryCount ?? 0}
                            onChange={(e) =>
                              updateSize(size, 'inventoryCount', parseInt(e.target.value) || 0)
                            }
                            disabled={!sizeData?.available}
                          />
                        </div>
                        <label className="col-span-3 flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={sizeData?.available ?? false}
                            onChange={(e) => updateSize(size, 'available', e.target.checked)}
                            className="w-4 h-4"
                          />
                          <span className="text-xs text-cream/55">Offered</span>
                        </label>
                      </div>
                    );
                  })}
                </div>
                <p className="text-[10px] text-cream/30 mt-1.5">
                  Uncheck <strong>Offered</strong> to gray the size out on the customer catalog with
                  a hover tooltip &mdash; the size stays in the DB so you can re-enable it later
                  without losing the price or inventory. Use this for seasonal offerings or limited
                  releases like Ciao Matteo (1/6 BBL only).
                </p>
              </div>

              {/* Availability toggle */}
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => setForm(p => ({ ...p, available: !p.available }))}
                  className={cn(
                    'w-10 h-6 rounded-full transition-all relative',
                    form.available ? 'bg-emerald-500' : 'bg-charcoal-400'
                  )}>
                  <div className={cn(
                    'w-4 h-4 rounded-full bg-white absolute top-1 transition-all',
                    form.available ? 'left-5' : 'left-1'
                  )} />
                </button>
                <span className="text-sm text-cream/50">{form.available ? 'Available to customers' : 'Hidden from customers'}</span>
              </div>

              <div className="flex justify-end gap-3 pt-3">
                <button type="button" onClick={() => { setModalOpen(false); setEditingId(null); }} className="btn-secondary px-4 py-2">Cancel</button>
                <button type="submit" disabled={saving} className="btn-primary">
                  {saving ? 'Saving...' : editingId ? 'Update Product' : 'Add Product'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
