import { NextRequest, NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/auth-check';
import { getAlert, setAlert } from '@/lib/data';
import { extractError } from '@/lib/extract-error';
import { generateId } from '@/lib/utils';
import type { WholesaleAlert } from '@/lib/types';

// Admin mutation route — must be dynamic so PUT actually persists in prod.
// See /api/admin/settings for the same explanation.
export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/alerts
 * Returns the full current alert record (including the active flag) so the
 * admin editor can pre-populate the form. Returns null if nothing has ever
 * been authored AND the seed alert has expired.
 */
export async function GET(request: NextRequest) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: 'Admin session required' }, { status: 403 });
  }
  const alert = await getAlert();
  return NextResponse.json(alert);
}

/**
 * PUT /api/admin/alerts
 * Body: { title, body, active, endsAt?, resetDismissals? }
 * Upserts the single active alert record. Generates a new id on first save
 * OR when `resetDismissals` is true, which busts the localStorage dismissal
 * key for everyone so they see the next display cycle.
 */
export async function PUT(request: NextRequest) {
  try {
    if (!isAdminRequest(request)) {
      return NextResponse.json({ error: 'Admin session required' }, { status: 403 });
    }
    const body = await request.json();

    const title = typeof body?.title === 'string' ? body.title.trim() : '';
    const text = typeof body?.body === 'string' ? body.body.trim() : '';
    if (!title) {
      return NextResponse.json({ error: 'Title is required.' }, { status: 400 });
    }
    if (!text) {
      return NextResponse.json({ error: 'Body is required.' }, { status: 400 });
    }

    // endsAt: accept empty/null/undefined as "no expiry", otherwise validate
    // that it parses as a real date. Don't reject past dates — admin might
    // intentionally pause an alert by setting endsAt to yesterday rather
    // than flipping active off.
    let endsAt: string | null = null;
    if (typeof body?.endsAt === 'string' && body.endsAt.trim()) {
      const parsed = new Date(body.endsAt);
      if (Number.isNaN(parsed.getTime())) {
        return NextResponse.json({ error: 'End date is not a valid date.' }, { status: 400 });
      }
      // Treat as end-of-day in the brewery's local view so a date like
      // "2026-06-26" stays visible the whole of that day. The client sends
      // a YYYY-MM-DD string from <input type="date">; appending T23:59:59
      // gets us the natural "through end of that day" behavior.
      const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(body.endsAt.trim());
      endsAt = dateOnly ? `${body.endsAt.trim()}T23:59:59` : parsed.toISOString();
    }

    const existing = await getAlert();
    const shouldResetId = body?.resetDismissals === true || !existing;
    const id = shouldResetId ? generateId('alert') : existing!.id;

    const next: WholesaleAlert = {
      id,
      title,
      body: text,
      active: body?.active !== false, // default to true unless explicitly disabled
      endsAt,
      updatedAt: new Date().toISOString(),
    };

    await setAlert(next);
    return NextResponse.json(next);
  } catch (err) {
    console.error('[api/admin/alerts PUT] failed:', err);
    return NextResponse.json({ error: extractError(err) }, { status: 500 });
  }
}
