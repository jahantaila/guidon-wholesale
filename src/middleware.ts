import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Protect admin API routes (except login)
  if (pathname.startsWith('/api/admin/') && !pathname.startsWith('/api/admin/login')) {
    const session = request.cookies.get('admin_session');
    if (!session || session.value !== 'authenticated') {
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
