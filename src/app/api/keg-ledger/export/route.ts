import { NextRequest, NextResponse } from 'next/server';
import { getKegLedger, getCustomers } from '@/lib/data';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const customerId = searchParams.get('customerId');

  let ledger = getKegLedger();
  if (customerId) {
    ledger = ledger.filter(e => e.customerId === customerId);
  }

  const customers = getCustomers();
  const customerMap = new Map(customers.map(c => [c.id, c.businessName]));

  const headers = ['Date', 'Customer', 'Order', 'Type', 'Size', 'Quantity', 'Deposit Rate', 'Total Amount', 'Notes'];
  const rows = ledger.map(entry => [
    new Date(entry.date).toLocaleDateString(),
    customerMap.get(entry.customerId) || entry.customerId,
    entry.orderId,
    entry.type,
    entry.size,
    entry.quantity.toString(),
    `$${entry.depositAmount}`,
    `$${entry.totalAmount}`,
    entry.notes,
  ]);

  const csv = [headers.join(','), ...rows.map(r => r.map(cell => `"${cell}"`).join(','))].join('\n');

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename="keg-ledger.csv"',
    },
  });
}
