import { NextRequest, NextResponse } from 'next/server';
import { extractError } from '@/lib/extract-error';
import { cronCaller, claimCronRun } from '@/lib/cron-auth';
import {
  getCustomers,
  getCrmContacts,
  getSetting,
  claimFollowupReminder,
  releaseFollowupReminder,
} from '@/lib/data';
import { notifyFollowupReminder } from '@/lib/email';
import { breweryLocalDate } from '@/lib/sales-report';
import {
  dueReminders,
  parseReminderSettings,
  FOLLOWUP_REMINDER_SETTINGS_KEY,
  DEFAULT_FOLLOWUP_REMINDER_SETTINGS,
} from '@/lib/followup-reminders';

/**
 * /api/cron/followup-reminders
 *
 * Daily cron (12:00 UTC = 8am EDT / 7am EST). Emails the brewery a reminder
 * the day before and the day of each scheduled CRM follow-up.
 *
 * OFF until settings.followup_reminders.enabled is true and has recipients —
 * Mike still has to confirm who gets these and at what time.
 *
 * Duplicate-proof: each (subject, date, kind) is claimed in
 * crm_followup_reminders before sending, so a retry or overlapping run sends
 * nothing twice. Moving a follow-up to a new date is a new key, so the new
 * date gets its own reminders.
 *
 * Query params (all require the cron secret; ignored for the scheduler):
 *   dryRun=1        list what would send; send and record nothing
 *   testTo=<email>  send today's reminders ONLY to that address, ignoring the
 *                   enabled flag and recording nothing — the internal test
 *                   path, so nothing reaches the real recipients
 *
 * Auth: see lib/cron-auth (Vercel scheduler, rate-limited; or CRON_SECRET).
 */
export const dynamic = 'force-dynamic';


export async function GET(request: NextRequest) {
  const caller = cronCaller(request);
  if (!caller) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    // Test / preview options need the real secret: a spoofed scheduler call
    // must not be able to mail reminders to an arbitrary address or read
    // customer names back.
    const params = caller === 'secret' ? new URL(request.url).searchParams : new URLSearchParams();
    const dryRun = params.get('dryRun') === '1';
    const testTo = (params.get('testTo') || '').trim().toLowerCase();
    if (testTo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(testTo)) {
      return NextResponse.json({ error: 'testTo must be an email address' }, { status: 400 });
    }

    const settings = parseReminderSettings(
      await getSetting(FOLLOWUP_REMINDER_SETTINGS_KEY, DEFAULT_FOLLOWUP_REMINDER_SETTINGS),
    );
    const today = /^\d{4}-\d{2}-\d{2}$/.test(params.get('today') || '') && (dryRun || testTo)
      // A fixed "today" is only honoured on the paths that record nothing,
      // so a test can preview tomorrow's mail without consuming it.
      ? String(params.get('today'))
      : breweryLocalDate(new Date().toISOString());

    const [customers, contacts] = await Promise.all([getCustomers(), getCrmContacts()]);
    const reminders = dueReminders(
      [
        ...customers
          .filter((c) => !c.archivedAt)
          .map((c) => ({ ...c, isCustomer: true })),
        ...contacts
          .filter((c) => !c.archivedAt && !c.convertedAt)
          .map((c) => ({ ...c, isCustomer: false })),
      ],
      today,
    );

    if (dryRun) {
      return NextResponse.json({ ok: true, dryRun: true, today, enabled: settings.enabled, recipients: settings.recipients, reminders });
    }

    if (testTo) {
      const results = [];
      for (const r of reminders) {
        const res = await notifyFollowupReminder({ to: [testTo], ...r });
        results.push({ ...r, ok: res.ok, error: res.error });
      }
      return NextResponse.json({ ok: true, test: true, today, to: testTo, results });
    }

    if (!(await claimCronRun('followup-reminders', caller, 12))) {
      return NextResponse.json({ ok: true, skipped: 'already ran recently', today });
    }

    if (!settings.enabled || settings.recipients.length === 0) {
      return NextResponse.json({ ok: true, skipped: 'disabled', today, due: reminders.length });
    }

    const sent: string[] = [];
    const skipped: string[] = [];
    const failed: { key: string; error?: string }[] = [];
    for (const r of reminders) {
      const key = `${r.subjectId}:${r.followupDate}:${r.kind}`;
      if (!(await claimFollowupReminder(r.subjectId, r.followupDate, r.kind))) {
        skipped.push(key);
        continue;
      }
      const res = await notifyFollowupReminder({ to: settings.recipients, ...r });
      if (res.ok) {
        sent.push(key);
      } else {
        await releaseFollowupReminder(r.subjectId, r.followupDate, r.kind);
        failed.push({ key, error: res.error });
      }
    }
    return NextResponse.json({ ok: failed.length === 0, today, sent, skipped, failed });
  } catch (err) {
    console.error('[cron/followup-reminders] failed:', err);
    return NextResponse.json({ ok: false, error: extractError(err) }, { status: 500 });
  }
}
