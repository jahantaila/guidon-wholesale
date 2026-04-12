import { NextRequest, NextResponse } from 'next/server';
import { getInvoices, updateInvoice } from '@/lib/data';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const customerId = searchParams.get('customerId');
  let invoices = await getInvoices();
  if (customerId) {
    invoices = invoices.filter(i => i.customerId === customerId);
  }
  return NextResponse.json(invoices);
}

export async function PUT(request: NextRequest) {
  const body = await request.json();
  const { id, ...updates } = body;
  if (updates.status === 'paid' && !updates.paidAt) {
    updates.paidAt = new Date().toISOString();
  }
  const invoice = await updateInvoice(id, updates);
  if (!invoice) {
    return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
  }
  return NextResponse.json(invoice);
}
