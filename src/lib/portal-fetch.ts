/**
 * Portal-side fetch wrapper.
 *
 * Adds `Authorization: Bearer <portal token>` from localStorage on every
 * request. The token comes back in the body of /api/portal/login (POST and
 * GET) and is cached here.
 *
 * Why this exists: the portal is embedded in the brewery's WordPress site via
 * an iframe, where `portal_session` is a third-party cookie. Safari blocks
 * those outright; Chrome restricts them. The cookie is simply never stored,
 * so the customer looks logged in (the UI renders from the login response)
 * right up until the first authenticated request 401s — which is what
 * produced "Your session expired. Please sign in again to place your order"
 * at checkout, and what Ecusta Market described as being kicked out after
 * 30 seconds.
 *
 * Admin already had this exact workaround (see admin-fetch.ts). The customer
 * path never got it.
 */

const TOKEN_KEY = 'guidon_portal_token';

export function getPortalToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setPortalToken(token: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage disabled (Safari private mode) — cookie path may still work */
  }
}

/**
 * Fetch with the portal bearer token attached.
 *
 * Deliberately does NOT auto-redirect on 401, unlike adminFetch. The portal
 * renders its own signed-out state and several callers treat 401 as "not
 * logged in yet" during bootstrap. Callers inspect res.status themselves.
 */
export function portalFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const token = getPortalToken();
  if (!token) return fetch(input, init);
  const headers = new Headers(init?.headers);
  if (!headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}
