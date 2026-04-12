import { NextRequest, NextResponse } from 'next/server';
import { getOrders, createOrder, updateOrder, getOrder, createInvoice, getInvoices, addKegLedgerEntry } from '@/lib/data';
import { generateId } from '@/lib/utils';
import type { Order, Invoice, KegLedgerEntry } from '@/lib/types';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const customerId = searchParams.get('customerId');
  let orders = await getOrders();
  if (customerId) {
    orders = orders.filter(o => o.customerId === customerId);
  }
  return NextResponse.json(orders);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const order: Order = {
    id: generateId('ord'),
    customerId: body.customerId,
    status: 'pending',
    items: body.items,
    kegReturns: body.kegReturns || [],
    subtotal: body.subtotal,
    totalDeposit: body.totalDeposit,
    total: body.total,
    deliveryDate: body.deliveryDate,
    notes: body.notes || '',
    createdAt: new Date().toISOString(),
  };
  await createOrder(order);
  return NextResponse.json(order, { status: 201 });
}

export async function PUT(request: NextRequest) {
  const body = await request.json();
  const { id, ...updates } = body;

  const existingOrder = await getOrder(id);
  if (!existingOrder) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  }

  // If status is changing to 'delivered', create keg ledger entries and invoice
  if (updates.status === 'delivered' && existingOrder.status !== 'delivered') {
    const now = new Date().toISOString();

    // Add keg deposits for each item
    for (const item of existingOrder.items) {
      const entry: KegLedgerEntry = {
        id: generateId('kl'),
        customerId: existingOrder.customerId,
        orderId: existingOrder.id,
        type: 'deposit',
        size: item.size,
        quantity: item.quantity,
        depositAmount: item.deposit,
        totalAmount: item.deposit * item.quantity,
        date: now,
        notes: `Order ${existingOrder.id} delivery`,
      };
      await addKegLedgerEntry(entry);
    }

    // Add keg returns
    for (const ret of existingOrder.kegReturns) {
      const depositAmounts: Record<string, number> = { '1/2bbl': 50, '1/4bbl': 40, '1/6bbl': 30 };
      const entry: KegLedgerEntry = {
        id: generateId('kl'),
        customerId: existingOrder.customerId,
        orderId: existingOrder.id,
        type: 'return',
        size: ret.size,
        quantity: ret.quantity,
        depositAmount: depositAmounts[ret.size],
        totalAmount: -(depositAmounts[ret.size] * ret.quantity),
        date: now,
        notes: `Keg returns with order ${existingOrder.id}`,
      };
      await addKegLedgerEntry(entry);
    }

    // Auto-create invoice
    const existingInvoices = await getInvoices();
    const alreadyInvoiced = existingInvoices.some(inv => inv.orderId === id);
    if (!alreadyInvoiced) {
      const invoice: Invoice = {
        id: generateId('inv'),
        orderId: existingOrder.id,
        customerId: existingOrder.customerId,
        status: 'unpaid',
        items: existingOrder.items,
        subtotal: existingOrder.subtotal,
        totalDeposit: existingOrder.totalDeposit,
        total: existingOrder.total,
        issuedAt: now,
        paidAt: null,
      };
      await createInvoice(invoice);
    }
  }

  const order = await updateOrder(id, updates);
  return NextResponse.json(order);
}
