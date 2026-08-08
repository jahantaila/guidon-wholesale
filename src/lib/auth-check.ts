import type { NextRequest } from 'next/server';
import { verifySession, bearerFrom } from './session-token';

/**
 * Auth helpers for admin + portal requests.
 *
 * These are async because verification is HMAC over Web Crypto, which is the
 * only crypto available in the Edge middleware. See src/lib/session-token.ts
 * for why the old marker-string scheme had to go.
 *
 * Both cookie and Authorization header are accepted, and both must carry a
 * *signed* token. Accepting a bare value in either position is a full bypass:
 * a header is settable by anyone, and so is a cookie when the caller is curl
 * rather than a browser.
 */

export const ADMIN_SESSION_COOKIE = 'admin_session';
export const PORTAL_SESSION_COOKIE = 'portal_session';

/** True if the request carries a valid, unexpired admin token. */
export async function isAdminRequest(request: NextRequest): Promise<boolean> {
  const cookie = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  if (await verifySession(cookie, 'admin')) return true;

  const bearer = bearerFrom(request.headers.get('authorization'));
  if (await verifySession(bearer, 'admin')) return true;

  return false;
}

/**
 * Server-side auth context for an incoming request:
 * - `admin`: valid admin token (cookie or header)
 * - `portalCustomerId`: customer id from a valid portal token, else ''
 *
 * Routes that scope data by ?customerId= should check:
 *   if (!ctx.admin && ctx.portalCustomerId !== requestedCustomerId) return 403;
 */
export async function authContext(request: NextRequest): Promise<{
  admin: boolean;
  portalCustomerId: string;
}> {
  const admin = await isAdminRequest(request);

  const cookie = request.cookies.get(PORTAL_SESSION_COOKIE)?.value;
  let portal = await verifySession(cookie, 'portal');
  if (!portal) {
    // Header fallback. Browsers drop the cookie entirely when the portal is
    // loaded in the WordPress iframe (third-party cookie blocking), which is
    // what made customers see "session expired" at checkout.
    const bearer = bearerFrom(request.headers.get('authorization'));
    portal = await verifySession(bearer, 'portal');
  }

  return { admin, portalCustomerId: portal?.sub || '' };
}

/**
 * True if the caller may read data for `customerId` — admin always, portal
 * customer only for their own row.
 */
export async function canAccessCustomer(
  request: NextRequest,
  customerId: string,
): Promise<boolean> {
  const { admin, portalCustomerId } = await authContext(request);
  return admin || portalCustomerId === customerId;
}
