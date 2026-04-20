import { NextRequest, NextResponse } from 'next/server';
import { getOrders, getCustomers } from '@/lib/data';

/**
 * GET /api/orders/export
 * Admin-only. Returns a CSV of every order with line items flattened.
 * One row per line item so it's straightforward to pivot in a spreadsheet.
 */
export async function GET(request: NextRequest) {
  const session = request.cookies.get('admin_session');
  if (session?.value !== 'authenticated') {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const [orders, customers] = await Promise.all([getOrders(), getCustomers(true)]);
  const byId = new Map(customers.map((c) => [c.id, c]));

  const headers = [
    'Order ID',
    'Date Placed',
    'Delivery Date',
    'Status',
    'Customer',
    'Customer Email',
    'Product',
    'Size',
    'Quantity',
    'Unit Price',
    'Deposit/Unit',
    'Line Total',
    'Order Subtotal',
    'Order Deposit',
    'Order Total',
    'Notes',
  ];

  const rows: string[][] = [];
  for (const o of orders) {
    const cust = byId.get(o.customerId);
    for (const item of o.items) {
      rows.push([
        o.id,
        new Date(o.createdAt).toLocaleDateString(),
        o.deliveryDate,
        o.status,
        cust?.businessName || o.customerId,
        cust?.email || '',
        item.productName,
        item.size,
        item.quantity.toString(),
        item.unitPrice.toFixed(2),
        item.deposit.toFixed(2),
        ((item.unitPrice + item.deposit) * item.quantity).toFixed(2),
        o.subtotal.toFixed(2),
        o.totalDeposit.toFixed(2),
        o.total.toFixed(2),
        o.notes || '',
      ]);
    }
  }

  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const csv = [headers.join(','), ...rows.map((r) => r.map(esc).join(','))].join('\n');

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="guidon-orders-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
