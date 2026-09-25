import { NextRequest, NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/auth-check';
import { extractError } from '@/lib/extract-error';
import { getNotificationEmails, getSetting, setSetting } from '@/lib/data';
import {
  parseReminderSettings,
  FOLLOWUP_REMINDER_SETTINGS_KEY,
  DEFAULT_FOLLOWUP_REMINDER_SETTINGS,
} from '@/lib/followup-reminders';
import { ONBOARDING_VIDEO_SETTING_KEY } from '@/lib/email';

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
export async function GET(request: NextRequest) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: 'Admin session required' }, { status: 403 });
  }

  try {
    const [notificationEmails, deliveryDays, deliveryLeadDays, followupReminders] = await Promise.all([
      getNotificationEmails(),
      getSetting<number[]>('delivery_days', [2, 4]), // Tue + Thu default
      getSetting<number>('delivery_lead_days', 2),
      getSetting(FOLLOWUP_REMINDER_SETTINGS_KEY, DEFAULT_FOLLOWUP_REMINDER_SETTINGS),
    ]);
    return NextResponse.json({
      notificationEmails,
      deliveryDays,
      deliveryLeadDays,
      followupReminders: parseReminderSettings(followupReminders),
      onboardingVideoUrl: await getSetting<string>(ONBOARDING_VIDEO_SETTING_KEY, ''),
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
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: 'Admin session required' }, { status: 403 });
  }

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

  // Follow-up reminder emails: on/off + who gets them. Turning them on with
  // nobody to send to is rejected rather than silently doing nothing.
  if (body?.followupReminders !== undefined) {
    const raw = body.followupReminders;
    const listed = Array.isArray(raw?.recipients) ? raw.recipients : [];
    const bad = listed.find((e: unknown) => typeof e !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim()));
    if (bad !== undefined) {
      return NextResponse.json({ error: `Not a valid email: ${String(bad)}` }, { status: 400 });
    }
    const next = parseReminderSettings(raw);
    if (next.enabled && next.recipients.length === 0) {
      return NextResponse.json(
        { error: 'Add at least one recipient before turning follow-up reminders on.' },
        { status: 400 },
      );
    }
    await setSetting(FOLLOWUP_REMINDER_SETTINGS_KEY, next);
  }

  // Setup-walkthrough link for the "account approved" email. '' removes it.
  if (typeof body?.onboardingVideoUrl === 'string') {
    const url = body.onboardingVideoUrl.trim();
    if (url && !/^https:\/\/\S+$/i.test(url)) {
      return NextResponse.json({ error: 'The walkthrough link must start with https://' }, { status: 400 });
    }
    await setSetting(ONBOARDING_VIDEO_SETTING_KEY, url);
  }

  // Return the fresh settings.
  const [notificationEmails, deliveryDays, deliveryLeadDays, followupReminders] = await Promise.all([
    getNotificationEmails(),
    getSetting<number[]>('delivery_days', [2, 4]),
    getSetting<number>('delivery_lead_days', 2),
    getSetting(FOLLOWUP_REMINDER_SETTINGS_KEY, DEFAULT_FOLLOWUP_REMINDER_SETTINGS),
  ]);
  return NextResponse.json({
    notificationEmails,
    deliveryDays,
    deliveryLeadDays,
    followupReminders: parseReminderSettings(followupReminders),
    onboardingVideoUrl: await getSetting<string>(ONBOARDING_VIDEO_SETTING_KEY, ''),
  });
  } catch (err) {
    console.error('[api/admin/settings PUT] failed:', err);
    const message = extractError(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
