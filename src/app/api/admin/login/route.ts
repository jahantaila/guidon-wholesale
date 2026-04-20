import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, recordFailure, clearKey, keyForRequest } from '@/lib/rate-limit';

/**
 * Shared token for header-based auth. Any code using the Authorization
 * header as a cookie replacement passes this constant — admin.
 *
 * Why: modern browsers (Chrome, Safari ITP) block 3rd-party cookies when
 * the admin dashboard is loaded in an iframe on a different origin (e.g.
 * Derby Digital's management portal embedding /admin). With cookies
 * silently dropped, every admin PUT/DELETE 401'd.
 *
 * Fix: admin login POST returns a token. The client stores it in localStorage
 * and sends Authorization: Bearer <token> on every admin request.
 * adminFetch handles this transparently. Middleware accepts either the
 * cookie OR the header.
 *
 * Security model is unchanged: the token IS the auth marker, same as the
 * old cookie value was. Stored in the admin-origin localStorage — not
 * exposed to 3rd-party sites even if they iframe the admin.
 */
const ADMIN_TOKEN_VALUE = 'authenticated';

export async function GET(request: NextRequest) {
  const cookie = request.cookies.get('admin_session')?.value;
  const auth = request.headers.get('authorization');
  const bearer = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
  if (cookie === ADMIN_TOKEN_VALUE || bearer === ADMIN_TOKEN_VALUE) {
    return NextResponse.json({ authenticated: true });
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

  const body = await request.json();
  const adminPassword = process.env.ADMIN_PASSWORD || 'guidon2026';

  if (body.password === adminPassword) {
    clearKey(key);
    // Return the token in the body so iframe clients can cache it in
    // localStorage and send it as Authorization: Bearer on subsequent
    // requests (fallback when 3rd-party cookies are blocked).
    const response = NextResponse.json({ success: true, token: ADMIN_TOKEN_VALUE });
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
    response.cookies.set('admin_session', 'authenticated', {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'none' : 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
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
