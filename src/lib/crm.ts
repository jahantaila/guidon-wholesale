import type {
  Customer,
  Order,
  CrmContact,
  CrmActivity,
  CrmListRow,
  CrmListStatus,
} from './types';
import { CRM_ACTIVITY_LABELS } from './types';

/**
 * CRM derivation logic, kept pure so it can be tested without a database.
 *
 * The load-bearing idea: a CRM only works if it does not depend on someone
 * remembering to type into it. Two months of production data say so plainly —
 * of 93 customers, exactly one had a follow-up date (on a test account) and
 * none had follow-up notes. So "recent activity" is derived from orders first
 * and hand-logged activity second, and the highest-value view (who has gone
 * quiet) needs no data entry at all.
 */

/** Activity that needs no human: an order is a touch. */
export const ORDER_ACTIVITY_LABEL = 'Order placed';

function latest(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

/** Most recent order timestamp per customer id. */
export function lastOrderByCustomer(orders: Order[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const o of orders) {
    // A cancelled order is not a sign of a live relationship.
    if (o.status === 'cancelled') continue;
    const prev = out.get(o.customerId);
    if (!prev || o.createdAt > prev) out.set(o.customerId, o.createdAt);
  }
  return out;
}

/** Order count per customer id, cancelled excluded. */
export function orderCountByCustomer(orders: Order[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const o of orders) {
    if (o.status === 'cancelled') continue;
    out.set(o.customerId, (out.get(o.customerId) || 0) + 1);
  }
  return out;
}

/** Most recent activity per subject id, with its type label. */
export function lastActivityBySubject(
  activities: CrmActivity[],
): Map<string, { at: string; label: string }> {
  const out = new Map<string, { at: string; label: string }>();
  for (const a of activities) {
    const subject = a.customerId || a.contactId;
    if (!subject) continue;
    const prev = out.get(subject);
    if (!prev || a.occurredAt > prev.at) {
      out.set(subject, { at: a.occurredAt, label: CRM_ACTIVITY_LABELS[a.type] || 'Activity' });
    }
  }
  return out;
}

/**
 * Builds the unified CRM list: leads and prospects from crm_contacts, plus
 * customers, in one shape the table can render.
 *
 * Converted and archived contacts are excluded — a converted lead is
 * represented by its customer row, and showing both would double-count.
 */
export function buildCrmList(
  contacts: CrmContact[],
  customers: Customer[],
  orders: Order[],
  activities: CrmActivity[],
): CrmListRow[] {
  const lastOrder = lastOrderByCustomer(orders);
  const orderCounts = orderCountByCustomer(orders);
  const lastActivity = lastActivityBySubject(activities);

  const rows: CrmListRow[] = [];

  for (const c of contacts) {
    if (c.archivedAt || c.convertedAt) continue;
    const act = lastActivity.get(c.id) || null;
    rows.push({
      id: c.id,
      status: c.status,
      businessName: c.businessName,
      contactName: c.contactName,
      email: c.email,
      phone: c.phone,
      streetAddress: c.streetAddress || '',
      city: c.city || '',
      state: c.state || '',
      zip: c.zip || '',
      // A lead has no orders, so activity is the only signal there is. This is
      // exactly why logging earns its place on leads and not on customers.
      recentActivityAt: act?.at || null,
      recentActivitySource: act?.label || null,
      nextFollowupDate: c.nextFollowupDate || null,
      nextFollowupNotes: c.nextFollowupNotes || '',
      orderCount: 0,
      lastOrderAt: null,
    });
  }

  for (const c of customers) {
    if (c.archivedAt) continue;
    const orderAt = lastOrder.get(c.id) || null;
    const act = lastActivity.get(c.id) || null;
    const recentActivityAt = latest(orderAt, act?.at || null);
    // Whichever side won names the source. Ties go to the order, because an
    // order is the stronger signal of a live account.
    const recentActivitySource =
      recentActivityAt === null
        ? null
        : recentActivityAt === orderAt
          ? ORDER_ACTIVITY_LABEL
          : act?.label || null;

    rows.push({
      id: c.id,
      status: 'customer' as CrmListStatus,
      businessName: c.businessName,
      contactName: c.contactName,
      email: c.email,
      phone: c.phone,
      streetAddress: c.streetAddress || '',
      city: c.city || '',
      state: c.state || '',
      zip: c.zip || '',
      recentActivityAt,
      recentActivitySource,
      nextFollowupDate: c.nextFollowupDate || null,
      nextFollowupNotes: c.nextFollowupNotes || '',
      orderCount: orderCounts.get(c.id) || 0,
      lastOrderAt: orderAt,
    });
  }

  // Coldest first. The question this page answers is "who needs attention",
  // not "who is alphabetically first". Never-touched sorts to the very top,
  // because a lead nobody has called is the most actionable row there is.
  return rows.sort((a, b) => {
    if (a.recentActivityAt === b.recentActivityAt) {
      return a.businessName.localeCompare(b.businessName);
    }
    if (!a.recentActivityAt) return -1;
    if (!b.recentActivityAt) return 1;
    return a.recentActivityAt.localeCompare(b.recentActivityAt);
  });
}

export interface QuietAccount {
  id: string;
  businessName: string;
  phone: string;
  lastOrderAt: string;
  daysSince: number;
  orderCount: number;
}

/**
 * Customers who used to order and have gone quiet.
 *
 * This is the piece that needs no data entry, which is why it is the part most
 * likely to still be useful in six months. Only customers with a real order
 * history qualify: a brand-new account that has never ordered is not "quiet",
 * it is new, and mixing the two makes the list ignorable.
 */
export function quietAccounts(
  customers: Customer[],
  orders: Order[],
  thresholdDays = 45,
  now: Date = new Date(),
): QuietAccount[] {
  const lastOrder = lastOrderByCustomer(orders);
  const counts = orderCountByCustomer(orders);
  const nowMs = now.getTime();

  const out: QuietAccount[] = [];
  for (const c of customers) {
    if (c.archivedAt) continue;
    const at = lastOrder.get(c.id);
    if (!at) continue;
    const days = Math.floor((nowMs - new Date(at).getTime()) / 86_400_000);
    if (days < thresholdDays) continue;
    out.push({
      id: c.id,
      businessName: c.businessName,
      phone: c.phone,
      lastOrderAt: at,
      daysSince: days,
      orderCount: counts.get(c.id) || 0,
    });
  }

  // Quietest first, then by how much business is at stake.
  return out.sort((a, b) => b.daysSince - a.daysSince || b.orderCount - a.orderCount);
}

/** Whole days between an ISO timestamp and now. Negative clamps to 0. */
export function daysAgo(iso: string, now: Date = new Date()): number {
  const diff = now.getTime() - new Date(iso).getTime();
  return Math.max(0, Math.floor(diff / 86_400_000));
}

/** "today" / "yesterday" / "23d ago". Relative beats absolute here: the
 *  decision input is elapsed time, and an absolute date makes Mike subtract. */
export function relativeDay(iso: string | null, now: Date = new Date()): string {
  if (!iso) return 'never';
  const d = daysAgo(iso, now);
  if (d === 0) return 'today';
  if (d === 1) return 'yesterday';
  return `${d}d ago`;
}

export type FollowupState = 'overdue' | 'today' | 'upcoming';

/** Where a scheduled follow-up sits relative to `today` (YYYY-MM-DD,
 *  brewery-local). null when none is scheduled. */
export function followupState(date: string | null | undefined, today: string): FollowupState | null {
  if (!date) return null;
  if (date < today) return 'overdue';
  if (date === today) return 'today';
  return 'upcoming';
}

/**
 * Every row with a follow-up scheduled, soonest first. Overdue ones are NOT
 * dropped: they sort to the top, because a missed follow-up is the one that
 * most needs doing. Ties break by name so the order is stable.
 */
export function scheduledFollowups<T extends { nextFollowupDate?: string | null; businessName: string }>(
  rows: T[],
): T[] {
  return rows
    .filter((r) => !!r.nextFollowupDate)
    .sort(
      (a, b) =>
        (a.nextFollowupDate as string).localeCompare(b.nextFollowupDate as string) ||
        a.businessName.localeCompare(b.businessName),
    );
}
