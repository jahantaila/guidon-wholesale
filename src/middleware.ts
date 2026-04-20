import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Protect admin API routes (except login). Accepts either the
  // admin_session cookie or an Authorization: Bearer <token> header so
  // iframe-embedded admin dashboards still work when browsers block
  // 3rd-party cookies.
  if (pathname.startsWith('/api/admin/') && !pathname.startsWith('/api/admin/login')) {
    const cookie = request.cookies.get('admin_session')?.value;
    const auth = request.headers.get('authorization');
    const bearer = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
    if (cookie !== 'authenticated' && bearer !== 'authenticated') {
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
