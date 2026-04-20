import { NextRequest, NextResponse } from 'next/server';
import { getInvoices, updateInvoice, getCustomers, getOrder } from '@/lib/data';
import { send, formatCurrencyForEmail } from '@/lib/email';

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
  // Transitioning from draft -> unpaid means the admin clicked Send Invoice.
  // Stamp sent_at and fire the invoice email.
  const willSend = updates.status === 'unpaid' && !updates.sentAt;
  if (willSend) {
    updates.sentAt = new Date().toISOString();
  }

  const invoice = await updateInvoice(id, updates);
  if (!invoice) {
    return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
  }

  if (willSend) {
    (async () => {
      try {
        const [customers, order] = await Promise.all([getCustomers(), getOrder(invoice.orderId)]);
        const customer = customers.find((c) => c.id === invoice.customerId);
        if (!customer) return;
        const rows = invoice.items.map((i) => `
          <tr>
            <td style="padding:4px 8px;border-bottom:1px solid #EEE5CE;">${i.productName}</td>
            <td style="padding:4px 8px;border-bottom:1px solid #EEE5CE;font-family:monospace;">${i.size}</td>
            <td style="padding:4px 8px;border-bottom:1px solid #EEE5CE;text-align:right;font-family:monospace;">${i.quantity}</td>
            <td style="padding:4px 8px;border-bottom:1px solid #EEE5CE;text-align:right;font-family:monospace;">${formatCurrencyForEmail(i.unitPrice * i.quantity)}</td>
          </tr>`).join('');
        const html = `<!doctype html><html><body style="margin:0;padding:24px 16px;background:#F5EFDF;font-family:Georgia,serif;color:#2A2416;">
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:560px;margin:0 auto;border:1px solid #D8CDA8;background:#FBF7EA;">
  <tr><td style="padding:24px 28px 12px;border-bottom:1px solid #D8CDA8;">
    <div style="font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#9E7A3B;font-weight:600;margin-bottom:6px;">Guidon Brewing Co. &middot; Invoice</div>
    <h1 style="margin:0;font-family:Georgia,serif;font-size:24px;font-weight:500;">${invoice.id}</h1>
  </td></tr>
  <tr><td style="padding:20px 28px;font-size:15px;">
    <p>${customer.contactName} at ${customer.businessName},</p>
    <p style="margin:12px 0;">Your invoice for order <strong>${invoice.orderId}</strong>${order?.deliveryDate ? ` (delivery ${order.deliveryDate})` : ''} is attached below. Payment due on delivery.</p>
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
      } catch (err) {
        console.error('[email] invoice send failed (non-fatal):', err);
      }
    })();
  }

  return NextResponse.json(invoice);
}
