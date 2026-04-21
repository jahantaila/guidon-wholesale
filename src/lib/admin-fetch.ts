/**
 * Admin-side fetch wrapper.
 *
 * 1. Adds `Authorization: Bearer <token>` from localStorage on every request.
 *    The token is set after a successful admin login (see AdminLayout).
 *    This is the fallback for when the admin dashboard is loaded in an
 *    iframe on a different origin (Derby Digital's management portal
 *    embedding /admin). Modern browsers block 3rd-party cookies even with
 *    SameSite=None, so the admin_session cookie silently fails to flow.
 *    The header gets through regardless.
 *
 * 2. On 401 — session expired or missing — clears the token, drops any
 *    server cookie via DELETE /api/admin/login, and redirects back to
 *    /admin so the layout re-renders the login form.
 *
 * Non-401 responses pass through unchanged; callers still inspect res.ok
 * for domain errors.
 */

const TOKEN_KEY = 'guidon_admin_token';

export function getAdminToken(): string | null {
  if (typeof window === 'undefined') return null;
  try { return window.localStorage.getItem(TOKEN_KEY); } catch { return null; }
}

export function setAdminToken(token: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch { /* storage disabled */ }
}

export async function adminFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const token = getAdminToken();
  const headers = new Headers(init?.headers);
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  const res = await fetch(input, { ...init, headers });
  // Only treat 401 as a session-expiry event if we *sent* auth. With no
  // token, a 401 is the expected "not logged in" response that the admin
  // layout's initial probe relies on to show the login form. If we
  // redirect/reload here on a token-less 401, the layout remounts,
  // re-probes, gets another 401, and loops forever.
  if (res.status === 401 && token && typeof window !== 'undefined') {
    setAdminToken(null);
    try {
      await fetch('/api/admin/login', { method: 'DELETE' });
    } catch {
      // ignore
    }
    const path = window.location.pathname;
    if (path.startsWith('/admin/')) {
      window.location.href = '/admin';
    } else if (path === '/admin') {
      window.location.reload();
    }
  }
  return res;
}
