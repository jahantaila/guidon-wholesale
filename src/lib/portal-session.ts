import type { NextResponse } from 'next/server';
import { signSession, PORTAL_SESSION_MAX_AGE } from './session-token';

/**
 * Portal customer session.
 *
 * HISTORY
 * -------
 * Originally a fixed 24h lifetime, which logged wholesale customers out once
 * a day. PR #25 made it a 30-day rolling session; PR #26 improved the error
 * surfacing. Customers (Salty Landing, Ecusta Market) kept reporting "Your
 * session expired. Please sign in again to place your order" anyway.
 *
 * Neither fix worked, because neither addressed the actual cause: the portal
 * is embedded in the brewery's WordPress site via an iframe (/embed/portal),
 * where `portal_session` is a THIRD-PARTY cookie. Safari has blocked those
 * outright since 2020 and Chrome now restricts them. SameSite=None + Secure
 * is necessary but nowhere near sufficient. The cookie was never being stored
 * at all, so the first authenticated request after login 401'd. "Kicked out
 * after 30 seconds" was just how long the customer browsed before hitting one.
 *
 * Fix: login also returns a signed token that the client caches in
 * localStorage and sends as `Authorization: Bearer <token>` (see
 * src/lib/portal-fetch.ts). Same workaround admin already had.
 *
 * The cookie now carries that signed token rather than the bare customer id.
 * A raw id was forgeable by anyone — cookies are just headers, so
 * `curl -H "Cookie: portal_session=cust-a1b2c3"` read that customer's orders
 * and invoices without a password.
 */
export { PORTAL_SESSION_MAX_AGE } from './session-token';
export const PORTAL_SESSION_COOKIE = 'portal_session';

function sameSite(): 'none' | 'lax' {
  // SameSite=None + Secure in prod so the embedded /embed/portal iframe on the
  // brewery's WordPress site can carry the session where third-party cookies
  // are still permitted. Lax in dev because HTTP localhost rejects None.
  return process.env.NODE_ENV === 'production' ? 'none' : 'lax';
}

/** Mints a portal token for a customer. */
export async function signPortalToken(customerId: string): Promise<string> {
  return signSession('portal', customerId, PORTAL_SESSION_MAX_AGE);
}

/**
 * Attaches an already-signed token as the session cookie.
 *
 * Split from signing so the route can put the same token in the JSON body —
 * iframe clients need it there because their cookie gets dropped.
 */
export function attachPortalSessionCookie(res: NextResponse, token: string): void {
  res.cookies.set(PORTAL_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: sameSite(),
    maxAge: PORTAL_SESSION_MAX_AGE,
    path: '/',
  });
}

/** Convenience: sign + attach in one call. Returns the token. */
export async function setPortalSessionCookie(
  res: NextResponse,
  customerId: string,
): Promise<string> {
  const token = await signPortalToken(customerId);
  attachPortalSessionCookie(res, token);
  return token;
}

export function clearPortalSessionCookie(res: NextResponse): void {
  res.cookies.set(PORTAL_SESSION_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: sameSite(),
    maxAge: 0,
    path: '/',
  });
}
