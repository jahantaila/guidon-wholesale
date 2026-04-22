import type { BrewSchedule } from './types';

/** Quick-filter presets surfaced on the production page. 'all' = no filter;
 * 'custom' = use the user's from/to date inputs; everything else is a
 * canned relative range computed against today. */
export type BrewQuickFilter =
  | 'all'
  | 'upcoming'
  | 'this_week'
  | 'next_week'
  | 'this_month'
  | 'last_month'
  | 'custom';

export const brewScheduleQuickFilters: Array<{ key: BrewQuickFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'this_week', label: 'This Week' },
  { key: 'next_week', label: 'Next Week' },
  { key: 'this_month', label: 'This Month' },
  { key: 'last_month', label: 'Last Month' },
  { key: 'custom', label: 'Custom' },
];

/** YYYY-MM-DD string from a Date, in local time. We never want UTC rollover
 * to push a Monday schedule onto Sunday in the Eastern time zone. */
function iso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Monday of the week containing `d`. ISO weeks start on Monday; Sunday is
 * the last day of the previous week so the picker feels intuitive for
 * brewery planning ("this week" = Mon-Sun). */
function mondayOf(d: Date): Date {
  const out = new Date(d);
  const dow = out.getDay(); // 0 = Sunday
  const offset = dow === 0 ? -6 : 1 - dow;
  out.setDate(out.getDate() + offset);
  out.setHours(0, 0, 0, 0);
  return out;
}

function sundayOf(weekStart: Date): Date {
  const out = new Date(weekStart);
  out.setDate(out.getDate() + 6);
  return out;
}

/** Resolve a quick filter into a concrete {from, to} inclusive range in
 * YYYY-MM-DD. Returns null for 'all'. `now` injectable for deterministic
 * tests. */
export function buildBrewScheduleFilter(
  filter: BrewQuickFilter,
  opts: { from?: string; to?: string; now?: Date } = {},
): { from?: string; to?: string } | null {
  const now = opts.now ?? new Date();
  switch (filter) {
    case 'all':
      return null;
    case 'upcoming':
      return { from: iso(now) };
    case 'this_week': {
      const start = mondayOf(now);
      const end = sundayOf(start);
      return { from: iso(start), to: iso(end) };
    }
    case 'next_week': {
      const thisMon = mondayOf(now);
      const nextMon = new Date(thisMon);
      nextMon.setDate(nextMon.getDate() + 7);
      const nextSun = sundayOf(nextMon);
      return { from: iso(nextMon), to: iso(nextSun) };
    }
    case 'this_month': {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return { from: iso(start), to: iso(end) };
    }
    case 'last_month': {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from: iso(start), to: iso(end) };
    }
    case 'custom': {
      const range: { from?: string; to?: string } = {};
      if (opts.from) range.from = opts.from;
      if (opts.to) range.to = opts.to;
      // Custom with no inputs = show everything, matching 'all'.
      if (!range.from && !range.to) return null;
      return range;
    }
  }
}

/** Apply a resolved {from, to} range to a brew list. `brewDate` is the
 * schedule anchor — we filter on when the brew is planned to happen, not
 * when the row was created. `range` is inclusive on both ends, and both
 * ends are optional (open-ended ranges are supported). */
export function filterBrewsByRange<T extends Pick<BrewSchedule, 'brewDate'>>(
  brews: T[],
  range: { from?: string; to?: string } | null,
): T[] {
  if (!range) return brews;
  const { from, to } = range;
  return brews.filter((b) => {
    if (from && b.brewDate < from) return false;
    if (to && b.brewDate > to) return false;
    return true;
  });
}
