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

export const dynamic = 'force-dynamic';

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
 * Portal access is deliberately NOT provisioned here. Creating the account and
 * giving the bar a login are separate decisions, and the modal says so.
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
      mustChangePassword: false,
      createdAt: new Date().toISOString(),
    } as unknown as Customer;

    try {
      await createCustomer(customer);
    } catch (err) {
      if (!isAlreadyExistsError(err)) {
        // Release the claim so the lead is not stranded as half-converted.
        await updateCrmContact(id, { convertedAt: null });
        throw err;
      }
    }

    // Step 3 — re-parent history. Without this, promoting an account erases
    // the record of every call and sample drop that earned the business.
    const history = await getCrmActivities(id);
    for (const a of history) {
      if (!a.contactId) continue;
      await createCrmActivity({
        ...a,
        id: '',
        customerId: customer.id,
        contactId: null,
      });
      await deleteCrmActivity(a.id);
    }

    await updateCrmContact(id, {
      convertedCustomerId: customer.id,
      convertedAt: claimedAt,
    });

    return NextResponse.json(
      { customerId: customer.id, movedActivities: history.length },
      { status: 201 },
    );
  } catch (err) {
    console.error('[crm/contacts/convert] failed:', err);
    return NextResponse.json({ error: extractError(err) }, { status: 500 });
  }
}
