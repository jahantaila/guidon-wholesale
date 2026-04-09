import { NextRequest, NextResponse } from 'next/server';
import { getCustomers } from '@/lib/data';

export async function POST(request: NextRequest) {
  const { email, password } = await request.json();

  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 });
  }

  const customers = getCustomers();
  const customer = customers.find(
    (c) => c.email.toLowerCase() === email.trim().toLowerCase()
  );

  if (!customer || customer.password !== password) {
    return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 });
  }

  const response = NextResponse.json(customer);
  response.cookies.set('portal_session', customer.id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24, // 24 hours
    path: '/',
  });

  return response;
}

export async function GET(request: NextRequest) {
  const session = request.cookies.get('portal_session');
  if (!session?.value) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const customers = getCustomers();
  const customer = customers.find((c) => c.id === session.value);
  if (!customer) {
    return NextResponse.json({ error: 'Customer not found' }, { status: 401 });
  }

  return NextResponse.json(customer);
}

export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.set('portal_session', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  });
  return response;
}
