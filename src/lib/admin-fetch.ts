/**
 * Admin-side fetch wrapper. Every admin UI fetch goes through this so we
 * can handle session-expiry (401) uniformly: instead of letting the caller
 * show a cryptic "Unauthorized" alert, we silently clear any stale local
 * auth state and bounce the user to /admin (which renders the login form).
 *
 * Usage in admin components:
 *   import { adminFetch } from '@/lib/admin-fetch';
 *   const res = await adminFetch('/api/admin/inventory', { method: 'PATCH', body: JSON.stringify(...) });
 *
 * Non-401 responses pass through unchanged. Callers still check res.ok for
 * validation / server errors and handle those domain errors themselves.
 */
export async function adminFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const res = await fetch(input, init);
  if (res.status === 401 && typeof window !== 'undefined') {
    // Session expired or missing. Drop any stored auth state so AdminLayout
    // re-renders the login form, and redirect to /admin if we're deeper in
    // the admin section.
    try {
      // Best-effort logout to clear any state the server has as well.
      await fetch('/api/admin/login', { method: 'DELETE' });
    } catch {
      // ignore; the redirect itself is sufficient
    }
    const path = window.location.pathname;
    if (path.startsWith('/admin/')) {
      // Bounce to /admin; the layout will show the login form. After login,
      // the original admin URL is still intact because we only navigated the
      // tab once.
      window.location.href = '/admin';
    } else if (path === '/admin') {
      // Already on /admin; just reload so the layout re-evaluates auth.
      window.location.reload();
    }
  }
  return res;
}
