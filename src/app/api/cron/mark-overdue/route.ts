import { NextRequest, NextResponse } from 'next/server';
import { extractError } from '@/lib/extract-error';
import { cronCaller, claimCronRun } from '@/lib/cron-auth';
import { getInvoices, updateInvoice } from '@/lib/data';

/**
 * /api/cron/mark-overdue
 *
 * Daily cron (13:00 UTC, alongside the others). Flips any invoice in
 * status='unpaid' whose sentAt is older than 30 days to status='overdue'.
 * Idempotent. Doesn't email — the overdue badge + weekly digest surface
 * it; customer nudges stay a manual admin call.
 *
 * Auth: see lib/cron-auth (Vercel scheduler, rate-limited; or CRON_SECRET).
 */
export const dynamic = 'force-dynamic';


const OVERDUE_THRESHOLD_DAYS = 30;

async function runCron() {
  const invoices = await getInvoices();
  const threshold = new Date(Date.now() - OVERDUE_THRESHOLD_DAYS * 24 * 60 * 60 * 1000);
  const toFlip = invoices.filter((i) => {
    if (i.status !== 'unpaid') return false;
    const stamp = i.sentAt ? new Date(i.sentAt) : new Date(i.issuedAt);
    return stamp < threshold;
  });
  const flipped: string[] = [];
  for (const inv of toFlip) {
    try {
      await updateInvoice(inv.id, { status: 'overdue' });
      flipped.push(inv.id);
    } catch (err) {
      console.error('[mark-overdue] failed for', inv.id, err);
    }
  }
  return { flipped, considered: invoices.length, thresholdDays: OVERDUE_THRESHOLD_DAYS };
}

export async function GET(request: NextRequest) {
  const caller = cronCaller(request);
  if (!caller) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    if (!(await claimCronRun('mark-overdue', caller, 12))) {
      return NextResponse.json({ ok: true, skipped: 'already ran recently' });
    }
    return NextResponse.json(await runCron());
  } catch (err) {
    console.error('[mark-overdue] top-level:', err);
    const message = extractError(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}
