import { NextRequest, NextResponse } from 'next/server';
import { getOrders, createOrder, updateOrder, getOrder, createInvoice, getInvoices, addKegLedgerEntry, adjustProductInventory, getCustomers } from '@/lib/data';
import { generateId } from '@/lib/utils';
import type { Order, Invoice, KegLedgerEntry } from '@/lib/types';
import { notifyOrderPlaced, notifyOrderStatusChanged } from '@/lib/email';

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

  // Auto-create a draft invoice at order-placement time. Admin reviews and
  // sends it later via the Send Invoice action (transitions draft -> unpaid
  // and fires the invoice email).
  try {
    const draftInvoice: Invoice = {
      id: generateId('inv'),
      orderId: order.id,
      customerId: order.customerId,
      status: 'draft',
      items: order.items,
      subtotal: order.subtotal,
      totalDeposit: order.totalDeposit,
      total: order.total,
      issuedAt: new Date().toISOString(),
      paidAt: null,
    };
    await createInvoice(draftInvoice);
  } catch (err) {
    console.error('[invoice] draft creation failed (non-fatal):', err);
  }

  // Fire-and-forget email notifications. Never block order creation on email
  // delivery, and never surface email errors to the client.
  (async () => {
    try {
      const customers = await getCustomers();
      const customer = customers.find((c) => c.id === order.customerId);
      if (customer) {
        await notifyOrderPlaced({
          orderId: order.id,
          customerEmail: customer.email,
          customerName: customer.contactName,
          businessName: customer.businessName,
          items: order.items,
          subtotal: order.subtotal,
          totalDeposit: order.totalDeposit,
          total: order.total,
          deliveryDate: order.deliveryDate,
          notes: order.notes,
        });
      }
    } catch (err) {
      console.error('[email] notifyOrderPlaced failed (non-fatal):', err);
    }
  })();

  return NextResponse.json(order, { status: 201 });
}

export async function PUT(request: NextRequest) {
  const body = await request.json();
  const { id, ...updates } = body;

  const existingOrder = await getOrder(id);
  if (!existingOrder) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  }

  // If status is transitioning to 'confirmed' from 'pending', decrement
  // inventory. We don't decrement on order creation (pending) because the
  // brewery may not have committed to brewing yet; confirmation is the
  // stock-reservation signal. Idempotent by design: only runs on the
  // pending->confirmed transition.
  if (updates.status === 'confirmed' && existingOrder.status === 'pending') {
    for (const item of existingOrder.items) {
      await adjustProductInventory(item.productId, item.size, -item.quantity);
    }
  }

  // Conversely, if an order is cancelled back to pending after confirmation,
  // restore the inventory. This is symmetric and prevents double-decrements.
  if (updates.status === 'pending' && existingOrder.status === 'confirmed') {
    for (const item of existingOrder.items) {
      await adjustProductInventory(item.productId, item.size, item.quantity);
    }
  }

  // If status is changing to 'delivered', create keg ledger entries.
  // Invoices are now auto-created at POST time as drafts; admin sends them
  // explicitly via the Send Invoice action, so no invoice work happens here.
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

  // Email the customer on meaningful status transitions (confirmed, delivered,
  // completed). Pending is internal. Fire-and-forget; errors are logged only.
  const significantStatus: Array<'confirmed' | 'delivered' | 'completed'> = [
    'confirmed',
    'delivered',
    'completed',
  ];
  if (
    order &&
    updates.status &&
    significantStatus.includes(updates.status as 'confirmed' | 'delivered' | 'completed') &&
    updates.status !== existingOrder.status
  ) {
    (async () => {
      try {
        const customers = await getCustomers();
        const customer = customers.find((c) => c.id === order.customerId);
        if (customer) {
          await notifyOrderStatusChanged({
            orderId: order.id,
            customerEmail: customer.email,
            customerName: customer.contactName,
            newStatus: updates.status as 'confirmed' | 'delivered' | 'completed',
            deliveryDate: order.deliveryDate,
          });
        }
      } catch (err) {
        console.error('[email] notifyOrderStatusChanged failed (non-fatal):', err);
      }
    })();
  }

  return NextResponse.json(order);
}
