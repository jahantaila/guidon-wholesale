import { NextRequest, NextResponse } from 'next/server';
import { getOrders, createOrder, updateOrder, getOrder, createInvoice, getInvoices, updateInvoice, addKegLedgerEntry, adjustProductInventory, getCustomers } from '@/lib/data';
import { generateId } from '@/lib/utils';
import type { Order, Invoice, KegLedgerEntry, Customer } from '@/lib/types';
import { notifyOrderPlaced, notifyOrderStatusChanged, notifyLowStock, send, formatCurrencyForEmail } from '@/lib/email';

const LOW_STOCK_THRESHOLD = 5;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const customerId = searchParams.get('customerId');
    // Unfiltered (no customerId): admin-only. Scoped (with customerId):
    // allowed for portal users querying their own history. The portal UI
    // always passes the logged-in customer's id; for now we trust that
    // envelope. A future tightening can enforce the id matches the
    // authenticated email's customer row.
    if (!customerId) {
      const session = request.cookies.get('admin_session');
      if (session?.value !== 'authenticated') {
        return NextResponse.json([], { status: 200 });
      }
    }
    let orders = await getOrders();
    if (customerId) {
      orders = orders.filter(o => o.customerId === customerId);
    }
    return NextResponse.json(orders);
  } catch (err) {
    // Surface the Supabase error instead of a blanket 500 so the admin can
    // actually see what's wrong (usually schema drift or FK issue). Still
    // returns JSON so clients consuming .json() don't choke.
    console.error('[api/orders GET] failed:', err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Orders query failed: ${message}` }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
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

  // Await email so Vercel's serverless runtime doesn't cut it off when the
  // response is sent. Fire-and-forget promises don't reliably complete in
  // prod. The notify function catches internal errors, so we can safely
  // await without risking the order creation.
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

  return NextResponse.json(order, { status: 201 });
  } catch (err) {
    console.error('[api/orders POST] failed:', err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Order create failed: ${message}` }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
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
    // Track which sizes cross below the low-stock threshold so we can fire
    // a single digest email instead of N per-order emails. A size only
    // "crosses" if it was at or above the threshold before the decrement.
    const crossed: Array<{ productName: string; size: string; remaining: number }> = [];
    for (const item of existingOrder.items) {
      const after = await adjustProductInventory(item.productId, item.size, -item.quantity);
      if (after !== null && after < LOW_STOCK_THRESHOLD) {
        const before = after + item.quantity;
        if (before >= LOW_STOCK_THRESHOLD) {
          crossed.push({ productName: item.productName, size: item.size, remaining: after });
        }
      }
    }
    if (crossed.length > 0) {
      notifyLowStock({ items: crossed }).catch((err) =>
        console.error('[email] notifyLowStock failed (non-fatal):', err),
      );
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

    // Auto-send invoice on delivery if the customer has autoSendInvoices=true.
    // The draft invoice was created at order-placement time; here we promote
    // it to 'unpaid' and fire the customer email. For customers without the
    // flag, admin will still manually click Send on the Invoices page.
    try {
      const allCustomers = await getCustomers();
      const customerRec = allCustomers.find((c) => c.id === existingOrder.customerId);
      if (customerRec?.autoSendInvoices) {
        const allInvoices = await getInvoices();
        const draftInv = allInvoices.find((i) => i.orderId === existingOrder.id && i.status === 'draft');
        if (draftInv) {
          const sentAt = new Date().toISOString();
          await updateInvoice(draftInv.id, { status: 'unpaid', sentAt });
          await fireInvoiceEmail({ ...draftInv, status: 'unpaid', sentAt }, customerRec).catch((err) =>
            console.error('[email] auto-send invoice failed (non-fatal):', err),
          );
        }
      }
    } catch (err) {
      console.error('[invoice auto-send] failed (non-fatal):', err);
    }

    // Legacy: if somehow no invoice exists (shouldn't happen post-v2 since we
    // create drafts on POST), create one as a fallback.
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
  }

  return NextResponse.json(order);
  } catch (err) {
    console.error('[api/orders PUT] failed:', err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Order update failed: ${message}` }, { status: 500 });
  }
}

/** Build + send the invoice HTML email. Mirrors /api/invoices fireInvoiceEmail. */
async function fireInvoiceEmail(invoice: Invoice, customer: Customer) {
  const rows = invoice.items.map((i) => `
    <tr>
      <td style="padding:4px 8px;border-bottom:1px solid #EEE5CE;">${escapeHtml(i.productName)}</td>
      <td style="padding:4px 8px;border-bottom:1px solid #EEE5CE;font-family:monospace;">${escapeHtml(i.size)}</td>
      <td style="padding:4px 8px;border-bottom:1px solid #EEE5CE;text-align:right;font-family:monospace;">${i.quantity}</td>
      <td style="padding:4px 8px;border-bottom:1px solid #EEE5CE;text-align:right;font-family:monospace;">${formatCurrencyForEmail(i.unitPrice * i.quantity)}</td>
    </tr>`).join('');
  const html = `<!doctype html><html><body style="margin:0;padding:24px 16px;background:#F5EFDF;font-family:Georgia,serif;color:#2A2416;">
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:560px;margin:0 auto;border:1px solid #D8CDA8;background:#FBF7EA;">
  <tr><td style="padding:24px 28px 12px;border-bottom:1px solid #D8CDA8;">
    <div style="font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#9E7A3B;font-weight:600;margin-bottom:6px;">Guidon Brewing Co. &middot; Invoice</div>
    <h1 style="margin:0;font-family:Georgia,serif;font-size:24px;font-weight:500;">${escapeHtml(invoice.id)}</h1>
  </td></tr>
  <tr><td style="padding:20px 28px;font-size:15px;">
    <p>${escapeHtml(customer.contactName)} at ${escapeHtml(customer.businessName)},</p>
    <p style="margin:12px 0;">Your order was delivered. Invoice for <strong>${escapeHtml(invoice.orderId)}</strong> is below. Payment due on receipt.</p>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;font-size:14px;margin:16px 0;">
      <thead><tr style="background:#EEE5CE;">
        <th style="padding:6px 8px;text-align:left;font-size:11px;color:#6B5F48;text-transform:uppercase;letter-spacing:0.08em;">Beer</th>
        <th style="padding:6px 8px;text-align:left;font-size:11px;color:#6B5F48;text-transform:uppercase;letter-spacing:0.08em;">Size</th>
        <th style="padding:6px 8px;text-align:right;font-size:11px;color:#6B5F48;text-transform:uppercase;letter-spacing:0.08em;">Qty</th>
        <th style="padding:6px 8px;text-align:right;font-size:11px;color:#6B5F48;text-transform:uppercase;letter-spacing:0.08em;">Total</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div style="font-size:14px;color:#6B5F48;">
      Subtotal: <span style="color:#2A2416;font-family:monospace;">${formatCurrencyForEmail(invoice.subtotal)}</span><br/>
      Keg deposits: <span style="color:#2A2416;font-family:monospace;">${formatCurrencyForEmail(invoice.totalDeposit)}</span><br/>
      <strong style="color:#2A2416;">Total due: <span style="font-family:monospace;color:#9E7A3B;">${formatCurrencyForEmail(invoice.total)}</span></strong>
    </div>
  </td></tr>
  <tr><td style="padding:16px 28px;border-top:1px solid #D8CDA8;font-size:11px;color:#6B5F48;">
    Guidon Brewing Co. &middot; 415 8th Ave. E., Hendersonville, NC 28792
  </td></tr>
</table></body></html>`;
  await send({
    to: customer.email,
    subject: `Invoice ${invoice.id} from Guidon Brewing`,
    html,
  });
}

function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}
