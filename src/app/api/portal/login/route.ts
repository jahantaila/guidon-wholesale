import { NextRequest, NextResponse } from 'next/server';
import { getCustomers } from '@/lib/data';
import { isSupabaseConfigured, createServerClient } from '@/lib/supabase';
import { setPortalSessionCookie, clearPortalSessionCookie } from '@/lib/portal-session';

export async function POST(request: NextRequest) {
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

    const response = NextResponse.json(customer);
    setPortalSessionCookie(response, customer.id);
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

  const response = NextResponse.json(customer);
  setPortalSessionCookie(response, customer.id);

  return response;
}

export async function GET(request: NextRequest) {
  const session = request.cookies.get('portal_session');
  if (!session?.value) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const customers = await getCustomers();
  const customer = customers.find((c) => c.id === session.value);
  if (!customer) {
    return NextResponse.json({ error: 'Customer not found' }, { status: 401 });
  }

  // Strip password before returning
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { password, ...safe } = customer;
  const response = NextResponse.json(safe);
  // Slide the session forward on every bootstrap so an active customer's
  // 30-day window keeps renewing instead of lapsing mid-use.
  setPortalSessionCookie(response, customer.id);
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ success: true });
  clearPortalSessionCookie(response);
  return response;
}
