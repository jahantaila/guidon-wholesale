import { NextRequest, NextResponse } from 'next/server';
import { getCustomers, createCustomer, updateCustomer, deleteCustomer } from '@/lib/data';
import { isSupabaseConfigured, createAdminClient } from '@/lib/supabase';
import { generateId } from '@/lib/utils';
import type { Customer } from '@/lib/types';

export async function GET() {
  const customers = await getCustomers();
  // Strip passwords from response
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const safe = customers.map(({ password, ...rest }) => rest);
  return NextResponse.json(safe);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body.email || !body.businessName || !body.contactName) {
      return NextResponse.json(
        { error: 'businessName, contactName, and email are required' },
        { status: 400 },
      );
    }
    const customer: Customer = {
      id: generateId('cust'),
      businessName: body.businessName,
      contactName: body.contactName,
      email: String(body.email).toLowerCase().trim(),
      phone: body.phone || '',
      address: body.address || '',
      password: body.password || '',
      createdAt: new Date().toISOString(),
    };
    await createCustomer(customer);

    // Provision a Supabase Auth user so the customer can actually log into
    // /portal. Without this, admin-created customers can't sign in and Mike
    // can't figure out why. Mirrors the application-approval flow.
    if (isSupabaseConfigured() && customer.password) {
      try {
        const sb = createAdminClient();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const adminApi = (sb.auth as any).admin;
        if (adminApi?.createUser) {
          const res = await adminApi.createUser({
            email: customer.email,
            password: customer.password,
            email_confirm: true,
            user_metadata: {
              business_name: customer.businessName,
              contact_name: customer.contactName,
            },
          });
          if (res?.error) {
            const alreadyExists = /already|exists|registered/i.test(res.error.message);
            if (!alreadyExists) {
              console.error('[customers POST] auth provision failed:', res.error.message);
            }
          }
        }
      } catch (err) {
        console.error('[customers POST] auth provision threw (non-fatal):', err);
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password, ...safe } = customer;
    return NextResponse.json(safe, { status: 201 });
  } catch (err) {
    console.error('[api/customers POST] failed:', err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, ...updates } = body;
    const customer = await updateCustomer(id, updates);
    if (!customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    // If admin updated email or password, sync to Supabase Auth so the
    // customer's portal login matches the stored credentials. Skip if no
    // Supabase config (file-fallback dev mode).
    if (isSupabaseConfigured() && (updates.password || updates.email)) {
      try {
        const sb = createAdminClient();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const adminApi = (sb.auth as any).admin;
        if (adminApi?.listUsers && adminApi?.updateUserById) {
          const listRes = await adminApi.listUsers();
          const authUser = listRes?.data?.users?.find((u: { email?: string }) =>
            u.email?.toLowerCase() === customer.email.toLowerCase(),
          );
          if (authUser) {
            const update: Record<string, unknown> = {};
            if (updates.password) update.password = updates.password;
            if (updates.email) update.email = updates.email;
            await adminApi.updateUserById(authUser.id, update);
          } else if (updates.password && adminApi.createUser) {
            // Customer exists in DB but not in Auth (legacy pre-fix row).
            // Create the auth user now so they can log in.
            await adminApi.createUser({
              email: customer.email,
              password: updates.password,
              email_confirm: true,
            });
          }
        }
      } catch (err) {
        console.error('[customers PUT] auth sync failed (non-fatal):', err);
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password, ...safe } = customer;
    return NextResponse.json(safe);
  } catch (err) {
    console.error('[api/customers PUT] failed:', err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const id = body.id;
    if (!id) {
      return NextResponse.json({ error: 'ID required' }, { status: 400 });
    }
    const deleted = await deleteCustomer(id);
    if (!deleted) {
      // Most common reason: foreign-key constraint. The customer has orders,
      // invoices, or keg ledger entries on record. Surface that explicitly so
      // the UI can show a friendly message instead of a bare 404.
      return NextResponse.json(
        { error: 'Could not delete. This customer has orders, invoices, or keg ledger entries on record (foreign key constraint). Remove those first, or keep the account and edit instead.' },
        { status: 409 },
      );
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[api/customers DELETE] failed:', err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Customer delete failed: ${message}` }, { status: 500 });
  }
}
