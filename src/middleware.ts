import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifySession, bearerFrom, isSessionSigningConfigured } from '@/lib/session-token';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Protect admin API routes (except login). Accepts either the
  // admin_session cookie or an Authorization: Bearer <token> header so
  // iframe-embedded admin dashboards still work when browsers block
  // 3rd-party cookies.
  //
  // Both positions must carry an HMAC-signed token. This used to compare
  // against the literal string 'authenticated', so anyone could send
  // `Authorization: Bearer authenticated` and get full admin. Confirmed
  // exploitable against production on 2026-08-07 (HTTP 200, real customer
  // data) before this fix landed. A cookie is no safer than a header when the
  // caller is curl, so neither may carry a bare marker value.
  // The login exemption is an EQUALITY check, not a prefix. `startsWith`
  // would silently exempt any future sibling route such as
  // /api/admin/login-attempts or /api/admin/login-history.
  if (pathname.startsWith('/api/admin/') && pathname !== '/api/admin/login') {
    // Middleware is DEFENCE IN DEPTH, not the boundary. Every /api/admin/*
    // handler calls isAdminRequest() itself.
    //
    // That matters because middleware runs on the Edge runtime, which does not
    // always resolve the same env vars as Node route handlers — with the
    // signing secret coming from a committed .env.local, Edge could not derive
    // the key while Node could. Enforcing here regardless produced a
    // split-brain in production: /api/admin/* 401'd for a legitimately
    // logged-in admin while /api/customers accepted the same token.
    //
    // So when this runtime has no signing key, defer rather than lock the
    // brewery out. This is not a bypass: an attacker cannot remove the key,
    // and the route handler re-checks in a runtime where it IS available.
    if (isSessionSigningConfigured()) {
      const cookie = request.cookies.get('admin_session')?.value;
      const bearer = bearerFrom(request.headers.get('authorization'));
      const ok =
        (await verifySession(cookie, 'admin')) || (await verifySession(bearer, 'admin'));
      if (!ok) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    } else {
      console.error('[middleware] no signing key in this runtime — deferring to route-level auth.');
    }
  }

  // Allow iframe embedding for /embed routes
  if (pathname.startsWith('/embed')) {
    const response = NextResponse.next();
    response.headers.delete('X-Frame-Options');
    response.headers.set('Content-Security-Policy', 'frame-ancestors *');
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/api/admin/:path*', '/embed/:path*'],
};
