import { NextRequest, NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/auth-check';
import { getInvoices, getCustomers } from '@/lib/data';

/**
 * GET /api/invoices/export
 * Admin-only. CSV of every invoice (header rows, not line items). Good
 * for accountant reconciliation: invoice id, customer, status, totals,
 * issued/sent/paid timestamps.
 */
export async function GET(request: NextRequest) {
  if (!isAdminRequest(request)) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const [invoices, customers] = await Promise.all([getInvoices(), getCustomers(true)]);
  const byId = new Map(customers.map((c) => [c.id, c]));

  const headers = [
    'Invoice ID',
    'Order ID',
    'Customer',
    'Customer Email',
    'Status',
    'Issued',
    'Sent',
    'Paid',
    'Subtotal',
    'Keg Deposits',
    'Total',
  ];

  const rows = invoices.map((i) => {
    const cust = byId.get(i.customerId);
    return [
      i.id,
      i.orderId,
      cust?.businessName || i.customerId,
      cust?.email || '',
      i.status,
      i.issuedAt,
      i.sentAt || '',
      i.paidAt || '',
      i.subtotal.toFixed(2),
      i.totalDeposit.toFixed(2),
      i.total.toFixed(2),
    ];
  });

  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const csv = [headers.join(','), ...rows.map((r) => r.map(esc).join(','))].join('\n');

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="guidon-invoices-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
