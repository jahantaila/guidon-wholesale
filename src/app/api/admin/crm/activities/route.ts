import { NextRequest, NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/auth-check';
import { extractError } from '@/lib/extract-error';
import {
  getCrmActivities,
  createCrmActivity,
  deleteCrmActivity,
  getCrmContact,
  getCustomer,
} from '@/lib/data';
import { generateId } from '@/lib/utils';
import { CRM_ACTIVITY_TYPES } from '@/lib/types';
import type { CrmActivity, CrmActivityType } from '@/lib/types';

export const dynamic = 'force-dynamic';

/** GET /api/admin/crm/activities?subjectId=… — timeline for one account. */
export async function GET(request: NextRequest) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: 'Admin session required' }, { status: 403 });
  }
  try {
    const subjectId = new URL(request.url).searchParams.get('subjectId') || undefined;
    return NextResponse.json(await getCrmActivities(subjectId));
  } catch (err) {
    console.error('[crm/activities GET] failed:', err);
    return NextResponse.json({ error: extractError(err) }, { status: 500 });
  }
}

/**
 * POST /api/admin/crm/activities
 * Body: { subjectId, type, occurredAt?, notes? }
 *
 * One call = one click in the UI. `subjectId` is either a customer id or a
 * contact id; the server works out which so the client does not have to know,
 * and so a caller cannot set both and violate the one-subject constraint.
 */
export async function POST(request: NextRequest) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: 'Admin session required' }, { status: 403 });
  }
  try {
    const body = await request.json();
    const subjectId = typeof body?.subjectId === 'string' ? body.subjectId.trim() : '';
    const type = body?.type as CrmActivityType;

    if (!subjectId) {
      return NextResponse.json({ error: 'subjectId is required.' }, { status: 400 });
    }
    if (!CRM_ACTIVITY_TYPES.includes(type)) {
      return NextResponse.json(
        { error: `type must be one of: ${CRM_ACTIVITY_TYPES.join(', ')}` },
        { status: 400 },
      );
    }

    // Resolve which side of the union this id belongs to. Customer first:
    // that is the larger table and the more common case.
    const customer = await getCustomer(subjectId);
    const contact = customer ? undefined : await getCrmContact(subjectId);
    if (!customer && !contact) {
      return NextResponse.json({ error: 'No customer or lead with that id.' }, { status: 404 });
    }

    const occurredAt =
      typeof body?.occurredAt === 'string' && !Number.isNaN(Date.parse(body.occurredAt))
        ? new Date(body.occurredAt).toISOString()
        : new Date().toISOString();

    const activity: CrmActivity = {
      id: generateId('act'),
      customerId: customer ? subjectId : null,
      contactId: customer ? null : subjectId,
      type,
      occurredAt,
      notes: typeof body?.notes === 'string' ? body.notes : '',
      source: 'admin',
      createdAt: new Date().toISOString(),
    };

    return NextResponse.json(await createCrmActivity(activity), { status: 201 });
  } catch (err) {
    console.error('[crm/activities POST] failed:', err);
    const message = extractError(err);
    // A new activity type ships in code before the database constraint is
    // widened. Say that, rather than surfacing a raw check-violation.
    if (/crm_activities_type_check/.test(message)) {
      return NextResponse.json(
        { error: 'That activity type is not enabled in the database yet (migration 003).' },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** DELETE /api/admin/crm/activities — remove a mis-logged entry. */
export async function DELETE(request: NextRequest) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: 'Admin session required' }, { status: 403 });
  }
  try {
    const { id } = (await request.json()) || {};
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });
    const ok = await deleteCrmActivity(id);
    if (!ok) return NextResponse.json({ error: 'Activity not found' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[crm/activities DELETE] failed:', err);
    return NextResponse.json({ error: extractError(err) }, { status: 500 });
  }
}
