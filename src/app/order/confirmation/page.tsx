'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import type { Order } from '@/lib/types';
import { formatCurrency, formatDate } from '@/lib/utils';
import { KEG_DEPOSITS } from '@/lib/types';

function ConfirmationContent() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get('orderId');

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!orderId) {
      setError('No order ID provided.');
      setLoading(false);
      return;
    }

    async function fetchOrder() {
      try {
        const res = await fetch('/api/orders');
        if (!res.ok) throw new Error('Failed to fetch orders');
        const orders: Order[] = await res.json();
        const found = orders.find((o) => o.id === orderId);
        if (!found) {
          setError('Order not found.');
        } else {
          setOrder(found);
        }
      } catch {
        setError('Failed to load order details.');
      } finally {
        setLoading(false);
      }
    }

    fetchOrder();
  }, [orderId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <div className="text-center">
          <div className="skeleton w-16 h-16 rounded-full mx-auto mb-4" />
          <div className="skeleton h-6 w-48 mx-auto mb-2" />
          <div className="skeleton h-4 w-32 mx-auto" />
        </div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center px-4">
        <div className="card text-center max-w-md w-full">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-100 flex items-center justify-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-8 w-8 text-red-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.999L13.732 4.001c-.77-1.333-2.694-1.333-3.464 0L3.34 16.001c-.77 1.332.192 2.999 1.732 2.999z"
              />
            </svg>
          </div>
          <h2 className="font-heading text-xl font-semibold text-brown mb-2">
            {error || 'Something went wrong'}
          </h2>
          <a href="/order" className="btn-primary inline-block mt-4">
            Place a New Order
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream font-body">
      {/* Header */}
      <header className="bg-olive text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center h-16">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-amber rounded-full flex items-center justify-center">
              <span className="text-brown font-heading font-bold text-sm">G</span>
            </div>
            <h1 className="font-heading text-lg sm:text-xl font-semibold">
              Guidon Brewing
            </h1>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        {/* Success Animation */}
        <div className="text-center mb-8 animate-fade-in">
          <div className="relative w-20 h-20 mx-auto mb-5">
            <div className="absolute inset-0 bg-green-100 rounded-full animate-ping opacity-20" />
            <div className="relative w-20 h-20 bg-green-100 rounded-full flex items-center justify-center">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-10 w-10 text-green-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
          </div>
          <h2 className="font-heading text-2xl sm:text-3xl font-bold text-brown mb-2">
            Order Confirmed!
          </h2>
          <p className="text-brown-200">
            Your order <span className="font-medium text-brown">{order.id}</span>{' '}
            has been placed successfully.
          </p>
        </div>

        {/* Order Details Card */}
        <div className="card mb-6 animate-slide-up">
          <h3 className="font-heading text-lg font-semibold text-brown mb-4">
            Order Summary
          </h3>

          {/* Items */}
          <div className="space-y-3 mb-4">
            {order.items.map((item, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between py-2 border-b border-cream-200 last:border-0"
              >
                <div>
                  <p className="text-sm font-medium text-brown">
                    {item.productName}
                  </p>
                  <p className="text-xs text-brown-200">
                    {item.size} &times; {item.quantity}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-brown">
                    {formatCurrency(item.unitPrice * item.quantity)}
                  </p>
                  <p className="text-xs text-brown-200">
                    +{formatCurrency(item.deposit * item.quantity)} dep.
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Keg Returns */}
          {order.kegReturns.length > 0 && (
            <div className="mb-4 pb-3 border-b border-cream-200">
              <p className="text-xs font-semibold text-olive uppercase tracking-wider mb-2">
                Keg Returns
              </p>
              {order.kegReturns.map((ret, idx) => (
                <div
                  key={idx}
                  className="flex justify-between text-sm"
                >
                  <span className="text-brown-200">
                    {ret.size} &times; {ret.quantity}
                  </span>
                  <span className="text-green-600">
                    -{formatCurrency(KEG_DEPOSITS[ret.size] * ret.quantity)}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Totals */}
          <div className="space-y-1.5 pt-2">
            <div className="flex justify-between text-sm">
              <span className="text-brown-200">Subtotal</span>
              <span className="text-brown">{formatCurrency(order.subtotal)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-brown-200">Net Deposits</span>
              <span className="text-brown">
                {formatCurrency(order.totalDeposit)}
              </span>
            </div>
            <div className="flex justify-between text-lg font-semibold text-brown pt-2 border-t border-cream-200">
              <span>Total</span>
              <span>{formatCurrency(order.total)}</span>
            </div>
          </div>

          {/* Delivery Info */}
          <div className="mt-5 pt-4 border-t border-cream-200 grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-brown-200 uppercase tracking-wider mb-0.5">
                Delivery Date
              </p>
              <p className="text-sm font-medium text-brown">
                {formatDate(order.deliveryDate)}
              </p>
            </div>
            <div>
              <p className="text-xs text-brown-200 uppercase tracking-wider mb-0.5">
                Status
              </p>
              <span className="badge bg-yellow-100 text-yellow-800 capitalize">
                {order.status}
              </span>
            </div>
          </div>

          {order.notes && (
            <div className="mt-4 pt-3 border-t border-cream-200">
              <p className="text-xs text-brown-200 uppercase tracking-wider mb-0.5">
                Notes
              </p>
              <p className="text-sm text-brown">{order.notes}</p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3">
          <a href="/order" className="btn-primary flex-1 text-center">
            Place Another Order
          </a>
          <a href="/portal" className="btn-outline flex-1 text-center">
            Go to Customer Portal
          </a>
        </div>
      </main>
    </div>
  );
}

export default function ConfirmationPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-cream flex items-center justify-center">
          <div className="text-center">
            <div className="skeleton w-16 h-16 rounded-full mx-auto mb-4" />
            <div className="skeleton h-6 w-48 mx-auto mb-2" />
            <div className="skeleton h-4 w-32 mx-auto" />
          </div>
        </div>
      }
    >
      <ConfirmationContent />
    </Suspense>
  );
}
