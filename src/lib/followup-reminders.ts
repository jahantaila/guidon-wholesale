/**
 * Follow-up reminder emails (Mike, Sept 24 2026): one the day before a
 * scheduled follow-up and one on the day. Pure selection logic lives here so
 * the date rules are testable without a database, a clock or an inbox.
 *
 * Dates are brewery-local calendar days (YYYY-MM-DD). The cron runs once each
 * morning Eastern; whatever is due today gets "day_of", whatever is due
 * tomorrow gets "day_before". Overdue follow-ups get nothing — the CRM's
 * Follow-ups view already shows them in red, and a daily nag for every missed
 * one would bury the useful mail.
 */

export type ReminderKind = 'day_before' | 'day_of';

export interface ReminderSubject {
  id: string;
  businessName: string;
  isCustomer: boolean;
  nextFollowupDate?: string | null;
  nextFollowupNotes?: string;
}

export interface DueReminder {
  subjectId: string;
  businessName: string;
  followupDate: string;
  notes: string;
  kind: ReminderKind;
  /** Admin page to act from. */
  path: string;
}

export interface FollowupReminderSettings {
  /** Off until Mike confirms recipients + send time. */
  enabled: boolean;
  recipients: string[];
}

export const FOLLOWUP_REMINDER_SETTINGS_KEY = 'followup_reminders';
export const DEFAULT_FOLLOWUP_REMINDER_SETTINGS: FollowupReminderSettings = {
  enabled: false,
  recipients: [],
};

/** YYYY-MM-DD plus n calendar days. Month/year roll-over handled by Date. */
export function addDays(ymd: string, n: number): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function dueReminders(subjects: ReminderSubject[], today: string): DueReminder[] {
  const tomorrow = addDays(today, 1);
  const out: DueReminder[] = [];
  for (const s of subjects) {
    const date = s.nextFollowupDate;
    if (!date) continue;
    const kind: ReminderKind | null = date === today ? 'day_of' : date === tomorrow ? 'day_before' : null;
    if (!kind) continue;
    out.push({
      subjectId: s.id,
      businessName: s.businessName,
      followupDate: date,
      notes: s.nextFollowupNotes || '',
      kind,
      // Customers have a detail page; leads live only in the CRM list.
      path: s.isCustomer ? `/admin/customers/${s.id}` : '/admin/crm?filter=followups',
    });
  }
  return out.sort((a, b) => a.businessName.localeCompare(b.businessName));
}

/** Normalises whatever is stored in settings into a safe shape. */
export function parseReminderSettings(raw: unknown): FollowupReminderSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const recipients = Array.isArray(r.recipients)
    ? r.recipients.filter((e): e is string => typeof e === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim())).map((e) => e.trim().toLowerCase())
    : [];
  return { enabled: r.enabled === true, recipients };
}
