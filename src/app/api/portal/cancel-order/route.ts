import { NextRequest, NextResponse } from 'next/server';
import { extractError } from '@/lib/extract-error';
import { authContext } from '@/lib/auth-check';
import { getOrder, updateOrder, getCustomers, adjustProductInventory } from '@/lib/data';

/**
 * POST /api/portal/cancel-order
 * Body: { orderId: string }
 *
 * Customer-initiated cancellation of a pending order. Authorization comes
 * from authContext, which resolves the customer id out of the signed
 * portal session (cookie, or Bearer header when the portal is iframed and
 * the cookie is dropped). We require it to match the order's customerId.
 * No body-supplied email that could be spoofed.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const orderId: string | undefined = body?.orderId;
    if (!orderId) {
      return NextResponse.json({ error: 'orderId is required' }, { status: 400 });
    }

    const { portalCustomerId: sessionCustomerId } = await authContext(request);
    if (!sessionCustomerId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const order = await getOrder(orderId);
    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }
    if (order.customerId !== sessionCustomerId) {
      return NextResponse.json({ error: 'This order does not belong to you' }, { status: 403 });
    }
    if (order.status !== 'pending') {
      return NextResponse.json(
        { error: `Only pending orders can be cancelled from the portal. This order is "${order.status}" — contact the brewery.` },
        { status: 400 },
      );
    }

    // Sanity check: ensure the customer record still exists + matches
    const customers = await getCustomers(true);
    const customer = customers.find((c) => c.id === sessionCustomerId);
    if (!customer) {
      return NextResponse.json({ error: 'Customer account not found' }, { status: 404 });
    }

    // Pending orders haven't decremented inventory, so nothing to restore.
    // If somehow this gets called with a status that already reserved
    // inventory (shouldn't happen since we gate on 'pending'), the admin
    // PUT /api/orders { status: 'cancelled' } path handles the restore.

    const updated = await updateOrder(orderId, { status: 'cancelled' });
    return NextResponse.json({ success: true, order: updated });
  } catch (err) {
    console.error('[portal/cancel-order] failed:', err);
    const message = extractError(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
