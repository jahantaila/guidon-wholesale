import { NextRequest, NextResponse } from 'next/server';
import { extractError } from '@/lib/extract-error';
import { getNotificationEmails, getSetting, setSetting } from '@/lib/data';

// Opt out of static prerendering. Without this, Next.js sees a GET handler
// that reads no request data and marks the whole route static — Vercel then
// serves the prerendered GET response and returns 405 Method Not Allowed
// for PUT/POST/DELETE, so "Add Recipient" silently fails on prod with
// "Save failed" even though the handler code is correct. Any admin mutation
// route needs to be marked dynamic.
export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/settings
 * Returns all admin-editable settings: notification emails + delivery schedule
 * (which weekdays the brewery delivers on + minimum lead time in days).
 */
export async function GET() {
  try {
    const [notificationEmails, deliveryDays, deliveryLeadDays] = await Promise.all([
      getNotificationEmails(),
      getSetting<number[]>('delivery_days', [2, 4]), // Tue + Thu default
      getSetting<number>('delivery_lead_days', 2),
    ]);
    return NextResponse.json({
      notificationEmails,
      deliveryDays,
      deliveryLeadDays,
    });
  } catch (err) {
    console.error('[api/admin/settings GET] failed:', err);
    return NextResponse.json(
      { notificationEmails: ['sales@guidonbrewing.com'], deliveryDays: [2, 4], deliveryLeadDays: 2 },
      { status: 200 },
    );
  }
}

/**
 * PUT /api/admin/settings
 * Body: { notificationEmails: string[] }
 * Replaces the notification_emails setting wholesale. Empty array is rejected
 * (we always want at least one recipient so brewery alerts don't silently
 * disappear). Basic email shape validation per address.
 */
export async function PUT(request: NextRequest) {
  try {
  const body = await request.json();

  // Notification emails (preserve existing behavior; optional now).
  if (Array.isArray(body?.notificationEmails)) {
    const normalized = body.notificationEmails
      .map((e: unknown) => (typeof e === 'string' ? e.trim() : ''))
      .filter(Boolean);
    if (normalized.length === 0) {
      return NextResponse.json({ error: 'At least one notification email is required.' }, { status: 400 });
    }
    const bad = normalized.find((e: string) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
    if (bad) {
      return NextResponse.json({ error: `Not a valid email: ${bad}` }, { status: 400 });
    }
    await setSetting('notification_emails', normalized);
  }

  // Delivery days: array of ints 0-6 (Sunday=0). Store in settings jsonb.
  if (Array.isArray(body?.deliveryDays)) {
    const days = body.deliveryDays
      .map((d: unknown) => Number(d))
      .filter((d: number) => Number.isInteger(d) && d >= 0 && d <= 6);
    if (days.length === 0) {
      return NextResponse.json({ error: 'Select at least one delivery day.' }, { status: 400 });
    }
    const unique = Array.from(new Set<number>(days)).sort((a, b) => a - b);
    await setSetting('delivery_days', unique);
  }

  if (body?.deliveryLeadDays !== undefined) {
    const lead = Number(body.deliveryLeadDays);
    if (!Number.isFinite(lead) || lead < 0 || lead > 30) {
      return NextResponse.json({ error: 'Lead days must be between 0 and 30.' }, { status: 400 });
    }
    await setSetting('delivery_lead_days', lead);
  }

  // Return the fresh settings.
  const [notificationEmails, deliveryDays, deliveryLeadDays] = await Promise.all([
    getNotificationEmails(),
    getSetting<number[]>('delivery_days', [2, 4]),
    getSetting<number>('delivery_lead_days', 2),
  ]);
  return NextResponse.json({ notificationEmails, deliveryDays, deliveryLeadDays });
  } catch (err) {
    console.error('[api/admin/settings PUT] failed:', err);
    const message = extractError(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
