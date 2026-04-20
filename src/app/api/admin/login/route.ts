import { NextRequest, NextResponse } from 'next/server';

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
  const body = await request.json();
  const adminPassword = process.env.ADMIN_PASSWORD || 'guidon2026';

  if (body.password === adminPassword) {
    const response = NextResponse.json({ success: true });
    response.cookies.set('admin_session', 'authenticated', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24, // 24 hours
    });
    return response;
  }

  return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
}

export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.delete('admin_session');
  return response;
}
