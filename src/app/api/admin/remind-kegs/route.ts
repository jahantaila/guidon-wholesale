import { NextRequest, NextResponse } from 'next/server';
import { extractError } from '@/lib/extract-error';
import { getOrder, getOrders, getCustomers } from '@/lib/data';
import { notifyKegReminder, portalUrl } from '@/lib/email';

/**
 * POST /api/admin/remind-kegs
 * Body: { orderId?: string } OR { customerId?: string }
 *
 * Sends a keg-return reminder email to the customer. Two call shapes:
 * - orderId: reminder tied to a specific confirmed/completed order (original
 *   flow, called from admin orders list).
 * - customerId: finds the customer's most recent confirmed-or-completed
 *   order and uses that as context (called from admin keg tracker row
 *   where "the" order doesn't make sense — Mike just wants the customer
 *   to return all outstanding kegs).
 */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const orderId: string | undefined = body?.orderId;
  const customerId: string | undefined = body?.customerId;
  if (!orderId && !customerId) {
    return NextResponse.json({ error: 'orderId or customerId is required.' }, { status: 400 });
  }

  let order = orderId ? await getOrder(orderId) : undefined;

  // customerId path: find the customer's most recent confirmed-or-completed
  // order and use that as the email context.
  if (!order && customerId) {
    const all = await getOrders();
    const candidates = all
      .filter((o) => o.customerId === customerId && (o.status === 'confirmed' || o.status === 'completed'))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    order = candidates[0];
    if (!order) {
      return NextResponse.json(
        { error: 'No confirmed orders found for this customer yet.' },
        { status: 404 },
      );
    }
  }

  if (!order) {
    return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
  }
  if (order.status !== 'confirmed' && order.status !== 'completed') {
    return NextResponse.json(
      { error: 'Keg reminders are only sent for confirmed or completed orders.' },
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
      portalUrl: portalUrl(),
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = extractError(err);
    return NextResponse.json({ error: `Failed to send reminder: ${msg}` }, { status: 500 });
  }
}
