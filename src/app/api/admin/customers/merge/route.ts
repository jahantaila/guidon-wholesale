import { NextRequest, NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/auth-check';
import { extractError } from '@/lib/extract-error';
import { countCustomerRecords, getCustomer, mergeCustomers } from '@/lib/data';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/customers/merge?sourceId=cust-x
 * Preview: how many orders, invoices, keg records, etc. would move off the
 * duplicate account. Nothing is changed.
 */
export async function GET(request: NextRequest) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: 'Admin session required' }, { status: 403 });
  }
  const sourceId = (new URL(request.url).searchParams.get('sourceId') || '').trim();
  if (!sourceId) {
    return NextResponse.json({ error: 'sourceId is required.' }, { status: 400 });
  }
  try {
    if (!(await getCustomer(sourceId))) {
      return NextResponse.json({ error: 'Customer not found.' }, { status: 404 });
    }
    return NextResponse.json({ sourceId, counts: await countCustomerRecords(sourceId) });
  } catch (err) {
    console.error('[admin/customers/merge GET] failed:', err);
    return NextResponse.json({ error: extractError(err) }, { status: 500 });
  }
}

/**
 * POST /api/admin/customers/merge
 * Body: { sourceId, targetId }
 *
 * Moves everything from the duplicate (source) onto the account being kept
 * (target) and archives the source. See mergeCustomers in lib/data.
 */
export async function POST(request: NextRequest) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: 'Admin session required' }, { status: 403 });
  }
  const body = await request.json().catch(() => null);
  const sourceId = typeof body?.sourceId === 'string' ? body.sourceId.trim() : '';
  const targetId = typeof body?.targetId === 'string' ? body.targetId.trim() : '';
  if (!sourceId || !targetId) {
    return NextResponse.json({ error: 'Pick the account to merge and the account to keep.' }, { status: 400 });
  }
  if (sourceId === targetId) {
    return NextResponse.json({ error: 'Pick two different accounts to merge.' }, { status: 400 });
  }
  try {
    const moved = await mergeCustomers(sourceId, targetId);
    return NextResponse.json({ ok: true, sourceId, targetId, moved });
  } catch (err) {
    const message = extractError(err);
    const status = /not found|archived/i.test(message) ? 400 : 500;
    if (status === 500) console.error('[admin/customers/merge POST] failed:', err);
    return NextResponse.json({ error: message }, { status });
  }
}
