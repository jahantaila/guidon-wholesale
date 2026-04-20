import { NextRequest, NextResponse } from 'next/server';
import { getOrder, getCustomers } from '@/lib/data';
import { notifyKegReminder } from '@/lib/email';

/**
 * POST /api/admin/remind-kegs
 * Body: { orderId: string }
 *
 * Sends a keg-return reminder email to the customer of the given order.
 * Intended for admin use on delivered orders that still have outstanding
 * keg deposits. Idempotent — admin can click multiple times; the email
 * goes out each time.
 */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const orderId: string | undefined = body?.orderId;
  if (!orderId) {
    return NextResponse.json({ error: 'orderId is required.' }, { status: 400 });
  }

  const order = await getOrder(orderId);
  if (!order) {
    return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
  }
  if (order.status !== 'delivered' && order.status !== 'completed') {
    return NextResponse.json(
      { error: 'Keg reminders are only sent for delivered or completed orders.' },
      { status: 400 },
    );
  }

  const customers = await getCustomers();
  const customer = customers.find((c) => c.id === order.customerId);
  if (!customer) {
    return NextResponse.json({ error: 'Customer not found.' }, { status: 404 });
  }

  try {
    await notifyKegReminder({
      orderId: order.id,
      customerEmail: customer.email,
      customerName: customer.contactName,
      businessName: customer.businessName,
      items: order.items,
      deliveryDate: order.deliveryDate,
      portalUrl: 'https://guidon-wholesale.vercel.app/portal',
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Failed to send reminder: ${msg}` }, { status: 500 });
  }
}
