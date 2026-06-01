import { NextResponse } from 'next/server';
import { getAlert } from '@/lib/data';

// Customer portal popup fetches this on every Dashboard mount. Marked dynamic
// so Vercel doesn't prerender the GET and serve stale content after the admin
// updates the alert.
export const dynamic = 'force-dynamic';

/**
 * GET /api/alerts
 * Public — used by the portal popup to fetch the currently-active alert.
 * Returns the alert payload OR null when nothing should display. Filters out
 * inactive alerts and alerts whose endsAt has passed, so the client never has
 * to think about visibility rules.
 */
export async function GET() {
  const alert = await getAlert();
  if (!alert || !alert.active) {
    return NextResponse.json(null);
  }
  if (alert.endsAt && Date.now() > new Date(alert.endsAt).getTime()) {
    return NextResponse.json(null);
  }
  // Strip server-only metadata before returning to the public surface.
  // updatedAt is not sensitive but it leaks admin activity timing, and the
  // client doesn't need it.
  return NextResponse.json({
    id: alert.id,
    title: alert.title,
    body: alert.body,
    endsAt: alert.endsAt,
  });
}
