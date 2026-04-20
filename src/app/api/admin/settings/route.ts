import { NextRequest, NextResponse } from 'next/server';
import { getNotificationEmails, setSetting } from '@/lib/data';

/**
 * GET /api/admin/settings
 * Returns the current settings relevant to the admin (notification emails for now).
 * Requires a valid admin session (enforced by middleware for routes under /api/admin/*).
 */
export async function GET() {
  const notificationEmails = await getNotificationEmails();
  return NextResponse.json({ notificationEmails });
}

/**
 * PUT /api/admin/settings
 * Body: { notificationEmails: string[] }
 * Replaces the notification_emails setting wholesale. Empty array is rejected
 * (we always want at least one recipient so brewery alerts don't silently
 * disappear). Basic email shape validation per address.
 */
export async function PUT(request: NextRequest) {
  const body = await request.json();
  const emails: unknown = body?.notificationEmails;

  if (!Array.isArray(emails)) {
    return NextResponse.json(
      { error: 'notificationEmails must be an array of email strings.' },
      { status: 400 },
    );
  }

  const normalized = emails
    .map((e) => (typeof e === 'string' ? e.trim() : ''))
    .filter(Boolean);

  if (normalized.length === 0) {
    return NextResponse.json(
      { error: 'At least one notification email is required.' },
      { status: 400 },
    );
  }

  const bad = normalized.find((e) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
  if (bad) {
    return NextResponse.json(
      { error: `Not a valid email: ${bad}` },
      { status: 400 },
    );
  }

  await setSetting('notification_emails', normalized);
  return NextResponse.json({ notificationEmails: normalized });
}
