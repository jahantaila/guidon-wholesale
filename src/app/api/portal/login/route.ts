import { NextRequest, NextResponse } from 'next/server';
import { getCustomers } from '@/lib/data';
import { isSupabaseConfigured, createServerClient } from '@/lib/supabase';
import {
  signPortalToken,
  attachPortalSessionCookie,
  clearPortalSessionCookie,
} from '@/lib/portal-session';
import { authContext } from '@/lib/auth-check';
import { isSessionSigningConfigured } from '@/lib/session-token';

export async function POST(request: NextRequest) {
  // Without a signing secret, signPortalToken throws and the customer sees the
  // generic "Login failed." string — identical to a wrong password. Say what
  // is actually broken instead of sending them to reset a working password.
  if (!isSessionSigningConfigured()) {
    console.error('[portal/login] no signing secret — set SESSION_SECRET.');
    return NextResponse.json(
      { error: 'Sign-in is temporarily unavailable. Please contact the brewery.' },
      { status: 503 },
    );
  }

  const { email, password } = await request.json();

  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 });
  }

  // When Supabase is configured, authenticate via Supabase Auth
  if (isSupabaseConfigured()) {
    const sb = createServerClient();
    const { data, error } = await sb.auth.signInWithPassword({ email, password });

    if (error || !data.user) {
      return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 });
    }

    // Fetch the linked customer record
    const { data: customerRow } = await sb
      .from('customers')
      .select('*')
      .eq('email', email.toLowerCase().trim())
      .single();

    if (!customerRow) {
      return NextResponse.json({ error: 'No customer account found for this email.' }, { status: 401 });
    }
    // Defensive: reject login for archived customers even if their Supabase
    // Auth user survived (normal archive flow deletes the auth user, but
    // legacy rows or out-of-band admin actions might leave one orphaned).
    if (customerRow.archived_at) {
      return NextResponse.json(
        { error: 'This account has been archived. Please contact the brewery.' },
        { status: 403 },
      );
    }

    // Mirror the data-layer mapper: prefer split address columns, fall back
     // to the legacy `address` string for pre-migration rows.
    const splitStreet = (customerRow.street_address as string) || '';
    const city = (customerRow.city as string) || '';
    const state = (customerRow.state as string) || '';
    const zip = (customerRow.zip as string) || '';
    const legacyAddress = (customerRow.address as string) || '';
    const hasSplit = Boolean(splitStreet || city || state || zip);
    const ppm = customerRow.preferred_payment_method;
    const customer = {
      id: customerRow.id,
      businessName: customerRow.business_name,
      contactName: customerRow.contact_name,
      email: customerRow.email,
      phone: customerRow.phone,
      streetAddress: hasSplit ? splitStreet : legacyAddress,
      city,
      state,
      zip,
      abcPermitNumber: (customerRow.abc_permit_number as string) || '',
      preferredPaymentMethod:
        ppm === 'check' || ppm === 'fintech' ? ppm : 'no_preference',
      // Expose the temp-password flag so the portal UI can force a
      // change-password modal on first login after approval.
      mustChangePassword: customerRow.must_change_password === true,
      createdAt: customerRow.created_at,
    };

    // portalToken rides in the body as well as the cookie. In the WordPress
    // iframe the cookie is third-party and gets dropped, so the client caches
    // this and sends it as Authorization: Bearer instead.
    const token = await signPortalToken(customer.id);
    const response = NextResponse.json({ ...customer, portalToken: token });
    attachPortalSessionCookie(response, token);
    return response;
  }

  // Fallback: file-based authentication
  const customers = await getCustomers();
  const customer = customers.find(
    (c) => c.email.toLowerCase() === email.trim().toLowerCase()
  );

  if (!customer || customer.password !== password) {
    return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 });
  }

  // Strip the password before responding. This path spreads the raw
  // customers.json row, which carries the plaintext password; the GET handler
  // below already strips it and this one did not.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { password: _pw, ...safeCustomer } = customer;
  const token = await signPortalToken(customer.id);
  const response = NextResponse.json({ ...safeCustomer, portalToken: token });
  attachPortalSessionCookie(response, token);

  return response;
}

export async function GET(request: NextRequest) {
  // Accepts the signed cookie OR the Bearer header, so the bootstrap probe
  // works in the iframe where the cookie never arrives.
  const { portalCustomerId } = await authContext(request);
  if (!portalCustomerId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const customers = await getCustomers();
  const customer = customers.find((c) => c.id === portalCustomerId);
  if (!customer) {
    return NextResponse.json({ error: 'Customer not found' }, { status: 401 });
  }

  // Strip password before returning
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { password, ...safe } = customer;
  // Slide the session forward on every bootstrap so an active customer's
  // 30-day window keeps renewing instead of lapsing mid-use.
  const token = await signPortalToken(customer.id);
  const response = NextResponse.json({ ...safe, portalToken: token });
  attachPortalSessionCookie(response, token);
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ success: true });
  clearPortalSessionCookie(response);
  return response;
}
