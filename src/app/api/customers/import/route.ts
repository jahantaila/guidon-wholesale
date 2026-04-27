import { NextRequest, NextResponse } from 'next/server';
import { extractError } from '@/lib/extract-error';
import { createCustomer, getCustomers } from '@/lib/data';
import { isAdminRequest } from '@/lib/auth-check';
import { isSupabaseConfigured, createAdminClient } from '@/lib/supabase';
import { generateId } from '@/lib/utils';
import type { Customer } from '@/lib/types';

/**
 * POST /api/customers/import
 *
 * Accepts { rows: Array<{ businessName, contactName, email, phone?,
 *          streetAddress?, city?, state?, zip?, address?, notes?, tags?,
 *          password? }> }
 *
 * Address: prefers split fields (streetAddress/city/state/zip). If the row
 * only has a legacy `address` value, it lands in streetAddress so the data
 * is preserved (admin can re-edit to populate city/state/zip).
 *
 * Upsert-by-email: if a customer with the same email already exists, skip
 * (or could update, but skip is safer for a first pass). Returns
 * { created: N, skipped: [{ email, reason }] }.
 *
 * Admin-only. Rows with missing businessName/contactName/email are rejected
 * but don't abort the whole batch — we report them in `skipped`.
 */
export async function POST(request: NextRequest) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: 'Admin session required' }, { status: 403 });
  }
  try {
    const body = await request.json();
    const rows: unknown = body?.rows;
    if (!Array.isArray(rows)) {
      return NextResponse.json({ error: 'rows[] is required' }, { status: 400 });
    }

    const existing = await getCustomers(true); // include archived for duplicate check
    const byEmail = new Map(existing.map((c) => [c.email.toLowerCase().trim(), c]));

    let created = 0;
    const skipped: Array<{ email: string; reason: string }> = [];

    for (const raw of rows) {
      const r = raw as Record<string, unknown>;
      const businessName = typeof r.businessName === 'string' ? r.businessName.trim() : '';
      const contactName = typeof r.contactName === 'string' ? r.contactName.trim() : '';
      const email = typeof r.email === 'string' ? r.email.trim().toLowerCase() : '';

      if (!businessName || !contactName || !email) {
        skipped.push({ email: email || '(missing)', reason: 'Missing businessName, contactName, or email' });
        continue;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        skipped.push({ email, reason: 'Not a valid email' });
        continue;
      }
      if (byEmail.has(email)) {
        skipped.push({ email, reason: 'Already exists' });
        continue;
      }

      const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
      const splitStreet = str(r.streetAddress);
      const legacyAddress = str(r.address);
      const customer: Customer = {
        id: generateId('cust'),
        businessName,
        contactName,
        email,
        phone: str(r.phone),
        // Prefer split columns. If the row only carried the legacy single
        // `address` field, fall back to dumping it in streetAddress so the
        // data isn't dropped on the floor.
        streetAddress: splitStreet || legacyAddress,
        city: str(r.city),
        state: str(r.state).toUpperCase(),
        zip: str(r.zip),
        password: str(r.password),
        notes: str(r.notes),
        tags: typeof r.tags === 'string'
          ? r.tags.split(/[,;|]/).map((t) => t.trim()).filter(Boolean)
          : Array.isArray(r.tags) ? (r.tags as unknown[]).map(String) : [],
        createdAt: new Date().toISOString(),
      };

      try {
        await createCustomer(customer);
        // Provision Supabase Auth user if a password was supplied.
        if (isSupabaseConfigured() && customer.password) {
          try {
            const sb = createAdminClient();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const adminApi = (sb.auth as any).admin;
            if (adminApi?.createUser) {
              await adminApi.createUser({
                email: customer.email,
                password: customer.password,
                email_confirm: true,
                user_metadata: {
                  business_name: customer.businessName,
                  contact_name: customer.contactName,
                },
              });
            }
          } catch { /* log silently — import continues */ }
        }
        byEmail.set(email, customer); // prevent duplicates within same batch
        created += 1;
      } catch (err) {
        skipped.push({ email, reason: err instanceof Error ? err.message : 'Insert failed' });
      }
    }

    return NextResponse.json({ created, skipped, total: rows.length });
  } catch (err) {
    console.error('[api/customers/import] failed:', err);
    const message = extractError(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
