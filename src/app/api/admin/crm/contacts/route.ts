import { NextRequest, NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/auth-check';
import { extractError } from '@/lib/extract-error';
import { getCrmContacts, createCrmContact, updateCrmContact, deleteCrmContact } from '@/lib/data';
import { generateId } from '@/lib/utils';
import type { CrmContact, CrmStatus } from '@/lib/types';

export const dynamic = 'force-dynamic';

const STATUSES: CrmStatus[] = ['lead', 'prospect'];

/** GET /api/admin/crm/contacts — leads and prospects. */
export async function GET(request: NextRequest) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: 'Admin session required' }, { status: 403 });
  }
  try {
    const includeArchived =
      new URL(request.url).searchParams.get('includeArchived') === 'true';
    return NextResponse.json(await getCrmContacts(includeArchived));
  } catch (err) {
    console.error('[crm/contacts GET] failed:', err);
    return NextResponse.json({ error: extractError(err) }, { status: 500 });
  }
}

/** POST /api/admin/crm/contacts — add a lead. */
export async function POST(request: NextRequest) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: 'Admin session required' }, { status: 403 });
  }
  try {
    const body = await request.json();
    const businessName = typeof body?.businessName === 'string' ? body.businessName.trim() : '';
    // Business name is the ONLY required field. A lead legitimately starts as
    // "drove past a bar, no contact details yet" — demanding an email here is
    // what stops the list from ever getting populated.
    if (!businessName) {
      return NextResponse.json({ error: 'Business name is required.' }, { status: 400 });
    }
    const status: CrmStatus = STATUSES.includes(body?.status) ? body.status : 'lead';

    const contact: CrmContact = {
      id: generateId('lead'),
      businessName,
      contactName: (body.contactName || '').trim(),
      email: (body.email || '').trim().toLowerCase(),
      phone: (body.phone || '').trim(),
      streetAddress: body.streetAddress || '',
      city: body.city || '',
      state: body.state || '',
      zip: body.zip || '',
      status,
      notes: body.notes || '',
      tags: Array.isArray(body.tags) ? body.tags : [],
      nextFollowupDate: body.nextFollowupDate || null,
      nextFollowupNotes: body.nextFollowupNotes || '',
      convertedCustomerId: null,
      convertedAt: null,
      archivedAt: null,
      createdAt: new Date().toISOString(),
    };

    return NextResponse.json(await createCrmContact(contact), { status: 201 });
  } catch (err) {
    console.error('[crm/contacts POST] failed:', err);
    return NextResponse.json({ error: extractError(err) }, { status: 500 });
  }
}

/** PUT /api/admin/crm/contacts — edit, or archive via archivedAt. */
export async function PUT(request: NextRequest) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: 'Admin session required' }, { status: 403 });
  }
  try {
    const body = await request.json();
    const { id, ...updates } = body || {};
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });
    if (updates.status !== undefined && !STATUSES.includes(updates.status)) {
      return NextResponse.json(
        { error: "status must be 'lead' or 'prospect'. Use /convert to make a customer." },
        { status: 400 },
      );
    }
    // Conversion bookkeeping is owned by /convert. Letting a plain edit set
    // these would let the UI fake a conversion without creating the customer.
    delete updates.convertedCustomerId;
    delete updates.convertedAt;

    const updated = await updateCrmContact(id, updates);
    if (!updated) return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
    return NextResponse.json(updated);
  } catch (err) {
    console.error('[crm/contacts PUT] failed:', err);
    return NextResponse.json({ error: extractError(err) }, { status: 500 });
  }
}

/** DELETE /api/admin/crm/contacts — hard-delete a lead/prospect + its log. */
export async function DELETE(request: NextRequest) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: 'Admin session required' }, { status: 403 });
  }
  try {
    const { id } = (await request.json()) || {};
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });
    const ok = await deleteCrmContact(id);
    if (!ok) return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[crm/contacts DELETE] failed:', err);
    return NextResponse.json({ error: extractError(err) }, { status: 500 });
  }
}
