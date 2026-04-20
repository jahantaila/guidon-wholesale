import { NextRequest, NextResponse } from 'next/server';
import { getInvoices, createInvoice, updateInvoice, getCustomers, getOrder } from '@/lib/data';
import { send, formatCurrencyForEmail } from '@/lib/email';
import { generateId } from '@/lib/utils';
import type { Invoice } from '@/lib/types';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const customerId = searchParams.get('customerId');
  // Unfiltered: admin-only. Scoped by customerId: allowed for portal users.
  if (!customerId) {
    const session = request.cookies.get('admin_session');
    if (session?.value !== 'authenticated') {
      return NextResponse.json([], { status: 200 });
    }
  }
  let invoices = await getInvoices();
  if (customerId) {
    invoices = invoices.filter(i => i.customerId === customerId);
  }
  return NextResponse.json(invoices);
}

/**
 * Manually create an invoice for an existing order. Used by the admin "Create
 * Invoice" action on the Invoices page — lets them generate an invoice for an
 * order that somehow ended up without one, or issue an additional invoice
 * (e.g. adjustment). Auto-create on order placement still runs in the orders
 * route; this is a backfill / manual path.
 *
 * Body: { orderId: string, autoSend?: boolean }
 * - autoSend=true issues it straight to the customer (status=unpaid + email).
 * - Default is draft so admin can review first.
 */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const orderId: string = body.orderId;
  const autoSend: boolean = body.autoSend === true;
  if (!orderId) {
    return NextResponse.json({ error: 'orderId is required' }, { status: 400 });
  }

  const order = await getOrder(orderId);
  if (!order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  }

  const now = new Date().toISOString();
  const invoice: Invoice = {
    id: generateId('inv'),
    orderId: order.id,
    customerId: order.customerId,
    status: autoSend ? 'unpaid' : 'draft',
    items: order.items,
    subtotal: order.subtotal,
    totalDeposit: order.totalDeposit,
    total: order.total,
    issuedAt: now,
    sentAt: autoSend ? now : null,
    paidAt: null,
  };

  const created = await createInvoice(invoice);

  if (autoSend) {
    await fireInvoiceEmail(created).catch((err) =>
      console.error('[email] invoice send failed (non-fatal):', err)
    );
  }

  return NextResponse.json(created, { status: 201 });
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, action } = body as { id?: string; action?: string };
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    // Whitelist the fields admin is allowed to mutate. Protects created_at,
    // totals, items, etc. from being overwritten via a crafted PUT.
    const updates: { status?: string; paidAt?: string | null; sentAt?: string | null } = {};
    if (typeof body.status === 'string') updates.status = body.status;
    if (body.paidAt === null || typeof body.paidAt === 'string') updates.paidAt = body.paidAt;
    if (body.sentAt === null || typeof body.sentAt === 'string') updates.sentAt = body.sentAt;

    // "resend" = just fire the email again without status change. Useful if a
    // customer says "never got the invoice" — one click instead of digging
    // through Resend's dashboard.
    if (action === 'resend') {
      const invoices = await getInvoices();
      const existing = invoices.find((i) => i.id === id);
      if (!existing) {
        return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
      }
      const stamped = await updateInvoice(id, { sentAt: new Date().toISOString() });
      if (stamped) {
        await fireInvoiceEmail(stamped).catch((err) =>
          console.error('[email] invoice resend failed (non-fatal):', err)
        );
      }
      return NextResponse.json(stamped);
    }

    if (updates.status === 'paid' && !updates.paidAt) {
      updates.paidAt = new Date().toISOString();
    }
    // Transitioning from draft -> unpaid means the admin clicked Send Invoice.
    // Stamp sent_at and fire the invoice email.
    const willSend = updates.status === 'unpaid' && !updates.sentAt;
    if (willSend) {
      updates.sentAt = new Date().toISOString();
    }

    const invoice = await updateInvoice(id, updates as Parameters<typeof updateInvoice>[1]);
    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    if (willSend) {
      await fireInvoiceEmail(invoice).catch((err) =>
        console.error('[email] invoice send failed (non-fatal):', err)
      );
    }

    return NextResponse.json(invoice);
  } catch (err) {
    console.error('[api/invoices PUT] failed:', err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function fireInvoiceEmail(invoice: Invoice) {
  const [customers, order] = await Promise.all([getCustomers(), getOrder(invoice.orderId)]);
  const customer = customers.find((c) => c.id === invoice.customerId);
  if (!customer) return;
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
    <p style="margin:12px 0;">Your invoice for order <strong>${escapeHtml(invoice.orderId)}</strong>${order?.deliveryDate ? ` (delivery ${escapeHtml(order.deliveryDate)})` : ''} is below. Payment due on delivery.</p>
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
