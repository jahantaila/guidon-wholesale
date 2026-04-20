import type { NextRequest } from 'next/server';

/**
 * Returns true if the request carries valid admin auth. Accepts either:
 * - `admin_session` cookie = 'authenticated' (first-party contexts)
 * - `Authorization: Bearer authenticated` header (iframe contexts where
 *   browsers block 3rd-party cookies)
 */
export function isAdminRequest(request: NextRequest): boolean {
  if (request.cookies.get('admin_session')?.value === 'authenticated') return true;
  const auth = request.headers.get('authorization');
  if (auth?.startsWith('Bearer ') && auth.slice(7) === 'authenticated') return true;
  return false;
}

/**
 * Returns a server-side auth context for an incoming request:
 * - `admin`: admin session valid (cookie or header)
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
  const admin = isAdminRequest(request);
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
