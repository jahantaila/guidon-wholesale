import { NextRequest, NextResponse } from 'next/server';
import { getCustomer } from '@/lib/data';

/**
 * GET /api/portal/me
 *
 * Returns the currently-logged-in portal customer's profile, sourced
 * from the portal_session cookie. Used by the portal UI to refetch
 * the customer record when the page mounts and on window focus, so
 * any admin-side edits propagate to the customer's view without
 * requiring a re-login.
 *
 * Mirrors the projection from /api/portal/login: no password, no
 * customer_identification (brewery-internal field), no archived_at,
 * no notes/tags/auto_send_invoices (also admin-internal). The
 * customer only sees what they're allowed to manage themselves.
 */
export async function GET(request: NextRequest) {
  const customerId = request.cookies.get('portal_session')?.value || '';
  if (!customerId) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  }
  const customer = await getCustomer(customerId);
  if (!customer) {
    return NextResponse.json({ error: 'Customer not found.' }, { status: 404 });
  }
  if (customer.archivedAt) {
    return NextResponse.json(
      { error: 'This account has been archived. Please contact the brewery.' },
      { status: 403 },
    );
  }
  // Strip admin-only + sensitive fields. Mirror the login route's projection
  // so the customer's portal sees a consistent shape.
  return NextResponse.json({
    id: customer.id,
    businessName: customer.businessName,
    contactName: customer.contactName,
    email: customer.email,
    phone: customer.phone,
    streetAddress: customer.streetAddress,
    city: customer.city,
    state: customer.state,
    zip: customer.zip,
    abcPermitNumber: customer.abcPermitNumber,
    preferredPaymentMethod: customer.preferredPaymentMethod,
    mustChangePassword: customer.mustChangePassword === true,
    createdAt: customer.createdAt,
  });
}
