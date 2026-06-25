import type { NextResponse } from 'next/server';

/**
 * Portal customer session cookie.
 *
 * Was a fixed 24h lifetime, which logged wholesale customers out once a day.
 * Combined with the portal silently keeping its last-good logged-in state when
 * the session check (/api/portal/me) returned 401, an expired cookie surfaced
 * as "Authentication required to place an order." at checkout — the customer
 * still saw the dashboard but the order POST had no session. (Reported by
 * Salty Landing + Green River Brew Depot, 2026-06.)
 *
 * Fix: a 30-day rolling session. The cookie is re-set (slid forward) on every
 * authenticated portal hit (login, session bootstrap, /me refetch), so an
 * actively-used account effectively never expires.
 */
export const PORTAL_SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days
export const PORTAL_SESSION_COOKIE = 'portal_session';

function sameSite(): 'none' | 'lax' {
  // SameSite=None + Secure in prod so the embedded /embed/portal iframe on the
  // brewery's WordPress site can carry the session. Lax in dev because HTTP
  // localhost rejects SameSite=None.
  return process.env.NODE_ENV === 'production' ? 'none' : 'lax';
}

export function setPortalSessionCookie(res: NextResponse, customerId: string): void {
  res.cookies.set(PORTAL_SESSION_COOKIE, customerId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: sameSite(),
    maxAge: PORTAL_SESSION_MAX_AGE,
    path: '/',
  });
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
