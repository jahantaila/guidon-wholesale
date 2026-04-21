import { NextRequest, NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/auth-check';
import { getCustomers, getOrders, getInvoices } from '@/lib/data';

/**
 * GET /api/customers/export
 * Admin-only. CSV of every customer + computed LTV, order count, last
 * order date, and outstanding AR — the same fields surfaced in the
 * admin customers list but easy to paste into a spreadsheet for outreach
 * campaigns.
 */
export async function GET(request: NextRequest) {
  if (!isAdminRequest(request)) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const includeArchived = new URL(request.url).searchParams.get('includeArchived') === 'true';
  const [customers, orders, invoices] = await Promise.all([
    getCustomers(includeArchived),
    getOrders(),
    getInvoices(),
  ]);

  const metrics = new Map<string, { ltv: number; orderCount: number; lastOrder: string | null; outstanding: number }>();
  customers.forEach((c) => metrics.set(c.id, { ltv: 0, orderCount: 0, lastOrder: null, outstanding: 0 }));
  orders.forEach((o) => {
    const m = metrics.get(o.customerId);
    if (!m) return;
    m.ltv += o.total;
    m.orderCount += 1;
    if (!m.lastOrder || o.createdAt > m.lastOrder) m.lastOrder = o.createdAt;
  });
  invoices.forEach((i) => {
    if (i.status !== 'unpaid' && i.status !== 'overdue') return;
    const m = metrics.get(i.customerId);
    if (m) m.outstanding += i.total;
  });

  const headers = [
    'Customer ID',
    'Business Name',
    'Contact Name',
    'Email',
    'Phone',
    'Address',
    'Orders',
    'LTV',
    'Last Order',
    'Outstanding AR',
    'Tags',
    'Auto-send Invoices',
    'Archived',
    'Notes',
  ];
  const rows = customers.map((c) => {
    const m = metrics.get(c.id) || { ltv: 0, orderCount: 0, lastOrder: null, outstanding: 0 };
    return [
      c.id,
      c.businessName,
      c.contactName,
      c.email,
      c.phone,
      c.address,
      String(m.orderCount),
      m.ltv.toFixed(2),
      m.lastOrder || '',
      m.outstanding.toFixed(2),
      (c.tags || []).join('; '),
      c.autoSendInvoices ? 'yes' : 'no',
      c.archivedAt || '',
      c.notes || '',
    ];
  });

  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const csv = [headers.join(','), ...rows.map((r) => r.map(esc).join(','))].join('\n');

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="guidon-customers-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
