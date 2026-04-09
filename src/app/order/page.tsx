'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { Product, ProductSize, CartItem, KegReturn, KegSize, Customer } from '@/lib/types';
import { KEG_DEPOSITS } from '@/lib/types';
import { formatCurrency, cn } from '@/lib/utils';

const KEG_SIZES: KegSize[] = ['1/2bbl', '1/4bbl', '1/6bbl'];
const SIZE_FILTERS = ['All', ...KEG_SIZES] as const;

function ProductSkeleton() {
  return (
    <div className="card">
      <div className="skeleton h-6 w-3/4 mb-3" />
      <div className="skeleton h-4 w-1/2 mb-2" />
      <div className="skeleton h-4 w-1/3 mb-4" />
      <div className="skeleton h-16 w-full mb-4" />
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

  // Data
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [sizeFilter, setSizeFilter] = useState<string>('All');
  const [categoryFilter, setCategoryFilter] = useState<string>('All');

  // Cart
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [kegReturns, setKegReturns] = useState<KegReturn[]>([]);

  // Product selection state: productId -> { size, quantity }
  const [selections, setSelections] = useState<
    Record<string, { size: KegSize; quantity: number }>
  >({});

  // Checkout
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [isNewCustomer, setIsNewCustomer] = useState(false);
  const [newCustomer, setNewCustomer] = useState({
    businessName: '',
    contactName: '',
    email: '',
    phone: '',
    address: '',
  });
  const [deliveryDate, setDeliveryDate] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // Fetch data
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
        // Silent fail - empty state will show
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  // Derived: categories
  const categories = useMemo(() => {
    const cats = new Set(products.map((p) => p.category));
    return ['All', ...Array.from(cats).sort()];
  }, [products]);

  // Filtered products
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchesSearch =
        !search ||
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.style.toLowerCase().includes(search.toLowerCase());
      const matchesSize =
        sizeFilter === 'All' ||
        p.sizes.some((s) => s.size === sizeFilter);
      const matchesCategory =
        categoryFilter === 'All' || p.category === categoryFilter;
      return matchesSearch && matchesSize && matchesCategory;
    });
  }, [products, search, sizeFilter, categoryFilter]);

  // Cart calculations
  const subtotal = useMemo(
    () => cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0),
    [cart]
  );

  const depositFromItems = useMemo(
    () => cart.reduce((sum, item) => sum + item.deposit * item.quantity, 0),
    [cart]
  );

  const depositFromReturns = useMemo(
    () =>
      kegReturns.reduce(
        (sum, ret) => sum + KEG_DEPOSITS[ret.size] * ret.quantity,
        0
      ),
    [kegReturns]
  );

  const totalDeposit = depositFromItems - depositFromReturns;
  const total = subtotal + totalDeposit;

  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  // Selection helpers
  const getSelection = useCallback(
    (productId: string, sizes: ProductSize[]) => {
      return (
        selections[productId] || {
          size: sizes[0]?.size || '1/2bbl',
          quantity: 1,
        }
      );
    },
    [selections]
  );

  const updateSelection = (
    productId: string,
    field: 'size' | 'quantity',
    value: string | number
  ) => {
    setSelections((prev) => {
      const existing = prev[productId] || { size: '1/2bbl' as KegSize, quantity: 1 };
      return {
        ...prev,
        [productId]: { ...existing, [field]: value },
      };
    });
  };

  // Cart actions
  const addToCart = (product: Product) => {
    const sel = getSelection(product.id, product.sizes);
    const sizeInfo = product.sizes.find((s) => s.size === sel.size);
    if (!sizeInfo || sel.quantity < 1) return;

    setCart((prev) => {
      const existingIdx = prev.findIndex(
        (item) => item.productId === product.id && item.size === sel.size
      );
      if (existingIdx >= 0) {
        const updated = [...prev];
        updated[existingIdx] = {
          ...updated[existingIdx],
          quantity: updated[existingIdx].quantity + sel.quantity,
        };
        return updated;
      }
      return [
        ...prev,
        {
          productId: product.id,
          productName: product.name,
          size: sel.size,
          quantity: sel.quantity,
          unitPrice: sizeInfo.price,
          deposit: sizeInfo.deposit,
        },
      ];
    });

    // Reset quantity for this product
    setSelections((prev) => ({
      ...prev,
      [product.id]: { ...sel, quantity: 1 },
    }));

    setCartOpen(true);
  };

  const removeFromCart = (index: number) => {
    setCart((prev) => prev.filter((_, i) => i !== index));
  };

  const updateCartQty = (index: number, qty: number) => {
    if (qty < 1) return;
    setCart((prev) =>
      prev.map((item, i) => (i === index ? { ...item, quantity: qty } : item))
    );
  };

  // Keg return actions
  const addKegReturn = (size: KegSize) => {
    setKegReturns((prev) => {
      const existing = prev.find((r) => r.size === size);
      if (existing) {
        return prev.map((r) =>
          r.size === size ? { ...r, quantity: r.quantity + 1 } : r
        );
      }
      return [...prev, { size, quantity: 1 }];
    });
  };

  const updateReturnQty = (size: KegSize, qty: number) => {
    if (qty < 1) {
      setKegReturns((prev) => prev.filter((r) => r.size !== size));
      return;
    }
    setKegReturns((prev) =>
      prev.map((r) => (r.size === size ? { ...r, quantity: qty } : r))
    );
  };

  const removeReturn = (size: KegSize) => {
    setKegReturns((prev) => prev.filter((r) => r.size !== size));
  };

  // Checkout
  const handleCheckout = () => {
    if (cart.length === 0) return;
    setCheckoutOpen(true);
    setCartOpen(false);
  };

  const handleSubmit = async () => {
    setSubmitError('');
    let customerId = selectedCustomerId;

    // Validate
    if (!isNewCustomer && !customerId) {
      setSubmitError('Please select a customer.');
      return;
    }
    if (isNewCustomer && (!newCustomer.businessName || !newCustomer.contactName || !newCustomer.email)) {
      setSubmitError('Business name, contact name, and email are required.');
      return;
    }
    if (!deliveryDate) {
      setSubmitError('Please select a delivery date.');
      return;
    }

    setSubmitting(true);

    try {
      // Create customer if new
      if (isNewCustomer) {
        const custRes = await fetch('/api/customers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newCustomer),
        });
        if (!custRes.ok) throw new Error('Failed to create customer');
        const cust: Customer = await custRes.json();
        customerId = cust.id;
      }

      // Build order items
      const items = cart.map((item) => ({
        productId: item.productId,
        productName: item.productName,
        size: item.size,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        deposit: item.deposit,
      }));

      const orderPayload = {
        customerId,
        items,
        kegReturns,
        subtotal,
        totalDeposit,
        total,
        deliveryDate,
        notes,
      };

      const orderRes = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderPayload),
      });

      if (!orderRes.ok) throw new Error('Failed to create order');
      const order = await orderRes.json();

      router.push(`/order/confirmation?orderId=${order.id}`);
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : 'Something went wrong.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  // Min delivery date: tomorrow
  const minDate = new Date();
  minDate.setDate(minDate.getDate() + 1);
  const minDateStr = minDate.toISOString().split('T')[0];

  return (
    <div className="min-h-screen bg-cream font-body">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-olive text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-amber rounded-full flex items-center justify-center">
              <span className="text-brown font-heading font-bold text-sm">G</span>
            </div>
            <h1 className="font-heading text-lg sm:text-xl font-semibold">
              Guidon Brewing
            </h1>
          </div>
          <button
            onClick={() => setCartOpen(true)}
            className="relative flex items-center gap-2 bg-olive-600 hover:bg-olive-800 px-4 py-2 rounded-lg transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z"
              />
            </svg>
            <span className="hidden sm:inline text-sm font-medium">Cart</span>
            {cartCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-amber text-brown text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center">
                {cartCount}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="mb-6">
          <h2 className="font-heading text-2xl sm:text-3xl font-bold text-brown mb-1">
            Order Kegs
          </h2>
          <p className="text-brown-200 text-sm">
            Browse our catalog and build your order.
          </p>
        </div>

        {/* Search & Filters */}
        <div className="mb-6 space-y-4">
          <input
            type="text"
            placeholder="Search beers by name or style..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input max-w-md"
          />

          <div className="flex flex-wrap gap-2">
            <span className="text-xs font-semibold text-olive uppercase tracking-wider self-center mr-1">
              Size:
            </span>
            {SIZE_FILTERS.map((s) => (
              <button
                key={s}
                onClick={() => setSizeFilter(s)}
                className={cn(
                  'px-3 py-1.5 rounded-full text-xs font-medium transition-colors',
                  sizeFilter === s
                    ? 'bg-olive text-white'
                    : 'bg-white text-brown border border-cream-200 hover:border-olive'
                )}
              >
                {s}
              </button>
            ))}

            {categories.length > 2 && (
              <>
                <span className="text-xs font-semibold text-olive uppercase tracking-wider self-center ml-3 mr-1">
                  Style:
                </span>
                {categories.map((c) => (
                  <button
                    key={c}
                    onClick={() => setCategoryFilter(c)}
                    className={cn(
                      'px-3 py-1.5 rounded-full text-xs font-medium transition-colors',
                      categoryFilter === c
                        ? 'bg-amber text-brown'
                        : 'bg-white text-brown border border-cream-200 hover:border-amber'
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <ProductSkeleton key={i} />
            ))}
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-brown-200 text-lg">No products found.</p>
            <button
              onClick={() => {
                setSearch('');
                setSizeFilter('All');
                setCategoryFilter('All');
              }}
              className="btn-outline mt-4 text-sm"
            >
              Clear Filters
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {filteredProducts.map((product) => {
              const sel = getSelection(product.id, product.sizes);
              const currentSizeInfo = product.sizes.find(
                (s) => s.size === sel.size
              );

              return (
                <div key={product.id} className="card flex flex-col">
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="font-heading text-lg font-semibold text-brown leading-tight">
                      {product.name}
                    </h3>
                    <span className="badge bg-olive-100 text-olive-700 ml-2 shrink-0">
                      {product.abv}% ABV
                    </span>
                  </div>
                  <p className="text-xs font-medium text-amber-600 uppercase tracking-wider mb-2">
                    {product.style}
                  </p>
                  <p className="text-sm text-brown-200 mb-4 flex-1 line-clamp-2">
                    {product.description}
                  </p>

                  {currentSizeInfo && (
                    <div className="mb-3 flex items-baseline gap-2">
                      <span className="text-lg font-semibold text-brown">
                        {formatCurrency(currentSizeInfo.price)}
                      </span>
                      <span className="text-xs text-brown-200">
                        + {formatCurrency(currentSizeInfo.deposit)} deposit
                      </span>
                    </div>
                  )}

                  <div className="flex gap-2 items-end">
                    <div className="flex-1">
                      <label className="text-xs text-brown-200 block mb-1">
                        Size
                      </label>
                      <select
                        value={sel.size}
                        onChange={(e) =>
                          updateSelection(
                            product.id,
                            'size',
                            e.target.value as KegSize
                          )
                        }
                        className="input text-sm py-2"
                      >
                        {product.sizes.map((s) => (
                          <option key={s.size} value={s.size}>
                            {s.size}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="w-20">
                      <label className="text-xs text-brown-200 block mb-1">
                        Qty
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={sel.quantity}
                        onChange={(e) =>
                          updateSelection(
                            product.id,
                            'quantity',
                            Math.max(1, parseInt(e.target.value) || 1)
                          )
                        }
                        className="input text-sm py-2 text-center"
                      />
                    </div>

                    <button
                      onClick={() => addToCart(product)}
                      className="btn-primary text-sm py-2 px-4 whitespace-nowrap"
                    >
                      Add
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
        <div
          className="fixed inset-0 bg-black/30 z-40"
          onClick={() => setCartOpen(false)}
        />
      )}

      {/* Slide-out Cart Panel */}
      <div
        className={cn(
          'fixed top-0 right-0 h-full w-full sm:w-[420px] bg-white shadow-2xl z-50 flex flex-col transition-transform duration-300 ease-out',
          cartOpen ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        {/* Cart Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-cream-200 bg-cream-50">
          <h3 className="font-heading text-lg font-semibold text-brown">
            Your Order
          </h3>
          <button
            onClick={() => setCartOpen(false)}
            className="p-1 hover:bg-cream-200 rounded transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5 text-brown"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Cart Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {cart.length === 0 ? (
            <p className="text-brown-200 text-sm text-center py-8">
              Your cart is empty. Add some kegs to get started.
            </p>
          ) : (
            <>
              {/* Cart Items */}
              {cart.map((item, idx) => (
                <div
                  key={`${item.productId}-${item.size}`}
                  className="flex items-start gap-3 pb-4 border-b border-cream-200 last:border-0"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-brown text-sm truncate">
                      {item.productName}
                    </p>
                    <p className="text-xs text-brown-200">{item.size}</p>
                    <p className="text-xs text-brown-200 mt-0.5">
                      {formatCurrency(item.unitPrice)} + {formatCurrency(item.deposit)} dep.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      value={item.quantity}
                      onChange={(e) =>
                        updateCartQty(idx, parseInt(e.target.value) || 1)
                      }
                      className="w-14 input text-sm py-1 text-center"
                    />
                    <button
                      onClick={() => removeFromCart(idx)}
                      className="p-1 text-red-400 hover:text-red-600 transition-colors"
                      aria-label="Remove item"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-4 w-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}

              {/* Keg Returns */}
              <div className="pt-2">
                <h4 className="font-heading text-sm font-semibold text-brown mb-2">
                  Keg Returns
                </h4>
                <p className="text-xs text-brown-200 mb-3">
                  Return empty kegs to reduce your deposit charges.
                </p>
                <div className="flex gap-2 mb-3">
                  {KEG_SIZES.map((size) => (
                    <button
                      key={size}
                      onClick={() => addKegReturn(size)}
                      className="btn-outline text-xs py-1.5 px-3"
                    >
                      + {size}
                    </button>
                  ))}
                </div>
                {kegReturns.map((ret) => (
                  <div
                    key={ret.size}
                    className="flex items-center gap-3 mb-2"
                  >
                    <span className="text-sm text-brown flex-1">
                      {ret.size}{' '}
                      <span className="text-xs text-green-600">
                        (-{formatCurrency(KEG_DEPOSITS[ret.size])}/ea)
                      </span>
                    </span>
                    <input
                      type="number"
                      min={1}
                      value={ret.quantity}
                      onChange={(e) =>
                        updateReturnQty(
                          ret.size,
                          parseInt(e.target.value) || 0
                        )
                      }
                      className="w-14 input text-sm py-1 text-center"
                    />
                    <button
                      onClick={() => removeReturn(ret.size)}
                      className="p-1 text-red-400 hover:text-red-600 transition-colors"
                      aria-label="Remove return"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-4 w-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M6 18L18 6M6 6l12 12"
                        />
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
          <div className="border-t border-cream-200 px-6 py-4 bg-cream-50 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-brown-200">Subtotal</span>
              <span className="text-brown font-medium">
                {formatCurrency(subtotal)}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-brown-200">Deposits</span>
              <span className="text-brown font-medium">
                {formatCurrency(depositFromItems)}
              </span>
            </div>
            {depositFromReturns > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-green-600">Return Credits</span>
                <span className="text-green-600 font-medium">
                  -{formatCurrency(depositFromReturns)}
                </span>
              </div>
            )}
            <div className="flex justify-between text-base font-semibold pt-2 border-t border-cream-200">
              <span className="text-brown">Total</span>
              <span className="text-brown">{formatCurrency(total)}</span>
            </div>
            <button
              onClick={handleCheckout}
              className="btn-primary w-full mt-2 text-center"
            >
              Proceed to Checkout
            </button>
          </div>
        )}
      </div>

      {/* Checkout Modal */}
      {checkoutOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setCheckoutOpen(false)}
          />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto animate-slide-up">
            <div className="px-6 py-5 border-b border-cream-200">
              <h3 className="font-heading text-xl font-semibold text-brown">
                Checkout
              </h3>
              <p className="text-sm text-brown-200 mt-1">
                {cart.length} item{cart.length !== 1 ? 's' : ''} &middot;{' '}
                {formatCurrency(total)}
              </p>
            </div>

            <div className="px-6 py-5 space-y-5">
              {/* Customer Selection */}
              <div>
                <label className="block text-sm font-medium text-brown mb-2">
                  Customer
                </label>
                <div className="flex gap-3 mb-3">
                  <button
                    onClick={() => setIsNewCustomer(false)}
                    className={cn(
                      'text-sm px-3 py-1.5 rounded-lg font-medium transition-colors',
                      !isNewCustomer
                        ? 'bg-olive text-white'
                        : 'bg-cream text-brown hover:bg-cream-200'
                    )}
                  >
                    Existing
                  </button>
                  <button
                    onClick={() => setIsNewCustomer(true)}
                    className={cn(
                      'text-sm px-3 py-1.5 rounded-lg font-medium transition-colors',
                      isNewCustomer
                        ? 'bg-olive text-white'
                        : 'bg-cream text-brown hover:bg-cream-200'
                    )}
                  >
                    New Customer
                  </button>
                </div>

                {!isNewCustomer ? (
                  <select
                    value={selectedCustomerId}
                    onChange={(e) => setSelectedCustomerId(e.target.value)}
                    className="input"
                  >
                    <option value="">Select a customer...</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.businessName} ({c.contactName})
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="space-y-3">
                    <input
                      type="text"
                      placeholder="Business Name *"
                      value={newCustomer.businessName}
                      onChange={(e) =>
                        setNewCustomer((prev) => ({
                          ...prev,
                          businessName: e.target.value,
                        }))
                      }
                      className="input"
                    />
                    <input
                      type="text"
                      placeholder="Contact Name *"
                      value={newCustomer.contactName}
                      onChange={(e) =>
                        setNewCustomer((prev) => ({
                          ...prev,
                          contactName: e.target.value,
                        }))
                      }
                      className="input"
                    />
                    <input
                      type="email"
                      placeholder="Email *"
                      value={newCustomer.email}
                      onChange={(e) =>
                        setNewCustomer((prev) => ({
                          ...prev,
                          email: e.target.value,
                        }))
                      }
                      className="input"
                    />
                    <input
                      type="tel"
                      placeholder="Phone"
                      value={newCustomer.phone}
                      onChange={(e) =>
                        setNewCustomer((prev) => ({
                          ...prev,
                          phone: e.target.value,
                        }))
                      }
                      className="input"
                    />
                    <input
                      type="text"
                      placeholder="Address"
                      value={newCustomer.address}
                      onChange={(e) =>
                        setNewCustomer((prev) => ({
                          ...prev,
                          address: e.target.value,
                        }))
                      }
                      className="input"
                    />
                  </div>
                )}
              </div>

              {/* Delivery Date */}
              <div>
                <label className="block text-sm font-medium text-brown mb-2">
                  Delivery Date
                </label>
                <input
                  type="date"
                  value={deliveryDate}
                  min={minDateStr}
                  onChange={(e) => setDeliveryDate(e.target.value)}
                  className="input"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-brown mb-2">
                  Order Notes
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Special instructions, loading dock info, etc."
                  rows={3}
                  className="input resize-none"
                />
              </div>

              {/* Order Summary */}
              <div className="bg-cream-50 rounded-lg p-4 space-y-1.5">
                <p className="text-xs font-semibold text-olive uppercase tracking-wider mb-2">
                  Order Summary
                </p>
                {cart.map((item) => (
                  <div
                    key={`${item.productId}-${item.size}`}
                    className="flex justify-between text-sm"
                  >
                    <span className="text-brown-200">
                      {item.productName} ({item.size}) x{item.quantity}
                    </span>
                    <span className="text-brown">
                      {formatCurrency(item.unitPrice * item.quantity)}
                    </span>
                  </div>
                ))}
                <div className="border-t border-cream-200 pt-1.5 mt-2 space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-brown-200">Subtotal</span>
                    <span>{formatCurrency(subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-brown-200">Net Deposits</span>
                    <span>{formatCurrency(totalDeposit)}</span>
                  </div>
                  <div className="flex justify-between font-semibold text-brown">
                    <span>Total</span>
                    <span>{formatCurrency(total)}</span>
                  </div>
                </div>
              </div>

              {submitError && (
                <p className="text-red-600 text-sm">{submitError}</p>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-cream-200 flex gap-3">
              <button
                onClick={() => {
                  setCheckoutOpen(false);
                  setCartOpen(true);
                }}
                className="btn-outline flex-1 text-center"
              >
                Back to Cart
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className={cn(
                  'btn-primary flex-1 text-center',
                  submitting && 'opacity-60 cursor-not-allowed'
                )}
              >
                {submitting ? 'Placing Order...' : 'Place Order'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
