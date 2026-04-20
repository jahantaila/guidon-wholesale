import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, recordFailure, clearKey, keyForRequest } from '@/lib/rate-limit';

/**
 * GET /api/admin/login — session check. Returns 200 if the admin_session
 * cookie is present and valid, 401 otherwise. Required because the session
 * cookie is HTTP-only so the browser's document.cookie cannot see it, and
 * relying on document.cookie for auth state (as the old admin layout did)
 * broke navigation between admin sub-routes.
 */
export async function GET(request: NextRequest) {
  const session = request.cookies.get('admin_session');
  if (session?.value === 'authenticated') {
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
    const response = NextResponse.json({ success: true });
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
