'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { Product, ProductSize, CartItem, KegReturn, KegSize, Customer } from '@/lib/types';
import { KEG_DEPOSITS } from '@/lib/types';
import { formatCurrency, cn } from '@/lib/utils';

const KEG_SIZES: KegSize[] = ['1/2bbl', '1/4bbl', '1/6bbl'];
const SIZE_LABELS: Record<KegSize, string> = { '1/2bbl': '1/2 Barrel', '1/4bbl': '1/4 Barrel', '1/6bbl': '1/6 Barrel' };
const SIZE_FILTERS = ['All', ...KEG_SIZES] as const;

function ProductSkeleton() {
  return (
    <div className="card">
      <div className="skeleton h-5 w-3/4 mb-3" />
      <div className="skeleton h-3 w-1/2 mb-2" />
      <div className="skeleton h-3 w-1/3 mb-4" />
      <div className="skeleton h-12 w-full mb-4" />
      <div className="flex gap-2">
        <div className="skeleton h-10 flex-1" />
        <div className="skeleton h-10 w-20" />
        <div className="skeleton h-10 w-28" />
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
    setCartOpen(true);
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
      {/* Header */}
      <header className="sticky top-0 z-30 bg-charcoal/95 backdrop-blur-md border-b border-white/[0.06]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="w-9 h-9 bg-gold-gradient rounded-lg flex items-center justify-center shadow-gold group-hover:shadow-gold-lg transition-shadow">
              <span className="text-charcoal font-heading font-black text-lg">G</span>
            </div>
            <div className="hidden sm:block">
              <h1 className="font-heading text-base font-bold text-cream tracking-wide">GUIDON BREWING</h1>
              <p className="text-[10px] uppercase tracking-[0.2em] text-gold/50 font-semibold -mt-0.5">Wholesale Orders</p>
            </div>
          </Link>
          <button
            onClick={() => setCartOpen(true)}
            className="relative flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-gold/30 px-4 py-2 rounded-lg transition-all duration-200"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-cream/70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
            </svg>
            <span className="hidden sm:inline text-sm font-medium text-cream/70">Cart</span>
            {cartCount > 0 && (
              <span className="absolute -top-2 -right-2 bg-gold text-charcoal text-xs font-black w-5 h-5 rounded-full flex items-center justify-center animate-scale-in shadow-gold">
                {cartCount}
              </span>
            )}
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="mb-8">
          <h2 className="font-heading text-3xl sm:text-4xl font-black text-cream mb-2">
            Order Kegs
          </h2>
          <p className="text-cream/40 text-sm">
            Browse our craft beer catalog and build your wholesale order.
          </p>
        </div>

        {/* Search & Filters */}
        <div className="mb-8 space-y-4">
          <div className="relative max-w-md">
            <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-cream/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search beers by name or style..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input pl-10"
            />
          </div>

          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-[10px] font-bold text-gold/60 uppercase tracking-[0.2em] mr-1">Size:</span>
            {SIZE_FILTERS.map((s) => (
              <button
                key={s}
                onClick={() => setSizeFilter(s)}
                className={cn(
                  'px-3 py-1.5 rounded-full text-xs font-semibold transition-all duration-200',
                  sizeFilter === s
                    ? 'bg-gold text-charcoal shadow-gold'
                    : 'bg-white/5 text-cream/50 border border-white/10 hover:border-gold/30 hover:text-cream/80'
                )}
              >
                {s}
              </button>
            ))}

            {categories.length > 2 && (
              <>
                <div className="w-px h-6 bg-white/10 mx-2" />
                <span className="text-[10px] font-bold text-gold/60 uppercase tracking-[0.2em] mr-1">Style:</span>
                {categories.map((c) => (
                  <button
                    key={c}
                    onClick={() => setCategoryFilter(c)}
                    className={cn(
                      'px-3 py-1.5 rounded-full text-xs font-semibold transition-all duration-200',
                      categoryFilter === c
                        ? 'bg-olive text-cream shadow-sm'
                        : 'bg-white/5 text-cream/50 border border-white/10 hover:border-olive/30 hover:text-cream/80'
                    )}
                  >
                    {c}
                  </button>
                ))}
              </>
            )}
          </div>
        </div>

        {/* Product Grid */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {Array.from({ length: 6 }).map((_, i) => <ProductSkeleton key={i} />)}
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-white/5 flex items-center justify-center">
              <svg className="w-8 h-8 text-cream/20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <p className="text-cream/30 text-lg mb-4">No products found.</p>
            <button onClick={() => { setSearch(''); setSizeFilter('All'); setCategoryFilter('All'); }} className="btn-outline text-sm">
              Clear Filters
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredProducts.map((product, idx) => {
              const sel = getSelection(product.id, product.sizes);
              const currentSizeInfo = product.sizes.find((s) => s.size === sel.size);

              return (
                <div
                  key={product.id}
                  className="card flex flex-col animate-slide-up group"
                  style={{ animationDelay: `${Math.min(idx * 50, 300)}ms` }}
                >
                  {/* Product header */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-heading text-lg font-bold text-cream leading-tight group-hover:text-gold transition-colors">
                        {product.name}
                      </h3>
                      <p className="text-xs font-bold text-gold/70 uppercase tracking-widest mt-1">
                        {product.style}
                      </p>
                    </div>
                    <span className="badge bg-olive/30 text-olive-300 border border-olive/30 ml-2 shrink-0">
                      {product.abv}%
                    </span>
                  </div>

                  <p className="text-sm text-cream/40 mb-4 flex-1 line-clamp-2 leading-relaxed">
                    {product.description}
                  </p>

                  {/* Price display */}
                  {currentSizeInfo && (
                    <div className="mb-4 p-3 rounded-lg bg-white/[0.03] border border-white/[0.04]">
                      <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-black text-cream">
                          {formatCurrency(currentSizeInfo.price)}
                        </span>
                        <span className="text-xs text-cream/30">per keg</span>
                      </div>
                      <p className="text-xs text-gold/50 mt-0.5">
                        + {formatCurrency(currentSizeInfo.deposit)} refundable deposit
                      </p>
                    </div>
                  )}

                  {/* Controls */}
                  <div className="flex gap-2 items-end">
                    <div className="flex-1">
                      <label className="text-[10px] font-bold text-cream/30 uppercase tracking-wider block mb-1">Size</label>
                      <select
                        value={sel.size}
                        onChange={(e) => updateSelection(product.id, 'size', e.target.value as KegSize)}
                        className="input text-sm py-2"
                      >
                        {product.sizes.map((s) => (
                          <option key={s.size} value={s.size}>{SIZE_LABELS[s.size]}</option>
                        ))}
                      </select>
                    </div>
                    <div className="w-20">
                      <label className="text-[10px] font-bold text-cream/30 uppercase tracking-wider block mb-1">Qty</label>
                      <input
                        type="number" min={1} value={sel.quantity}
                        onChange={(e) => updateSelection(product.id, 'quantity', Math.max(1, parseInt(e.target.value) || 1))}
                        className="input text-sm py-2 text-center"
                      />
                    </div>
                    <button
                      onClick={() => addToCart(product)}
                      className="btn-primary text-sm py-2 px-5 whitespace-nowrap rounded-lg"
                    >
                      Add to Cart
                    </button>
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
        'fixed top-0 right-0 h-full w-full sm:w-[440px] bg-charcoal border-l border-white/[0.06] shadow-dark-lg z-50 flex flex-col transition-transform duration-300 ease-out',
        cartOpen ? 'translate-x-0' : 'translate-x-full'
      )}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
          <div>
            <h3 className="font-heading text-lg font-bold text-cream">Your Order</h3>
            <p className="text-xs text-cream/30">{cartCount} item{cartCount !== 1 ? 's' : ''}</p>
          </div>
          <button onClick={() => setCartOpen(false)} className="p-2 hover:bg-white/5 rounded-lg transition-colors text-cream/40 hover:text-cream">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {cart.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-white/5 flex items-center justify-center">
                <svg className="w-8 h-8 text-cream/20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
                </svg>
              </div>
              <p className="text-cream/30 text-sm">Your cart is empty.</p>
              <p className="text-cream/20 text-xs mt-1">Add some kegs to get started.</p>
            </div>
          ) : (
            <>
              {cart.map((item, idx) => (
                <div key={`${item.productId}-${item.size}`} className="flex items-start gap-3 pb-4 border-b border-white/[0.06] last:border-0 animate-fade-in">
                  <div className="w-10 h-10 rounded-lg bg-gold/10 flex items-center justify-center shrink-0">
                    <span className="text-gold text-xs font-bold">{item.size}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-cream text-sm truncate">{item.productName}</p>
                    <p className="text-xs text-cream/30 mt-0.5">
                      {formatCurrency(item.unitPrice)} + {formatCurrency(item.deposit)} dep.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <input type="number" min={1} value={item.quantity}
                      onChange={(e) => updateCartQty(idx, parseInt(e.target.value) || 1)}
                      className="w-14 input text-sm py-1 text-center" />
                    <button onClick={() => removeFromCart(idx)} className="p-1 text-red-400/60 hover:text-red-400 transition-colors" aria-label="Remove">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}

              {/* Keg Returns */}
              <div className="pt-2">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-1 h-4 bg-gold rounded-full" />
                  <h4 className="font-heading text-sm font-bold text-cream">Keg Returns</h4>
                </div>
                <p className="text-xs text-cream/30 mb-3">Return empty kegs to reduce deposit charges.</p>
                <div className="flex gap-2 mb-3">
                  {KEG_SIZES.map((size) => (
                    <button key={size} onClick={() => addKegReturn(size)}
                      className="btn-outline text-xs py-1.5 px-3 border-olive/30 text-olive-300 hover:bg-olive/10">
                      + {size}
                    </button>
                  ))}
                </div>
                {kegReturns.map((ret) => (
                  <div key={ret.size} className="flex items-center gap-3 mb-2">
                    <span className="text-sm text-cream/70 flex-1">
                      {ret.size}{' '}
                      <span className="text-xs text-emerald-400/70">(-{formatCurrency(KEG_DEPOSITS[ret.size])}/ea)</span>
                    </span>
                    <input type="number" min={1} value={ret.quantity}
                      onChange={(e) => updateReturnQty(ret.size, parseInt(e.target.value) || 0)}
                      className="w-14 input text-sm py-1 text-center" />
                    <button onClick={() => removeReturn(ret.size)} className="p-1 text-red-400/60 hover:text-red-400 transition-colors" aria-label="Remove return">
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
          <div className="border-t border-white/[0.06] px-6 py-4 bg-charcoal-100 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-cream/40">Subtotal</span>
              <span className="text-cream font-medium">{formatCurrency(subtotal)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-cream/40">Keg Deposits</span>
              <span className="text-cream font-medium">{formatCurrency(depositFromItems)}</span>
            </div>
            {depositFromReturns > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-emerald-400/70">Return Credits</span>
                <span className="text-emerald-400 font-medium">-{formatCurrency(depositFromReturns)}</span>
              </div>
            )}
            <div className="flex justify-between text-lg font-black pt-3 border-t border-white/[0.06]">
              <span className="text-cream">Total</span>
              <span className="text-gold">{formatCurrency(total)}</span>
            </div>
            <button onClick={handleCheckout} className="btn-primary w-full mt-3 text-center py-3 text-base">
              Proceed to Checkout
            </button>
          </div>
        )}
      </div>

      {/* Checkout Modal */}
      {checkoutOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in" onClick={() => setCheckoutOpen(false)} />
          <div className="relative bg-charcoal-100 rounded-2xl shadow-dark-lg border border-white/[0.06] w-full max-w-lg max-h-[90vh] overflow-y-auto animate-scale-in">
            <div className="px-6 py-5 border-b border-white/[0.06]">
              <h3 className="font-heading text-xl font-bold text-cream">Checkout</h3>
              <p className="text-sm text-cream/30 mt-1">
                {cart.length} item{cart.length !== 1 ? 's' : ''} &middot; {formatCurrency(total)}
              </p>
            </div>

            <div className="px-6 py-5 space-y-5">
              {/* Customer Selection */}
              <div>
                <label className="block text-sm font-semibold text-cream/70 mb-2">Customer</label>
                <div className="flex gap-2 mb-3">
                  <button onClick={() => setIsNewCustomer(false)}
                    className={cn('text-sm px-4 py-2 rounded-lg font-semibold transition-all', !isNewCustomer ? 'bg-gold text-charcoal' : 'bg-white/5 text-cream/50 hover:bg-white/10')}>
                    Existing
                  </button>
                  <button onClick={() => setIsNewCustomer(true)}
                    className={cn('text-sm px-4 py-2 rounded-lg font-semibold transition-all', isNewCustomer ? 'bg-gold text-charcoal' : 'bg-white/5 text-cream/50 hover:bg-white/10')}>
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
                <label className="block text-sm font-semibold text-cream/70 mb-2">Delivery Date</label>
                <input type="date" value={deliveryDate} min={minDateStr}
                  onChange={(e) => setDeliveryDate(e.target.value)} className="input" />
              </div>

              <div>
                <label className="block text-sm font-semibold text-cream/70 mb-2">Order Notes</label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
                  placeholder="Special instructions, loading dock info, etc." rows={3} className="input resize-none" />
              </div>

              {/* Order Summary */}
              <div className="bg-white/[0.03] border border-white/[0.06] rounded-lg p-4 space-y-1.5">
                <p className="text-[10px] font-bold text-gold/70 uppercase tracking-[0.2em] mb-2">Order Summary</p>
                {cart.map((item) => (
                  <div key={`${item.productId}-${item.size}`} className="flex justify-between text-sm">
                    <span className="text-cream/40">{item.productName} ({item.size}) x{item.quantity}</span>
                    <span className="text-cream/70">{formatCurrency(item.unitPrice * item.quantity)}</span>
                  </div>
                ))}
                <div className="border-t border-white/[0.06] pt-2 mt-2 space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-cream/40">Subtotal</span>
                    <span className="text-cream/70">{formatCurrency(subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-cream/40">Net Deposits</span>
                    <span className="text-cream/70">{formatCurrency(totalDeposit)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-cream pt-1">
                    <span>Total</span>
                    <span className="text-gold">{formatCurrency(total)}</span>
                  </div>
                </div>
              </div>

              {submitError && <p className="text-red-400 text-sm bg-red-500/10 rounded-lg px-3 py-2 border border-red-500/20">{submitError}</p>}
            </div>

            <div className="px-6 py-4 border-t border-white/[0.06] flex gap-3">
              <button onClick={() => { setCheckoutOpen(false); setCartOpen(true); }} className="btn-outline flex-1 text-center">
                Back to Cart
              </button>
              <button onClick={handleSubmit} disabled={submitting}
                className={cn('btn-primary flex-1 text-center', submitting && 'opacity-60 cursor-not-allowed')}>
                {submitting ? 'Placing Order...' : 'Place Order'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
