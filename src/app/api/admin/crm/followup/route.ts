import { NextRequest, NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/auth-check';
import { extractError } from '@/lib/extract-error';
import { getCustomer, updateCustomer, getCrmContact, updateCrmContact } from '@/lib/data';

export const dynamic = 'force-dynamic';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isCalendarDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const d = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/**
 * PUT /api/admin/crm/followup
 * Body: { subjectId, date: 'YYYY-MM-DD' | null, notes?: string }
 *
 * Schedules (or clears, with date null) the next follow-up for a customer OR
 * a lead/prospect. Writes the same next_followup_* fields the customer page
 * edits, so the CRM and the customer page can never disagree.
 *
 * The response is the stored value read back from the database. If it does
 * not match what was asked for, this is a 500 — Mike reported follow-ups
 * that "did not save", and a save that silently no-ops is how that happens.
 */
export async function PUT(request: NextRequest) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: 'Admin session required' }, { status: 403 });
  }
  try {
    const body = await request.json().catch(() => null);
    const subjectId = typeof body?.subjectId === 'string' ? body.subjectId.trim() : '';
    if (!subjectId) {
      return NextResponse.json({ error: 'subjectId is required.' }, { status: 400 });
    }
    const rawDate = body?.date;
    if (rawDate !== null && rawDate !== '' && (typeof rawDate !== 'string' || !isCalendarDate(rawDate))) {
      return NextResponse.json({ error: 'Pick a follow-up date.' }, { status: 400 });
    }
    const date: string | null = rawDate || null;
    // Clearing the date clears its note too: a note with no date is orphaned
    // text nobody will see again.
    const notes = date ? (typeof body?.notes === 'string' ? body.notes.trim().slice(0, 2000) : '') : '';

    const updates = { nextFollowupDate: date, nextFollowupNotes: notes };
    const customer = await getCustomer(subjectId);
    const saved = customer
      ? await updateCustomer(subjectId, updates)
      : (await getCrmContact(subjectId))
        ? await updateCrmContact(subjectId, updates)
        : null;

    if (saved === null) {
      return NextResponse.json({ error: 'No customer or lead with that id.' }, { status: 404 });
    }
    if (!saved || (saved.nextFollowupDate || null) !== date) {
      return NextResponse.json(
        { error: 'The follow-up did not save. Please try again.' },
        { status: 500 },
      );
    }

    return NextResponse.json({
      subjectId,
      businessName: saved.businessName,
      nextFollowupDate: saved.nextFollowupDate || null,
      nextFollowupNotes: saved.nextFollowupNotes || '',
    });
  } catch (err) {
    console.error('[crm/followup PUT] failed:', err);
    return NextResponse.json({ error: extractError(err) }, { status: 500 });
  }
}
