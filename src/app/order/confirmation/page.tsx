'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import Link from 'next/link';
import type { Order, OrderStatus } from '@/lib/types';
import { formatCurrency, formatDate, cn } from '@/lib/utils';
import { KEG_DEPOSITS } from '@/lib/types';

const SIZE_SHORT: Record<string, string> = { '1/2bbl': 'Half', '1/4bbl': 'Quarter', '1/6bbl': 'Sixth' };

const STEPS: { key: OrderStatus; label: string }[] = [
  { key: 'pending', label: 'Placed' },
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'delivered', label: 'Delivered' },
  { key: 'completed', label: 'Completed' },
];

function OrderStepper({ status }: { status: OrderStatus }) {
  const currentIdx = STEPS.findIndex((s) => s.key === status);

  return (
    <div className="flex items-center justify-center gap-0 my-8">
      {STEPS.map((step, idx) => {
        const isCompleted = idx < currentIdx;
        const isActive = idx === currentIdx;
        const isInactive = idx > currentIdx;

        return (
          <div key={step.key} className="flex items-center">
            <div className="flex flex-col items-center">
              <div className={cn(
                'w-8 h-8 rounded-full flex items-center justify-center text-xs font-heading font-bold border-2 transition-all',
                isCompleted && 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400',
                isActive && 'bg-gold/20 border-gold/50 text-gold',
                isInactive && 'bg-charcoal-300 border-white/[0.08] text-cream/20',
              )}>
                {isCompleted ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <span>{idx + 1}</span>
                )}
              </div>
              <span className={cn(
                'text-[10px] font-heading font-bold mt-1.5 uppercase tracking-wider',
                isCompleted && 'text-emerald-400/70',
                isActive && 'text-gold/80',
                isInactive && 'text-cream/15',
              )}>
                {step.label}
              </span>
            </div>
            {idx < STEPS.length - 1 && (
              <div className={cn(
                'w-12 sm:w-16 h-0.5 mx-1 mb-5 rounded-full',
                idx < currentIdx ? 'bg-emerald-500/40' : 'bg-white/[0.06]',
              )} />
            )}
          </div>
        );
      })}
    </div>
  );
}

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
          <div className="skeleton w-16 h-16 rounded-2xl mx-auto mb-4" />
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
          <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
            <svg className="h-7 w-7 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.999L13.732 4.001c-.77-1.333-2.694-1.333-3.464 0L3.34 16.001c-.77 1.332.192 2.999 1.732 2.999z" />
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
            <div className="w-9 h-9 bg-gold rounded-lg flex items-center justify-center">
              <span className="text-charcoal font-heading font-black text-lg">G</span>
            </div>
            <h1 className="font-heading text-sm font-bold text-cream tracking-wide">GUIDON BREWING</h1>
          </Link>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-10 sm:py-16">
        {/* Success header */}
        <div className="text-center mb-6 animate-fade-in">
          <div className="relative w-16 h-16 mx-auto mb-5">
            <div className="absolute inset-0 bg-emerald-500/20 rounded-full animate-ping opacity-20" />
            <div className="relative w-16 h-16 bg-emerald-500/10 border-2 border-emerald-500/30 rounded-2xl flex items-center justify-center">
              <svg className="h-8 w-8 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            </div>
          </div>
          <h2 className="font-heading text-display-sm text-cream mb-2">Order Placed</h2>
          <p className="text-cream/35 text-base">
            Order <span className="font-heading font-bold text-gold">{order.id}</span> is confirmed. Pay on delivery.
          </p>
        </div>

        {/* Stepper */}
        <OrderStepper status={order.status} />

        {/* Order Details */}
        <div className="card mb-6 animate-slide-up">
          <span className="section-label mb-4 block">Order Summary</span>

          <div className="space-y-3 mb-4">
            {order.items.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between py-2 border-b border-white/[0.04] last:border-0">
                <div>
                  <p className="text-sm font-heading font-bold text-cream">{item.productName}</p>
                  <p className="text-xs text-cream/25">{SIZE_SHORT[item.size] || item.size} &times; {item.quantity}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-cream">{formatCurrency(item.unitPrice * item.quantity)}</p>
                  <p className="text-xs text-cream/25">+{formatCurrency(item.deposit * item.quantity)} dep.</p>
                </div>
              </div>
            ))}
          </div>

          {order.kegReturns.length > 0 && (
            <div className="mb-4 pb-3 border-b border-white/[0.04]">
              <span className="section-label mb-2 block">Keg Returns</span>
              {order.kegReturns.map((ret, idx) => (
                <div key={idx} className="flex justify-between text-sm">
                  <span className="text-cream/35">{ret.size} &times; {ret.quantity}</span>
                  <span className="text-emerald-400">-{formatCurrency(KEG_DEPOSITS[ret.size] * ret.quantity)}</span>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-1.5 pt-2">
            <div className="flex justify-between text-sm">
              <span className="text-cream/30">Subtotal</span>
              <span className="text-cream/60">{formatCurrency(order.subtotal)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-cream/30">Net Deposits</span>
              <span className="text-cream/60">{formatCurrency(order.totalDeposit)}</span>
            </div>
            <div className="flex justify-between text-lg font-heading font-black text-cream pt-3 border-t border-white/[0.06]">
              <span>Total Due</span>
              <span className="text-gold">{formatCurrency(order.total)}</span>
            </div>
          </div>

          <div className="mt-5 pt-4 border-t border-white/[0.04] grid grid-cols-2 gap-4">
            <div>
              <span className="section-label mb-1 block">Delivery Date</span>
              <p className="text-sm font-heading font-bold text-cream">{formatDate(order.deliveryDate)}</p>
            </div>
            <div>
              <span className="section-label mb-1 block">Payment</span>
              <p className="text-sm font-heading font-bold text-cream">Due on Delivery</p>
            </div>
          </div>

          {order.notes && (
            <div className="mt-4 pt-3 border-t border-white/[0.04]">
              <span className="section-label mb-1 block">Notes</span>
              <p className="text-sm text-cream/50">{order.notes}</p>
            </div>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <Link href="/order" className="btn-primary flex-1 text-center py-3">Place Another Order</Link>
          <Link href="/portal" className="btn-secondary flex-1 text-center py-3">Customer Portal</Link>
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
          <div className="skeleton w-16 h-16 rounded-2xl mx-auto mb-4" />
          <div className="skeleton h-6 w-48 mx-auto mb-2" />
          <div className="skeleton h-4 w-32 mx-auto" />
        </div>
      </div>
    }>
      <ConfirmationContent />
    </Suspense>
  );
}
