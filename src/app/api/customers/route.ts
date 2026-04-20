import { NextRequest, NextResponse } from 'next/server';
import { getCustomers, createCustomer, updateCustomer, deleteCustomer, getOrders, getInvoices, getKegLedger } from '@/lib/data';
import { isSupabaseConfigured, createAdminClient } from '@/lib/supabase';
import { generateId } from '@/lib/utils';
import type { Customer } from '@/lib/types';

/**
 * GET /api/customers
 * Admin-only. Returns all wholesale customers stripped of their passwords.
 * Previously this was public, which meant anyone browsing the wholesale
 * portal embed could see every brewery customer's name, email, phone, and
 * address — a real privacy issue. Now locked behind the admin_session
 * cookie; public /order paths that need customer selection will just see
 * an empty list and fall through to the "New Customer" form.
 */
export async function GET(request: NextRequest) {
  const session = request.cookies.get('admin_session');
  if (session?.value !== 'authenticated') {
    return NextResponse.json([], { status: 200 });
  }
  const { searchParams } = new URL(request.url);
  const includeArchived = searchParams.get('includeArchived') === 'true';
  const customers = await getCustomers(includeArchived);
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
    const admin = request.cookies.get('admin_session')?.value === 'authenticated';
    const portalCustomerId = request.cookies.get('portal_session')?.value || '';
    const body = await request.json();
    const { id, ...rawUpdates } = body;
    if (!id) {
      return NextResponse.json({ error: 'ID required' }, { status: 400 });
    }
    // Portal customers can edit only their own row, and only a safe subset
    // of fields (contact/phone/address/password). Admin can edit anything.
    let updates = rawUpdates;
    if (!admin) {
      if (portalCustomerId !== id) {
        return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
      }
      updates = {
        contactName: rawUpdates.contactName,
        phone: rawUpdates.phone,
        address: rawUpdates.address,
        password: rawUpdates.password,
        email: rawUpdates.email,
      };
      // Strip undefined keys so we don't overwrite with nulls.
      Object.keys(updates).forEach((k) => updates[k] === undefined && delete updates[k]);
    }
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
    const admin = request.cookies.get('admin_session')?.value === 'authenticated';
    if (!admin) {
      return NextResponse.json({ error: 'Admin session required' }, { status: 403 });
    }
    const body = await request.json();
    const id = body.id;
    const force: boolean = body.force === true; // future-proofing for a real hard-delete path
    if (!id) {
      return NextResponse.json({ error: 'ID required' }, { status: 400 });
    }

    // Check if the customer has any history. If so, we soft-delete (archive)
    // instead of hard-deleting, so reports + historical invoices stay valid.
    const [orders, invoices, ledger] = await Promise.all([
      getOrders(),
      getInvoices(),
      getKegLedger(),
    ]);
    const hasHistory =
      orders.some((o) => o.customerId === id) ||
      invoices.some((i) => i.customerId === id) ||
      ledger.some((l) => l.customerId === id);

    if (hasHistory && !force) {
      // Archive path: set archived_at so the customer disappears from
      // dropdowns / default lists but history remains queryable.
      const archived = await updateCustomer(id, { archivedAt: new Date().toISOString() });
      if (!archived) {
        return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
      }
      // Clean up Supabase Auth so they can't log into a zombie account.
      if (isSupabaseConfigured()) {
        try {
          const sb = createAdminClient();
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const adminApi = (sb.auth as any).admin;
          if (adminApi?.listUsers && adminApi?.deleteUser) {
            const listRes = await adminApi.listUsers();
            const authUser = listRes?.data?.users?.find((u: { email?: string }) =>
              u.email?.toLowerCase() === archived.email.toLowerCase(),
            );
            if (authUser) await adminApi.deleteUser(authUser.id);
          }
        } catch (err) {
          console.error('[customers DELETE] auth cleanup failed (non-fatal):', err);
        }
      }
      return NextResponse.json({ success: true, archived: true });
    }

    // No history → safe to hard-delete.
    const deleted = await deleteCustomer(id);
    if (!deleted) {
      return NextResponse.json(
        { error: 'Could not delete. Customer not found, or delete blocked by database constraint.' },
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
