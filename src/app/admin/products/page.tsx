'use client';

import { useState, useEffect, useCallback } from 'react';
import { Product, KegSize } from '@/lib/types';
import { formatCurrency, cn } from '@/lib/utils';

const KEG_SIZES: KegSize[] = ['1/2bbl', '1/4bbl', '1/6bbl'];
const SIZE_LABELS: Record<KegSize, string> = { '1/2bbl': '1/2 Barrel', '1/4bbl': '1/4 Barrel', '1/6bbl': '1/6 Barrel' };

const CATEGORIES = ['Ale', 'IPA', 'Stout', 'Porter', 'Lager', 'Wheat', 'Sour', 'Other'];

interface ProductForm {
  name: string;
  style: string;
  abv: number;
  description: string;
  category: string;
  available: boolean;
  sizes: { size: KegSize; price: number; deposit: number }[];
}

const emptyForm: ProductForm = {
  name: '', style: '', abv: 0, description: '', category: 'Ale', available: true,
  sizes: KEG_SIZES.map(s => ({ size: s, price: 0, deposit: 0 })),
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
      const res = await fetch('/api/products?all=true');
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

  const openEdit = (product: Product) => {
    const sizesMap = new Map(product.sizes.map(s => [s.size, s]));
    setForm({
      name: product.name,
      style: product.style,
      abv: product.abv,
      description: product.description,
      category: product.category,
      available: product.available,
      sizes: KEG_SIZES.map(s => sizesMap.get(s) || { size: s, price: 0, deposit: 0 }),
    });
    setEditingId(product.id);
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const activeSizes = form.sizes.filter(s => s.price > 0);
      const body = { ...form, sizes: activeSizes };

      if (editingId) {
        const res = await fetch('/api/products', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editingId, ...body }),
        });
        if (res.ok) { setModalOpen(false); await loadProducts(); }
      } else {
        const res = await fetch('/api/products', {
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
      const res = await fetch('/api/products', {
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
      const res = await fetch('/api/products', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (res.ok) { setDeleteConfirm(null); await loadProducts(); }
    } catch (err) { console.error('Failed to delete product', err); }
  };

  const updateSize = (sizeKey: KegSize, field: 'price', value: number) => {
    setForm(prev => ({
      ...prev,
      sizes: prev.sizes.map(s => s.size === sizeKey ? { ...s, [field]: value } : s),
    }));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <span className="section-label mb-1 block">Inventory</span>
          <h2 className="font-heading text-2xl font-black text-cream">Products</h2>
        </div>
        <div className="flex items-center gap-3 self-start">
          <input type="text" placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)}
            className="input max-w-[200px] text-sm" />
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
                  <th className="table-header">Sizes</th>
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
                      <div className="flex gap-1">
                        {product.sizes.map(s => (
                          <span key={s.size} className="text-[10px] font-heading font-bold text-cream/30 bg-charcoal-300 px-1.5 py-0.5 rounded">
                            {s.size}: {formatCurrency(s.price)}
                          </span>
                        ))}
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
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-cream/40 mb-1.5">Beer Name</label>
                  <input className="input" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-cream/40 mb-1.5">Style</label>
                  <input className="input" placeholder="e.g. West Coast IPA" value={form.style} onChange={e => setForm(p => ({ ...p, style: e.target.value }))} required />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-cream/40 mb-1.5">ABV (%)</label>
                  <input type="number" step="0.1" min="0" max="20" className="input" value={form.abv}
                    onChange={e => setForm(p => ({ ...p, abv: parseFloat(e.target.value) || 0 }))} required />
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

              {/* Keg Sizes Pricing */}
              <div>
                <span className="section-label mb-3 block">Keg Pricing</span>
                <div className="space-y-2">
                  {KEG_SIZES.map(size => {
                    const sizeData = form.sizes.find(s => s.size === size);
                    return (
                      <div key={size} className="flex items-center gap-3 p-3 rounded-xl bg-charcoal-200 border border-white/[0.04]">
                        <span className="text-xs font-heading font-bold text-cream/50 w-24">{SIZE_LABELS[size]}</span>
                        <div className="flex-1">
                          <label className="text-[10px] text-cream/25 block mb-0.5">Price ($)</label>
                          <input type="number" step="1" min="0" className="input text-sm py-1.5"
                            value={sizeData?.price || 0}
                            onChange={e => updateSize(size, 'price', parseInt(e.target.value) || 0)} />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="text-[10px] text-cream/15 mt-1.5">Set price to $0 to exclude a size from this product.</p>
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
