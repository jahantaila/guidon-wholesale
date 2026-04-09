'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import Link from 'next/link';
import type { Order } from '@/lib/types';
import { formatCurrency, formatDate, getStatusColor, cn } from '@/lib/utils';
import { KEG_DEPOSITS } from '@/lib/types';

function ConfirmationContent() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get('orderId');

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!orderId) { setError('No order ID provided.'); setLoading(false); return; }
    async function fetchOrder() {
      try {
        const res = await fetch('/api/orders');
        if (!res.ok) throw new Error('Failed to fetch orders');
        const orders: Order[] = await res.json();
        const found = orders.find((o) => o.id === orderId);
        if (!found) setError('Order not found.');
        else setOrder(found);
      } catch { setError('Failed to load order details.'); }
      finally { setLoading(false); }
    }
    fetchOrder();
  }, [orderId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-charcoal flex items-center justify-center">
        <div className="text-center">
          <div className="skeleton w-20 h-20 rounded-full mx-auto mb-4" />
          <div className="skeleton h-6 w-48 mx-auto mb-2" />
          <div className="skeleton h-4 w-32 mx-auto" />
        </div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-screen bg-charcoal flex items-center justify-center px-4">
        <div className="card text-center max-w-md w-full">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.999L13.732 4.001c-.77-1.333-2.694-1.333-3.464 0L3.34 16.001c-.77 1.332.192 2.999 1.732 2.999z" />
            </svg>
          </div>
          <h2 className="font-heading text-xl font-bold text-cream mb-2">{error || 'Something went wrong'}</h2>
          <Link href="/order" className="btn-primary inline-block mt-4">Place a New Order</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-charcoal font-body">
      <header className="border-b border-white/[0.06]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center h-16">
          <Link href="/" className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gold-gradient rounded-lg flex items-center justify-center shadow-gold">
              <span className="text-charcoal font-heading font-black text-lg">G</span>
            </div>
            <h1 className="font-heading text-base font-bold text-cream tracking-wide">GUIDON BREWING</h1>
          </Link>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        {/* Success Animation */}
        <div className="text-center mb-8 animate-fade-in">
          <div className="relative w-20 h-20 mx-auto mb-5">
            <div className="absolute inset-0 bg-emerald-500/20 rounded-full animate-ping opacity-30" />
            <div className="relative w-20 h-20 bg-emerald-500/10 border-2 border-emerald-500/30 rounded-full flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
          </div>
          <h2 className="font-heading text-3xl sm:text-4xl font-black text-cream mb-2">Order Confirmed!</h2>
          <p className="text-cream/40">
            Your order <span className="font-semibold text-gold">{order.id}</span> has been placed successfully.
          </p>
        </div>

        {/* Order Details */}
        <div className="card mb-6 animate-slide-up">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-1 h-5 bg-gold rounded-full" />
            <h3 className="font-heading text-lg font-bold text-cream">Order Summary</h3>
          </div>

          <div className="space-y-3 mb-4">
            {order.items.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between py-2 border-b border-white/[0.06] last:border-0">
                <div>
                  <p className="text-sm font-semibold text-cream">{item.productName}</p>
                  <p className="text-xs text-cream/30">{item.size} &times; {item.quantity}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-cream">{formatCurrency(item.unitPrice * item.quantity)}</p>
                  <p className="text-xs text-cream/30">+{formatCurrency(item.deposit * item.quantity)} dep.</p>
                </div>
              </div>
            ))}
          </div>

          {order.kegReturns.length > 0 && (
            <div className="mb-4 pb-3 border-b border-white/[0.06]">
              <p className="text-[10px] font-bold text-gold/60 uppercase tracking-[0.2em] mb-2">Keg Returns</p>
              {order.kegReturns.map((ret, idx) => (
                <div key={idx} className="flex justify-between text-sm">
                  <span className="text-cream/40">{ret.size} &times; {ret.quantity}</span>
                  <span className="text-emerald-400">-{formatCurrency(KEG_DEPOSITS[ret.size] * ret.quantity)}</span>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-1.5 pt-2">
            <div className="flex justify-between text-sm">
              <span className="text-cream/40">Subtotal</span>
              <span className="text-cream/70">{formatCurrency(order.subtotal)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-cream/40">Net Deposits</span>
              <span className="text-cream/70">{formatCurrency(order.totalDeposit)}</span>
            </div>
            <div className="flex justify-between text-xl font-black text-cream pt-3 border-t border-white/[0.06]">
              <span>Total</span>
              <span className="text-gold">{formatCurrency(order.total)}</span>
            </div>
          </div>

          <div className="mt-5 pt-4 border-t border-white/[0.06] grid grid-cols-2 gap-4">
            <div>
              <p className="text-[10px] text-cream/30 uppercase tracking-widest mb-1">Delivery Date</p>
              <p className="text-sm font-semibold text-cream">{formatDate(order.deliveryDate)}</p>
            </div>
            <div>
              <p className="text-[10px] text-cream/30 uppercase tracking-widest mb-1">Status</p>
              <span className={cn('badge', getStatusColor(order.status))}>{order.status}</span>
            </div>
          </div>

          {order.notes && (
            <div className="mt-4 pt-3 border-t border-white/[0.06]">
              <p className="text-[10px] text-cream/30 uppercase tracking-widest mb-1">Notes</p>
              <p className="text-sm text-cream/60">{order.notes}</p>
            </div>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <Link href="/order" className="btn-primary flex-1 text-center py-3">Place Another Order</Link>
          <Link href="/portal" className="btn-outline flex-1 text-center py-3">Customer Portal</Link>
        </div>
      </main>
    </div>
  );
}

export default function ConfirmationPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-charcoal flex items-center justify-center">
        <div className="text-center">
          <div className="skeleton w-20 h-20 rounded-full mx-auto mb-4" />
          <div className="skeleton h-6 w-48 mx-auto mb-2" />
          <div className="skeleton h-4 w-32 mx-auto" />
        </div>
      </div>
    }>
      <ConfirmationContent />
    </Suspense>
  );
}
