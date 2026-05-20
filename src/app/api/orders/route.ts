import { NextRequest, NextResponse } from 'next/server';
import { isAdminRequest, authContext } from '@/lib/auth-check';
import { extractError } from '@/lib/extract-error';
import { getOrders, createOrder, updateOrder, getOrder, createInvoice, getInvoices, updateInvoice, addKegLedgerEntry, adjustProductInventory, getCustomers } from '@/lib/data';
import { generateId } from '@/lib/utils';
import type { Order, Invoice, KegLedgerEntry, Customer } from '@/lib/types';
import { notifyOrderPlaced, notifyOrderStatusChanged, notifyLowStock, send, formatCurrencyForEmail } from '@/lib/email';

const LOW_STOCK_THRESHOLD = 5;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const customerId = searchParams.get('customerId');
    const { admin, portalCustomerId } = authContext(request);
    // Unfiltered (no customerId): admin-only.
    if (!customerId && !admin) {
      return NextResponse.json([], { status: 200 });
    }
    // Scoped by customerId: admin can query anyone; portal customer can
    // only query their own. Prevents enumerating other customers' orders
    // by guessing ids.
    if (customerId && !admin && portalCustomerId !== customerId) {
      return NextResponse.json([], { status: 200 });
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
    const message = extractError(err);
    return NextResponse.json({ error: `Orders query failed: ${message}` }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
  const body = await request.json();
  const { admin, portalCustomerId } = authContext(request);

  // Auth: admin or a portal-logged-in customer. Anonymous POSTs were
  // creating $0 orders in the brewery's pipeline because no validation
  // gate existed — anyone who guessed a customerId could spam the queue.
  if (!admin && !portalCustomerId) {
    return NextResponse.json({ error: 'Authentication required to place an order.' }, { status: 401 });
  }

  // Validate customerId. Trim + require non-empty so the previous Postgres
  // FK error leak ("violates not-null constraint" with raw row contents)
  // never reaches the client.
  const customerId = typeof body?.customerId === 'string' ? body.customerId.trim() : '';
  if (!customerId) {
    return NextResponse.json({ error: 'customerId is required.' }, { status: 400 });
  }

  // Portal customer can only place orders for themselves. Admin (incl.
  // admin-on-behalf-of flow) can place for any customer.
  if (!admin && portalCustomerId && customerId !== portalCustomerId) {
    return NextResponse.json(
      { error: 'You can only place orders for your own account.' },
      { status: 403 },
    );
  }

  // Empty orders shouldn't enter the pipeline — they pollute the queue
  // and make no real-world sense (nothing to ship).
  if (!Array.isArray(body?.items) || body.items.length === 0) {
    return NextResponse.json(
      { error: 'Order must include at least one item.' },
      { status: 400 },
    );
  }

  // Per-item shape check. Loose on price/deposit (those come from the
  // server-side product catalog client-side; defending against bad shapes
  // is enough), strict on the identifying fields.
  for (let i = 0; i < (body.items as unknown[]).length; i++) {
    const it = (body.items as unknown[])[i] as Record<string, unknown>;
    if (
      typeof it.productId !== 'string' || !it.productId.trim() ||
      typeof it.productName !== 'string' || !it.productName.trim() ||
      typeof it.size !== 'string' || !it.size.trim() ||
      typeof it.quantity !== 'number' || !Number.isFinite(it.quantity) || it.quantity < 1
    ) {
      return NextResponse.json(
        { error: `Item ${i + 1} is missing required fields (productId, productName, size, quantity).` },
        { status: 400 },
      );
    }
  }

  // Verify the customer exists BEFORE the insert. Same goal as the
  // customerId trim above: surface a clean 404 instead of a raw Postgres
  // FK violation. Include archived in the lookup so we can return a
  // distinct "archived account" message rather than "not found."
  const allCustomers = await getCustomers(true);
  const matchedCustomer = allCustomers.find((c) => c.id === customerId);
  if (!matchedCustomer) {
    return NextResponse.json({ error: 'Customer not found.' }, { status: 404 });
  }
  if (matchedCustomer.archivedAt) {
    return NextResponse.json(
      { error: 'This account is archived. Contact the brewery to reactivate.' },
      { status: 403 },
    );
  }

  const order: Order = {
    id: generateId('ord'),
    customerId,
    status: 'pending',
    items: body.items,
    kegReturns: body.kegReturns || [],
    subtotal: typeof body.subtotal === 'number' ? body.subtotal : 0,
    totalDeposit: typeof body.totalDeposit === 'number' ? body.totalDeposit : 0,
    total: typeof body.total === 'number' ? body.total : 0,
    // Per-order delivery dates were removed in 2026-04-29; brewery delivers
    // Thursdays + Fridays and admin schedules from the queue.
    deliveryDate: null,
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
  // await without risking the order creation. Reuse the customer record we
  // already looked up above instead of doing a second round-trip.
  try {
    const customer = matchedCustomer;
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
        notes: order.notes,
      });
    }
  } catch (err) {
    console.error('[email] notifyOrderPlaced failed (non-fatal):', err);
  }

  return NextResponse.json(order, { status: 201 });
  } catch (err) {
    console.error('[api/orders POST] failed:', err);
    const message = extractError(err);
    return NextResponse.json({ error: `Order create failed: ${message}` }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
  const admin = isAdminRequest(request);
  if (!admin) {
    return NextResponse.json({ error: 'Admin session required' }, { status: 403 });
  }
  const body = await request.json();
  const { id, ...updates } = body;

  const existingOrder = await getOrder(id);
  if (!existingOrder) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  }

  // pending -> confirmed: decrement inventory AND post keg ledger deposits +
  // returns. Confirmation is when the brewery commits to the order — kegs
  // are earmarked for the customer, so that's when keg tracking kicks in.
  // Idempotent guard: if ledger entries already exist for this order
  // (e.g. order was confirmed, cancelled back to pending, and is now being
  // re-confirmed), skip the keg-ledger insert pass to avoid duplicates.
  if (updates.status === 'confirmed' && existingOrder.status === 'pending') {
    const priorLedger = await (async () => {
      try {
        const { getKegLedgerByCustomer } = await import('@/lib/data');
        const rows = await getKegLedgerByCustomer(existingOrder.customerId);
        return rows.filter((r) => r.orderId === existingOrder.id);
      } catch { return []; }
    })();
    const alreadyLedgered = priorLedger.length > 0;
    // Track which sizes cross below the low-stock threshold so we can fire
    // a single digest email instead of N per-order emails.
    const crossed: Array<{ productName: string; size: string; remaining: number }> = [];
    // Inventory decrement is gated on !alreadyLedgered for the same reason
    // as the ledger block below: if a prior confirm attempt already posted
    // the deposit entries, inventory was already decremented. Without this
    // guard, a retry (which happens when the first attempt failed mid-way,
    // e.g. an invoice-create error) would double-decrement.
    if (!alreadyLedgered) {
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

    // Keg ledger deposits: one row per line item. These count against the
    // customer's outstanding-keg balance until they return the empties.
    // Skip if we already posted entries for this order (re-confirm flow).
    if (!alreadyLedgered) {
      const now = new Date().toISOString();
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
          notes: `Order ${existingOrder.id} confirmed`,
        };
        await addKegLedgerEntry(entry);
      }
      // Returns the customer declared at checkout. CRITICAL: these are
      // posted as `pending`, not `approved`, so they do NOT subtract from
      // the customer's outstanding-keg balance until the brewery physically
      // receives the empties and admin manually approves the return from
      // the keg-tracker pending queue. Per client (2026-04-29): "keg returns
      // are still adjusting automatically based on what the order says. We
      // don't want keg returns calculated until they are in our possession
      // and we manually confirm the returns. THIS IS VERY IMPORTANT."
      for (const ret of existingOrder.kegReturns) {
        const depositAmounts: Record<string, number> = { '1/2bbl': 50, '1/4bbl': 40, '1/6bbl': 30 };
        const entry: KegLedgerEntry = {
          id: generateId('kl'),
          customerId: existingOrder.customerId,
          orderId: existingOrder.id,
          type: 'return',
          size: ret.size,
          quantity: ret.quantity,
          depositAmount: depositAmounts[ret.size] || 0,
          totalAmount: -((depositAmounts[ret.size] || 0) * ret.quantity),
          date: now,
          notes: `Customer declared on order ${existingOrder.id} — awaiting brewery confirmation`,
          status: 'pending',
        };
        await addKegLedgerEntry(entry);
      }
    }
  }

  // Conversely, if an order is cancelled back to pending after confirmation,
  // restore the inventory. This is symmetric and prevents double-decrements.
  if (updates.status === 'pending' && existingOrder.status === 'confirmed') {
    for (const item of existingOrder.items) {
      await adjustProductInventory(item.productId, item.size, item.quantity);
    }
  }

  // Cancellation: restore inventory if it was confirmed, and void any draft
  // invoice so it doesn't sit around forever. Keg ledger entries shouldn't
  // exist yet (those only fire on confirmed), so nothing to roll back there.
  if (updates.status === 'cancelled' && existingOrder.status !== 'cancelled') {
    if (existingOrder.status === 'confirmed') {
      for (const item of existingOrder.items) {
        await adjustProductInventory(item.productId, item.size, item.quantity);
      }
    }
    // Any existing invoice for this order becomes informationally useless
    // if still draft. Mark paid as-is would be lying; we'll leave it draft
    // and let admin delete it manually if needed. Keeping this simple.
  }

  // pending -> confirmed: also run the auto-send-invoice path since
  // confirmed is now the "brewery committed" signal (delivered state
  // was removed). If the customer has autoSendInvoices on, the draft
  // invoice flips to unpaid + emails.
  if (updates.status === 'confirmed' && existingOrder.status === 'pending') {
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
    // Legacy fallback: if no invoice exists yet, create one as unpaid.
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
        issuedAt: new Date().toISOString(),
        paidAt: null,
      };
      await createInvoice(invoice);
    }
  }

  const order = await updateOrder(id, updates);

  // Email the customer on 'confirmed' transition only. Brewery preference:
  // customers want to know the moment their order is committed to; a
  // "completed" email is redundant since they already have the kegs in
  // hand by then. Pending is internal. Await so Vercel doesn't cut the
  // promise.
  if (
    order &&
    updates.status === 'confirmed' &&
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
          newStatus: 'confirmed',
        });
      }
    } catch (err) {
      console.error('[email] notifyOrderStatusChanged failed (non-fatal):', err);
    }
  }

  return NextResponse.json(order);
  } catch (err) {
    console.error('[api/orders PUT] failed:', err);
    const message = extractError(err);
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
    <p style="margin:12px 0;">Your order is confirmed. Invoice for <strong>${escapeHtml(invoice.orderId)}</strong> is below. Payment due on receipt.</p>
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
    subject: `Invoice ${invoice.id} from Guidon Brewing Co.`,
    html,
  });
}

function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}
