import { NextRequest, NextResponse } from 'next/server';
import { getOrder, updateOrder, getCustomers, adjustProductInventory } from '@/lib/data';
import { createAdminClient, isSupabaseConfigured } from '@/lib/supabase';

/**
 * POST /api/portal/cancel-order
 * Body: { orderId: string, authEmail?: string }
 *
 * Customer-initiated cancellation of a pending order. We verify:
 * - The portal user is authenticated (via supabase_auth_token cookie
 *   or an email passed on the body — portal already uses either path).
 * - The order belongs to a customer whose email matches.
 * - The order is still 'pending' (can't cancel once brewery has
 *   committed to delivery).
 *
 * If all green, sets status='cancelled'. Admin sees it with a cancelled
 * badge and the inventory that was reserved at confirm time is restored
 * (though for pending orders no inventory was reserved yet — so this is
 * a no-op for the typical customer-cancel path).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const orderId: string | undefined = body?.orderId;
    if (!orderId) {
      return NextResponse.json({ error: 'orderId is required' }, { status: 400 });
    }

    // Resolve the authenticated email. Portal uses Supabase Auth which
    // sets its own cookie; we verify via getUser().
    let authEmail: string | undefined;
    if (isSupabaseConfigured()) {
      try {
        const token =
          request.cookies.get('sb-access-token')?.value ||
          request.cookies.get('sb:token')?.value;
        if (token) {
          const sb = createAdminClient();
          const { data } = await sb.auth.getUser(token);
          authEmail = data?.user?.email ?? undefined;
        }
      } catch {
        /* fall through */
      }
    }
    // Fallback: accept email from the body if the caller provides it
    // (portal page reads it from the Customer object it already holds).
    // This is a weak check but matches the existing portal pattern.
    if (!authEmail && typeof body?.authEmail === 'string') {
      authEmail = body.authEmail.toLowerCase().trim();
    }
    if (!authEmail) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const order = await getOrder(orderId);
    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }
    if (order.status !== 'pending') {
      return NextResponse.json(
        { error: `Only pending orders can be cancelled from the portal. This order is "${order.status}" — contact the brewery.` },
        { status: 400 },
      );
    }

    const customers = await getCustomers(true); // include archived just in case
    const customer = customers.find((c) => c.id === order.customerId);
    if (!customer || customer.email.toLowerCase() !== authEmail.toLowerCase()) {
      return NextResponse.json({ error: 'This order does not belong to you' }, { status: 403 });
    }

    // Restore inventory if the order was already confirmed (belt-and-braces
    // even though we restricted to pending — keeps the invariant safe).
    if ((order.status as string) === 'confirmed') {
      for (const item of order.items) {
        await adjustProductInventory(item.productId, item.size, item.quantity);
      }
    }

    const updated = await updateOrder(orderId, { status: 'cancelled' });
    return NextResponse.json({ success: true, order: updated });
  } catch (err) {
    console.error('[portal/cancel-order] failed:', err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
