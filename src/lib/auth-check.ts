import type { NextRequest } from 'next/server';

/**
 * Returns a server-side auth context for an incoming request:
 * - `admin`: admin_session cookie is 'authenticated'
 * - `portalCustomerId`: the customer_id logged in via /api/portal/login
 *    (empty string if no portal session)
 *
 * Routes that scope data by ?customerId= should check:
 *   if (!ctx.admin && ctx.portalCustomerId !== requestedCustomerId) return 403;
 */
export function authContext(request: NextRequest): {
  admin: boolean;
  portalCustomerId: string;
} {
  const admin = request.cookies.get('admin_session')?.value === 'authenticated';
  const portalCustomerId = request.cookies.get('portal_session')?.value || '';
  return { admin, portalCustomerId };
}

/**
 * Convenience: returns true if the caller can read data for `customerId`
 * (admin can always; portal customer can only read their own row).
 */
export function canAccessCustomer(request: NextRequest, customerId: string): boolean {
  const { admin, portalCustomerId } = authContext(request);
  return admin || portalCustomerId === customerId;
}
