import { NextRequest, NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/auth-check';
import { extractError, isAlreadyExistsError } from '@/lib/extract-error';
import {
  getCrmContact,
  updateCrmContact,
  getCustomers,
  createCustomer,
  getCrmActivities,
  createCrmActivity,
  deleteCrmActivity,
} from '@/lib/data';
import { generateId } from '@/lib/utils';
import type { Customer } from '@/lib/types';
import { isSupabaseConfigured } from '@/lib/supabase';
import { syncSupabaseAuthPassword } from '@/lib/auth-provision';
import { notifyApplicationDecision, portalUrl, isEmailConfigured } from '@/lib/email';

export const dynamic = 'force-dynamic';

/**
 * Temp password issued when a prospect is converted to a customer, matching
 * the application-approval flow. mustChangePassword forces a change on first
 * login, so this value is one-use.
 */
const TEMP_PASSWORD = 'guidon';

/**
 * POST /api/admin/crm/contacts/convert
 * Body: { id, email? }
 *
 * Promotes a lead to a real customer.
 *
 * Ordering matters here. There is no transaction primitive in this data layer
 * (the Supabase JS client cannot open one, and the file fallback rewrites whole
 * files), so each step is written to be individually re-runnable:
 *
 *   1. claim the contact by stamping converted_at — an atomic compare-and-set
 *      against "not already converted", so a double-click cannot create two
 *      customers
 *   2. create the customer row
 *   3. re-parent the contact's activity history onto the new customer
 *
 * If it dies between 2 and 3, re-running finds the contact already claimed and
 * re-parents the remaining activities rather than erroring forever.
 *
 * Since 2026-08-14 conversion also (4) provisions a portal login (temp
 * password, mustChangePassword) and (5) emails the customer a welcome — the
 * same treatment as approving a wholesale application. Both are best-effort:
 * the customer row already exists by then, so a mail or auth hiccup logs and
 * continues rather than failing the conversion.
 */
export async function POST(request: NextRequest) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: 'Admin session required' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const id = typeof body?.id === 'string' ? body.id.trim() : '';
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

    const contact = await getCrmContact(id);
    if (!contact) return NextResponse.json({ error: 'Contact not found' }, { status: 404 });

    // Already converted: idempotent, return the existing customer.
    //
    // This has to come BEFORE the email check. A lead often has no email of
    // its own (one was supplied at conversion time and lives on the customer
    // row), so validating email first would make the second click 400 instead
    // of returning the customer that already exists.
    if (contact.convertedAt && contact.convertedCustomerId) {
      return NextResponse.json(
        { customerId: contact.convertedCustomerId, alreadyConverted: true },
        { status: 200 },
      );
    }

    // Email may be supplied at conversion time — converting is usually the
    // moment Mike finally has it. Fall back to whatever is on the lead.
    const email = String(body?.email || contact.email || '').trim().toLowerCase();
    if (!email) {
      return NextResponse.json(
        { error: 'An email address is required to create a customer account.' },
        { status: 400 },
      );
    }

    const existing = await getCustomers(true);
    const dupe = existing.find((c) => c.email.toLowerCase() === email);
    if (dupe) {
      return NextResponse.json(
        {
          error: `${dupe.businessName} is already a customer with that email address.`,
          customerId: dupe.id,
        },
        { status: 409 },
      );
    }

    // Step 1 — claim. Stamping converted_at first means a second concurrent
    // click sees it set and bails out above rather than creating a duplicate.
    const claimedAt = new Date().toISOString();
    await updateCrmContact(id, { convertedAt: claimedAt });

    // Step 2 — create the customer.
    const customer: Customer = {
      id: generateId('cust'),
      businessName: contact.businessName,
      contactName: contact.contactName,
      email,
      phone: contact.phone,
      streetAddress: contact.streetAddress,
      city: contact.city,
      state: contact.state,
      zip: contact.zip,
      abcPermitNumber: '',
      customerIdentification: '',
      preferredPaymentMethod: 'no_preference',
      notes: contact.notes,
      tags: contact.tags,
      autoSendInvoices: false,
      archivedAt: null,
      nextFollowupDate: contact.nextFollowupDate || null,
      nextFollowupNotes: contact.nextFollowupNotes,
      // Converting now provisions a portal login (see below), so flag the
      // temp password for a forced change on first sign-in. `password` is only
      // read by the file-based fallback auth; Supabase auth is set via
      // syncSupabaseAuthPassword.
      mustChangePassword: true,
      password: TEMP_PASSWORD,
      createdAt: new Date().toISOString(),
    } as unknown as Customer;

    let customerId = customer.id;
    try {
      await createCustomer(customer);
    } catch (err) {
      if (!isAlreadyExistsError(err)) {
        // Release the claim so the lead is not stranded as half-converted.
        await updateCrmContact(id, { convertedAt: null });
        throw err;
      }
      // Lost a race: a concurrent convert already inserted this email (the
      // early dupe check passed for both). Adopt the EXISTING customer's id so
      // we re-parent history and stamp convertedCustomerId onto a real row —
      // not the local object whose insert just 409'd, which would 404 when
      // Mike clicks through to "the customer".
      const existingByEmail = (await getCustomers(true)).find(
        (c) => c.email.toLowerCase() === email,
      );
      if (existingByEmail) customerId = existingByEmail.id;
    }

    // Step 3 — re-parent history. Without this, promoting an account erases
    // the record of every call and sample drop that earned the business.
    const history = await getCrmActivities(id);
    for (const a of history) {
      if (!a.contactId) continue;
      await createCrmActivity({
        ...a,
        id: '',
        customerId,
        contactId: null,
      });
      await deleteCrmActivity(a.id);
    }

    await updateCrmContact(id, {
      convertedCustomerId: customerId,
      convertedAt: claimedAt,
    });

    // Step 4 — provision a portal login. Supabase-only (the file fallback has
    // no auth users). Best-effort: the customer already exists, so a failure
    // here just means Mike resets their password later.
    if (isSupabaseConfigured()) {
      try {
        await syncSupabaseAuthPassword({
          email,
          password: TEMP_PASSWORD,
          businessName: customer.businessName,
          contactName: customer.contactName,
        });
      } catch (err) {
        console.error('[crm/contacts/convert] login provisioning failed (non-fatal):', err);
      }
    }

    // Step 5 — welcome email with the login. Reuses the application-approval
    // template (same message: account is live, here's your temp password).
    let welcomeEmailed = false;
    try {
      await notifyApplicationDecision({
        applicationId: customer.id,
        applicantEmail: email,
        applicantName: customer.contactName,
        businessName: customer.businessName,
        decision: 'approved',
        portalUrl: portalUrl(),
        tempPassword: TEMP_PASSWORD,
      });
      // Report truthfully whether a real email could have gone out (send()
      // returns ok even in the no-credentials stub mode).
      welcomeEmailed = isEmailConfigured();
    } catch (err) {
      console.error('[crm/contacts/convert] welcome email failed (non-fatal):', err);
    }

    return NextResponse.json(
      { customerId, movedActivities: history.length, welcomeEmailed },
      { status: 201 },
    );
  } catch (err) {
    console.error('[crm/contacts/convert] failed:', err);
    return NextResponse.json({ error: extractError(err) }, { status: 500 });
  }
}
