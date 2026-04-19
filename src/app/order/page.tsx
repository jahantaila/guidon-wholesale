'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import type { Product, ProductSize, CartItem, KegReturn, KegSize, Customer } from '@/lib/types';
import { KEG_DEPOSITS } from '@/lib/types';
import { formatCurrency, cn } from '@/lib/utils';

const KEG_SIZES: KegSize[] = ['1/2bbl', '1/4bbl', '1/6bbl'];
const SIZE_LABELS: Record<KegSize, string> = { '1/2bbl': '1/2 Barrel', '1/4bbl': '1/4 Barrel', '1/6bbl': '1/6 Barrel' };
const SIZE_SHORT: Record<KegSize, string> = { '1/2bbl': 'Half', '1/4bbl': 'Quarter', '1/6bbl': 'Sixth' };
const SIZE_FILTERS = ['All', ...KEG_SIZES] as const;

const BEER_COLORS: Record<string, string> = {
  'Ale': 'from-amber-600/30 to-amber-800/20',
  'Stout': 'from-stone-700/40 to-stone-900/30',
  'IPA': 'from-orange-500/25 to-amber-700/20',
  'Wheat': 'from-yellow-500/25 to-amber-600/15',
  'Porter': 'from-stone-600/35 to-stone-800/25',
  'Lager': 'from-yellow-400/20 to-amber-500/15',
};

function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 2500);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div className="toast">
      <svg className="w-5 h-5 text-emerald-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>
      <span>{message}</span>
    </div>
  );
}

function ProductSkeleton() {
  return (
    <div className="card-product">
      <div className="h-32 skeleton rounded-none" />
      <div className="p-5">
        <div className="skeleton h-5 w-3/4 mb-2" />
        <div className="skeleton h-3 w-1/2 mb-4" />
        <div className="skeleton h-10 w-full" />
      </div>
    </div>
  );
}

export default function OrderPage() {
  const router = useRouter();

  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [sizeFilter, setSizeFilter] = useState<string>('All');
  const [categoryFilter, setCategoryFilter] = useState<string>('All');

  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [kegReturns, setKegReturns] = useState<KegReturn[]>([]);
  const [toastMsg, setToastMsg] = useState('');

  const [selections, setSelections] = useState<
    Record<string, { size: KegSize; quantity: number }>
  >({});

  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [isNewCustomer, setIsNewCustomer] = useState(false);
  const [newCustomer, setNewCustomer] = useState({
    businessName: '', contactName: '', email: '', phone: '', address: '',
  });
  const [deliveryDate, setDeliveryDate] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const [expandedProduct, setExpandedProduct] = useState<string | null>(null);

  // Auth check — redirect to portal if not logged in
  useEffect(() => {
    fetch('/api/portal/login')
      .then((r) => { if (!r.ok) router.replace('/portal'); })
      .catch(() => router.replace('/portal'));
  }, [router]);

  useEffect(() => {
    async function fetchData() {
      try {
        const [prodRes, custRes] = await Promise.all([
          fetch('/api/products'),
          fetch('/api/customers'),
        ]);
        const prods: Product[] = await prodRes.json();
        const custs: Customer[] = await custRes.json();
        setProducts(prods.filter((p) => p.available));
        setCustomers(custs);
      } catch {
        // Silent fail
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  const categories = useMemo(() => {
    const cats = new Set(products.map((p) => p.category));
    return ['All', ...Array.from(cats).sort()];
  }, [products]);

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchesSearch = !search ||
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.style.toLowerCase().includes(search.toLowerCase());
      const matchesSize = sizeFilter === 'All' || p.sizes.some((s) => s.size === sizeFilter);
      const matchesCategory = categoryFilter === 'All' || p.category === categoryFilter;
      return matchesSearch && matchesSize && matchesCategory;
    });
  }, [products, search, sizeFilter, categoryFilter]);

  const subtotal = useMemo(() => cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0), [cart]);
  const depositFromItems = useMemo(() => cart.reduce((sum, item) => sum + item.deposit * item.quantity, 0), [cart]);
  const depositFromReturns = useMemo(() => kegReturns.reduce((sum, ret) => sum + KEG_DEPOSITS[ret.size] * ret.quantity, 0), [kegReturns]);
  const totalDeposit = depositFromItems - depositFromReturns;
  const total = subtotal + totalDeposit;
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  const getSelection = useCallback((productId: string, sizes: ProductSize[]) => {
    return selections[productId] || { size: sizes[0]?.size || '1/2bbl', quantity: 1 };
  }, [selections]);

  const updateSelection = (productId: string, field: 'size' | 'quantity', value: string | number) => {
    setSelections((prev) => {
      const existing = prev[productId] || { size: '1/2bbl' as KegSize, quantity: 1 };
      return { ...prev, [productId]: { ...existing, [field]: value } };
    });
  };

  const addToCart = (product: Product) => {
    const sel = getSelection(product.id, product.sizes);
    const sizeInfo = product.sizes.find((s) => s.size === sel.size);
    if (!sizeInfo || sel.quantity < 1) return;

    setCart((prev) => {
      const existingIdx = prev.findIndex((item) => item.productId === product.id && item.size === sel.size);
      if (existingIdx >= 0) {
        const updated = [...prev];
        updated[existingIdx] = { ...updated[existingIdx], quantity: updated[existingIdx].quantity + sel.quantity };
        return updated;
      }
      return [...prev, {
        productId: product.id, productName: product.name, size: sel.size,
        quantity: sel.quantity, unitPrice: sizeInfo.price, deposit: sizeInfo.deposit,
      }];
    });

    setSelections((prev) => ({ ...prev, [product.id]: { ...sel, quantity: 1 } }));
    setToastMsg(`${product.name} (${SIZE_SHORT[sel.size]}) added to cart`);
  };

  const removeFromCart = (index: number) => setCart((prev) => prev.filter((_, i) => i !== index));

  const updateCartQty = (index: number, qty: number) => {
    if (qty < 1) return;
    setCart((prev) => prev.map((item, i) => (i === index ? { ...item, quantity: qty } : item)));
  };

  const addKegReturn = (size: KegSize) => {
    setKegReturns((prev) => {
      const existing = prev.find((r) => r.size === size);
      if (existing) return prev.map((r) => r.size === size ? { ...r, quantity: r.quantity + 1 } : r);
      return [...prev, { size, quantity: 1 }];
    });
  };

  const updateReturnQty = (size: KegSize, qty: number) => {
    if (qty < 1) { setKegReturns((prev) => prev.filter((r) => r.size !== size)); return; }
    setKegReturns((prev) => prev.map((r) => (r.size === size ? { ...r, quantity: qty } : r)));
  };

  const removeReturn = (size: KegSize) => setKegReturns((prev) => prev.filter((r) => r.size !== size));

  const handleCheckout = () => { if (cart.length === 0) return; setCheckoutOpen(true); setCartOpen(false); };

  const handleSubmit = async () => {
    setSubmitError('');
    let customerId = selectedCustomerId;
    if (!isNewCustomer && !customerId) { setSubmitError('Please select a customer.'); return; }
    if (isNewCustomer && (!newCustomer.businessName || !newCustomer.contactName || !newCustomer.email)) {
      setSubmitError('Business name, contact name, and email are required.'); return;
    }
    if (!deliveryDate) { setSubmitError('Please select a delivery date.'); return; }
    setSubmitting(true);
    try {
      if (isNewCustomer) {
        const custRes = await fetch('/api/customers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newCustomer) });
        if (!custRes.ok) throw new Error('Failed to create customer');
        const cust: Customer = await custRes.json();
        customerId = cust.id;
      }
      const items = cart.map((item) => ({
        productId: item.productId, productName: item.productName, size: item.size,
        quantity: item.quantity, unitPrice: item.unitPrice, deposit: item.deposit,
      }));
      const orderRes = await fetch('/api/orders', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId, items, kegReturns, subtotal, totalDeposit, total, deliveryDate, notes }),
      });
      if (!orderRes.ok) throw new Error('Failed to create order');
      const order = await orderRes.json();
      router.push(`/order/confirmation?orderId=${order.id}`);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  };

  const minDate = new Date();
  minDate.setDate(minDate.getDate() + 1);
  const minDateStr = minDate.toISOString().split('T')[0];

  return (
    <div className="min-h-screen bg-charcoal font-body">
      {/* Toast */}
      {toastMsg && <Toast message={toastMsg} onClose={() => setToastMsg('')} />}

      {/* Header */}
      <header className="sticky top-0 z-30 bg-charcoal/95 backdrop-blur-md border-b border-white/[0.06]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16">
          <Link href="/" className="flex items-center gap-3 group">
            <Image src="/logo.png" alt="Guidon Brewing" width={350} height={194} className="h-8 w-auto rounded-lg" />
            <div className="hidden sm:block">
              <h1 className="font-heading text-sm font-bold text-cream tracking-wide">GUIDON BREWING</h1>
              <p className="text-[10px] uppercase tracking-[0.15em] text-cream/30 font-medium -mt-0.5">Wholesale Orders</p>
            </div>
          </Link>

          <button
            onClick={() => setCartOpen(true)}
            className={cn(
              'relative flex items-center gap-2 px-4 py-2 rounded-xl transition-all duration-200',
              cartCount > 0
                ? 'bg-gold/10 border border-gold/30 text-gold hover:bg-gold/15'
                : 'bg-white/5 border border-white/10 text-cream/50 hover:bg-white/10'
            )}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
            </svg>
            {cartCount > 0 ? (
              <span className="text-sm font-heading font-bold">{cartCount} &middot; {formatCurrency(total)}</span>
            ) : (
              <span className="hidden sm:inline text-sm font-medium">Cart</span>
            )}
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page header */}
        <div className="mb-8">
          <span className="section-label mb-2 block">Craft Beer Catalog</span>
          <h2 className="font-heading text-display-sm text-cream mb-3">
            Order Kegs
          </h2>
          <p className="text-cream/40 text-base max-w-lg">
            Browse our lineup, pick your sizes, and build your wholesale order. Pay on delivery.
          </p>
        </div>

        {/* Search & Filters */}
        <div className="mb-8 space-y-4">
          <div className="relative max-w-md">
            <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-cream/25" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search beers..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input pl-11"
            />
          </div>

          <div className="flex flex-wrap gap-2 items-center">
            {categories.length > 2 && categories.map((c) => (
              <button
                key={c}
                onClick={() => setCategoryFilter(c)}
                className={cn(
                  'px-4 py-2 rounded-xl text-xs font-heading font-bold transition-all duration-150',
                  categoryFilter === c
                    ? 'bg-gold text-charcoal'
                    : 'bg-charcoal-200 text-cream/40 border border-white/[0.08] hover:border-white/20 hover:text-cream/60'
                )}
              >
                {c}
              </button>
            ))}

            {categories.length > 2 && <div className="w-px h-6 bg-white/[0.08] mx-1" />}

            {SIZE_FILTERS.map((s) => (
              <button
                key={s}
                onClick={() => setSizeFilter(s)}
                className={cn(
                  'px-4 py-2 rounded-xl text-xs font-heading font-bold transition-all duration-150',
                  sizeFilter === s
                    ? 'bg-olive text-cream'
                    : 'bg-charcoal-200 text-cream/40 border border-white/[0.08] hover:border-white/20 hover:text-cream/60'
                )}
              >
                {s === 'All' ? 'All Sizes' : SIZE_LABELS[s as KegSize]}
              </button>
            ))}
          </div>
        </div>

        {/* Product Grid */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {Array.from({ length: 8 }).map((_, i) => <ProductSkeleton key={i} />)}
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-charcoal-200 flex items-center justify-center">
              <svg className="w-7 h-7 text-cream/15" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <p className="text-cream/30 text-base mb-2">No beers match your filters.</p>
            <button onClick={() => { setSearch(''); setSizeFilter('All'); setCategoryFilter('All'); }} className="btn-ghost text-sm text-gold">
              Clear all filters
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {filteredProducts.map((product, idx) => {
              const sel = getSelection(product.id, product.sizes);
              const currentSizeInfo = product.sizes.find((s) => s.size === sel.size);
              const isExpanded = expandedProduct === product.id;
              const colorGrad = BEER_COLORS[product.category] || 'from-gold/20 to-amber-800/15';

              return (
                <div
                  key={product.id}
                  className="card-product flex flex-col animate-slide-up"
                  style={{ animationDelay: `${Math.min(idx * 40, 250)}ms` }}
                >
                  {/* Beer color header */}
                  <div className={cn('h-28 bg-gradient-to-br relative', colorGrad)}>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="text-center">
                        <span className="text-4xl font-heading font-black text-white/20">{product.abv}%</span>
                      </div>
                    </div>
                    <div className="absolute top-3 left-3">
                      <span className="badge-sm bg-black/40 text-white/80 backdrop-blur-sm">{product.category}</span>
                    </div>
                    {product.available && (
                      <div className="absolute top-3 right-3">
                        <span className="badge-sm bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">In Stock</span>
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="p-5 flex flex-col flex-1">
                    <button
                      onClick={() => setExpandedProduct(isExpanded ? null : product.id)}
                      className="text-left mb-3"
                    >
                      <h3 className="font-heading text-base font-bold text-cream leading-tight hover:text-gold transition-colors">
                        {product.name}
                      </h3>
                      <p className="text-xs text-cream/35 mt-1">{product.style}</p>
                    </button>

                    {/* Expandable description */}
                    {isExpanded && (
                      <p className="text-sm text-cream/50 mb-4 leading-relaxed animate-fade-in">
                        {product.description}
                      </p>
                    )}

                    {!isExpanded && (
                      <p className="text-xs text-cream/30 mb-4 line-clamp-2 leading-relaxed flex-1">
                        {product.description}
                      </p>
                    )}

                    {/* Price */}
                    {currentSizeInfo && (
                      <div className="mb-4 flex items-baseline gap-2">
                        <span className="text-xl font-heading font-black text-cream">
                          {formatCurrency(currentSizeInfo.price)}
                        </span>
                        <span className="text-xs text-cream/25">/ keg</span>
                        <span className="text-xs text-gold/50 ml-auto">
                          +{formatCurrency(currentSizeInfo.deposit)} dep.
                        </span>
                      </div>
                    )}

                    {/* Size pills */}
                    <div className="flex gap-1.5 mb-3">
                      {product.sizes.map((s) => (
                        <button
                          key={s.size}
                          onClick={() => updateSelection(product.id, 'size', s.size)}
                          className={cn(
                            'flex-1 py-1.5 rounded-lg text-[11px] font-heading font-bold transition-all duration-150',
                            sel.size === s.size
                              ? 'bg-gold text-charcoal'
                              : 'bg-charcoal-300 text-cream/40 hover:text-cream/60 hover:bg-charcoal-400'
                          )}
                        >
                          {SIZE_SHORT[s.size]}
                        </button>
                      ))}
                    </div>

                    {/* Qty + Add */}
                    <div className="flex gap-2 items-center">
                      <div className="flex items-center border border-white/[0.08] rounded-lg overflow-hidden">
                        <button
                          onClick={() => updateSelection(product.id, 'quantity', Math.max(1, sel.quantity - 1))}
                          className="px-3 py-2 text-cream/40 hover:text-cream hover:bg-white/5 transition-colors"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeWidth={2} d="M20 12H4" /></svg>
                        </button>
                        <span className="px-3 py-2 text-sm font-bold text-cream min-w-[2.5rem] text-center bg-charcoal-200">
                          {sel.quantity}
                        </span>
                        <button
                          onClick={() => updateSelection(product.id, 'quantity', sel.quantity + 1)}
                          className="px-3 py-2 text-cream/40 hover:text-cream hover:bg-white/5 transition-colors"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                        </button>
                      </div>
                      <button
                        onClick={() => addToCart(product)}
                        className="btn-primary flex-1 py-2.5 text-xs"
                      >
                        Add to Cart
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Cart Overlay */}
      {cartOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 animate-fade-in" onClick={() => setCartOpen(false)} />
      )}

      {/* Slide-out Cart */}
      <div className={cn(
        'fixed top-0 right-0 h-full w-full sm:w-[420px] bg-charcoal-100 border-l border-white/[0.08] z-50 flex flex-col transition-transform duration-300 ease-out',
        cartOpen ? 'translate-x-0' : 'translate-x-full'
      )}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
          <div>
            <h3 className="font-heading text-lg font-bold text-cream">Your Order</h3>
            <p className="text-xs text-cream/30">{cartCount} item{cartCount !== 1 ? 's' : ''}</p>
          </div>
          <button onClick={() => setCartOpen(false)} className="p-2 hover:bg-white/5 rounded-lg transition-colors text-cream/30 hover:text-cream">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {cart.length === 0 ? (
            <div className="text-center py-16">
              <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-charcoal-300 flex items-center justify-center">
                <svg className="w-6 h-6 text-cream/15" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
                </svg>
              </div>
              <p className="text-cream/30 text-sm font-medium">Cart is empty</p>
              <p className="text-cream/15 text-xs mt-1">Add some kegs to get started.</p>
            </div>
          ) : (
            <>
              {cart.map((item, idx) => (
                <div key={`${item.productId}-${item.size}`} className="flex items-center gap-3 p-3 rounded-xl bg-charcoal-200 border border-white/[0.04] animate-fade-in">
                  <div className="w-11 h-11 rounded-lg bg-gold/10 flex items-center justify-center shrink-0">
                    <span className="text-gold text-[10px] font-heading font-bold">{SIZE_SHORT[item.size]}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-heading font-bold text-cream text-sm truncate">{item.productName}</p>
                    <p className="text-xs text-cream/25 mt-0.5">
                      {formatCurrency(item.unitPrice)} + {formatCurrency(item.deposit)} dep.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center border border-white/[0.08] rounded-lg overflow-hidden">
                      <button onClick={() => updateCartQty(idx, item.quantity - 1)} className="px-2 py-1 text-cream/30 hover:text-cream hover:bg-white/5 text-xs">-</button>
                      <span className="px-2 py-1 text-xs font-bold text-cream bg-charcoal-300 min-w-[1.8rem] text-center">{item.quantity}</span>
                      <button onClick={() => updateCartQty(idx, item.quantity + 1)} className="px-2 py-1 text-cream/30 hover:text-cream hover:bg-white/5 text-xs">+</button>
                    </div>
                    <button onClick={() => removeFromCart(idx)} className="p-1 text-cream/15 hover:text-red-400 transition-colors" aria-label="Remove">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}

              {/* Keg Returns */}
              <div className="pt-4">
                <span className="section-label mb-3 block">Keg Returns</span>
                <p className="text-xs text-cream/25 mb-3">Return empty kegs to reduce deposit charges.</p>
                <div className="flex gap-2 mb-3">
                  {KEG_SIZES.map((size) => (
                    <button key={size} onClick={() => addKegReturn(size)}
                      className="flex-1 text-[11px] font-heading font-bold py-2 rounded-lg bg-charcoal-300 border border-white/[0.06] text-cream/40 hover:text-olive-300 hover:border-olive/30 transition-all">
                      + {SIZE_SHORT[size]}
                    </button>
                  ))}
                </div>
                {kegReturns.map((ret) => (
                  <div key={ret.size} className="flex items-center gap-3 mb-2">
                    <span className="text-sm text-cream/60 flex-1">
                      {SIZE_LABELS[ret.size]}{' '}
                      <span className="text-xs text-emerald-400/60">(-{formatCurrency(KEG_DEPOSITS[ret.size])}/ea)</span>
                    </span>
                    <div className="flex items-center border border-white/[0.08] rounded-lg overflow-hidden">
                      <button onClick={() => updateReturnQty(ret.size, ret.quantity - 1)} className="px-2 py-1 text-cream/30 hover:text-cream text-xs">-</button>
                      <span className="px-2 py-1 text-xs font-bold text-cream bg-charcoal-300 min-w-[1.8rem] text-center">{ret.quantity}</span>
                      <button onClick={() => updateReturnQty(ret.size, ret.quantity + 1)} className="px-2 py-1 text-cream/30 hover:text-cream text-xs">+</button>
                    </div>
                    <button onClick={() => removeReturn(ret.size)} className="p-1 text-cream/15 hover:text-red-400 transition-colors" aria-label="Remove return">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Cart Footer */}
        {cart.length > 0 && (
          <div className="border-t border-white/[0.06] px-6 py-5 bg-charcoal-200 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-cream/35">Subtotal</span>
              <span className="text-cream font-medium">{formatCurrency(subtotal)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-cream/35">Keg Deposits</span>
              <span className="text-cream font-medium">{formatCurrency(depositFromItems)}</span>
            </div>
            {depositFromReturns > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-emerald-400/60">Return Credits</span>
                <span className="text-emerald-400 font-medium">-{formatCurrency(depositFromReturns)}</span>
              </div>
            )}
            <div className="flex justify-between text-lg font-heading font-black pt-3 border-t border-white/[0.06]">
              <span className="text-cream">Total</span>
              <span className="text-gold">{formatCurrency(total)}</span>
            </div>
            <button onClick={handleCheckout} className="btn-primary w-full mt-3 py-3 text-sm">
              Checkout
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* Checkout Modal */}
      {checkoutOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in" onClick={() => setCheckoutOpen(false)} />
          <div className="relative bg-charcoal-100 rounded-2xl border border-white/[0.08] w-full max-w-lg max-h-[90vh] overflow-y-auto animate-scale-in">
            <div className="px-6 py-5 border-b border-white/[0.06]">
              <h3 className="font-heading text-xl font-bold text-cream">Checkout</h3>
              <p className="text-sm text-cream/25 mt-1">
                {cart.length} item{cart.length !== 1 ? 's' : ''} &middot; {formatCurrency(total)}
              </p>
            </div>

            <div className="px-6 py-5 space-y-5">
              {/* Customer Selection */}
              <div>
                <span className="section-label mb-3 block">Customer</span>
                <div className="flex gap-2 mb-3">
                  <button onClick={() => setIsNewCustomer(false)}
                    className={cn('text-xs font-heading font-bold px-4 py-2 rounded-lg transition-all', !isNewCustomer ? 'bg-gold text-charcoal' : 'bg-charcoal-300 text-cream/40 hover:text-cream/60')}>
                    Existing Customer
                  </button>
                  <button onClick={() => setIsNewCustomer(true)}
                    className={cn('text-xs font-heading font-bold px-4 py-2 rounded-lg transition-all', isNewCustomer ? 'bg-gold text-charcoal' : 'bg-charcoal-300 text-cream/40 hover:text-cream/60')}>
                    New Customer
                  </button>
                </div>
                {!isNewCustomer ? (
                  <select value={selectedCustomerId} onChange={(e) => setSelectedCustomerId(e.target.value)} className="input">
                    <option value="">Select a customer...</option>
                    {customers.map((c) => (<option key={c.id} value={c.id}>{c.businessName} ({c.contactName})</option>))}
                  </select>
                ) : (
                  <div className="space-y-3">
                    <input type="text" placeholder="Business Name *" value={newCustomer.businessName}
                      onChange={(e) => setNewCustomer((prev) => ({ ...prev, businessName: e.target.value }))} className="input" />
                    <input type="text" placeholder="Contact Name *" value={newCustomer.contactName}
                      onChange={(e) => setNewCustomer((prev) => ({ ...prev, contactName: e.target.value }))} className="input" />
                    <input type="email" placeholder="Email *" value={newCustomer.email}
                      onChange={(e) => setNewCustomer((prev) => ({ ...prev, email: e.target.value }))} className="input" />
                    <input type="tel" placeholder="Phone" value={newCustomer.phone}
                      onChange={(e) => setNewCustomer((prev) => ({ ...prev, phone: e.target.value }))} className="input" />
                    <input type="text" placeholder="Address" value={newCustomer.address}
                      onChange={(e) => setNewCustomer((prev) => ({ ...prev, address: e.target.value }))} className="input" />
                  </div>
                )}
              </div>

              <div>
                <span className="section-label mb-2 block">Delivery Date</span>
                <input type="date" value={deliveryDate} min={minDateStr}
                  onChange={(e) => setDeliveryDate(e.target.value)} className="input" />
              </div>

              <div>
                <span className="section-label mb-2 block">Order Notes</span>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
                  placeholder="Special instructions, loading dock info, etc." rows={3} className="input resize-none" />
              </div>

              {/* Order Summary */}
              <div className="bg-charcoal-200 border border-white/[0.06] rounded-xl p-4 space-y-1.5">
                <span className="section-label mb-2 block">Order Summary</span>
                {cart.map((item) => (
                  <div key={`${item.productId}-${item.size}`} className="flex justify-between text-sm">
                    <span className="text-cream/35">{item.productName} ({SIZE_SHORT[item.size]}) x{item.quantity}</span>
                    <span className="text-cream/60 font-medium">{formatCurrency(item.unitPrice * item.quantity)}</span>
                  </div>
                ))}
                <div className="border-t border-white/[0.06] pt-2 mt-2 space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-cream/35">Subtotal</span>
                    <span className="text-cream/60">{formatCurrency(subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-cream/35">Net Deposits</span>
                    <span className="text-cream/60">{formatCurrency(totalDeposit)}</span>
                  </div>
                  <div className="flex justify-between font-heading font-bold text-cream pt-2 border-t border-white/[0.06]">
                    <span>Total Due on Delivery</span>
                    <span className="text-gold">{formatCurrency(total)}</span>
                  </div>
                </div>
              </div>

              {submitError && <p className="text-red-400 text-sm bg-red-500/10 rounded-xl px-4 py-3 border border-red-500/20">{submitError}</p>}
            </div>

            <div className="px-6 py-4 border-t border-white/[0.06] flex gap-3">
              <button onClick={() => { setCheckoutOpen(false); setCartOpen(true); }} className="btn-secondary flex-1 text-center">
                Back
              </button>
              <button onClick={handleSubmit} disabled={submitting}
                className={cn('btn-primary flex-1', submitting && 'opacity-60 cursor-not-allowed')}>
                {submitting ? 'Placing Order...' : 'Place Order'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
