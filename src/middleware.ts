import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifySession, bearerFrom } from '@/lib/session-token';

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
  if (pathname.startsWith('/api/admin/') && !pathname.startsWith('/api/admin/login')) {
    const cookie = request.cookies.get('admin_session')?.value;
    const bearer = bearerFrom(request.headers.get('authorization'));
    const ok =
      (await verifySession(cookie, 'admin')) || (await verifySession(bearer, 'admin'));
    if (!ok) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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
