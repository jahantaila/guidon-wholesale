import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, recordFailure, clearKey, keyForRequest } from '@/lib/rate-limit';
import { isAdminRequest } from '@/lib/auth-check';
import { signSession, isSessionSigningConfigured, ADMIN_SESSION_MAX_AGE } from '@/lib/session-token';

/**
 * Admin login. Issues an HMAC-signed session token carried in BOTH the
 * admin_session cookie and (for clients that need it) the response body.
 *
 * Why the header path exists: modern browsers (Chrome, Safari ITP) block
 * 3rd-party cookies when the admin dashboard is loaded in an iframe on a
 * different origin. With cookies silently dropped, every admin PUT/DELETE
 * 401'd. The client caches the token in localStorage and sends it as
 * Authorization: Bearer <token>; adminFetch does this transparently.
 *
 * The token used to be the literal string 'authenticated'. That made the
 * header path a complete authentication bypass — `curl -H "Authorization:
 * Bearer authenticated"` returned every customer's PII. Tokens are now signed
 * and expiring (see src/lib/session-token.ts). Existing sessions from before
 * this change no longer verify, so admins re-login once. That is the point.
 */

export async function GET(request: NextRequest) {
  if (await isAdminRequest(request)) {
    // Re-issue on probe so a cookie-only session can backfill its
    // localStorage token, and so an actively-used session slides forward
    // instead of hard-expiring at 7 days.
    const token = await signSession('admin', 'admin', ADMIN_SESSION_MAX_AGE);
    return NextResponse.json({ authenticated: true, token });
  }
  return NextResponse.json({ authenticated: false }, { status: 401 });
}

export async function POST(request: NextRequest) {
  // Rate limit FIRST so a brute-force attempt can't even check passwords.
  const key = keyForRequest(request);
  const limit = checkRateLimit(key);
  if (!limit.allowed) {
    const mins = Math.ceil(limit.retryAfterMs / 60000);
    return NextResponse.json(
      {
        error:
          limit.reason === 'locked'
            ? `Too many failed attempts. Try again in ${mins} minute${mins === 1 ? '' : 's'}.`
            : `Too many attempts. Wait ${mins} minute${mins === 1 ? '' : 's'} before trying again.`,
      },
      {
        status: 429,
        headers: { 'Retry-After': String(Math.ceil(limit.retryAfterMs / 1000)) },
      },
    );
  }

  // A missing signing secret makes signSession throw. Uncaught, that surfaces
  // to the browser as the generic "Login failed. Please try again." string —
  // indistinguishable from a wrong password, so the brewery would go hunting
  // for a changed password instead of a misconfigured deploy. Check first and
  // say what is actually wrong.
  if (!isSessionSigningConfigured()) {
    console.error('[admin/login] no signing secret — set SESSION_SECRET.');
    return NextResponse.json(
      { error: 'Server auth is misconfigured. Set SESSION_SECRET.' },
      { status: 503 },
    );
  }

  const body = await request.json();
  const adminPassword = process.env.ADMIN_PASSWORD || 'guidon2026';

  if (body.password === adminPassword) {
    clearKey(key);
    // Return the token in the body so iframe clients can cache it in
    // localStorage and send it as Authorization: Bearer on subsequent
    // requests (fallback when 3rd-party cookies are blocked).
    const token = await signSession('admin', 'admin', ADMIN_SESSION_MAX_AGE);
    const response = NextResponse.json({ success: true, token });
    // Cookie attributes:
    // - SameSite=None + Secure in production so the admin keeps working when
    //   iframed from a different origin (the user is testing the app
    //   embedded in a WordPress site; SameSite=Lax would drop the cookie on
    //   cross-site iframe requests and the admin would appear unauthed).
    //   SameSite=None requires Secure which requires HTTPS, so dev falls
    //   back to Lax.
    // - httpOnly so JS on the page can't read the token.
    // - 7-day maxAge so brewery staff don't re-login every morning.
    const isProd = process.env.NODE_ENV === 'production';
    response.cookies.set('admin_session', token, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'none' : 'lax',
      path: '/',
      maxAge: ADMIN_SESSION_MAX_AGE,
    });
    return response;
  }

  recordFailure(key);
  return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
}

export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.delete('admin_session');
  return response;
}
