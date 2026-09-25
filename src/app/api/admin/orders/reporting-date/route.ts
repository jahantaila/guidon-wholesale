import { NextRequest, NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/auth-check';
import { extractError } from '@/lib/extract-error';
import { getOrder, setOrderReportingDate, getOrderReportingDateChanges } from '@/lib/data';
import { breweryLocalDate } from '@/lib/sales-report';

export const dynamic = 'force-dynamic';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** A real calendar date, not just the right shape ("2026-02-30" fails). */
function isCalendarDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const d = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/**
 * GET /api/admin/orders/reporting-date?orderId=…
 * The order's reporting date, the day it was actually placed, and every
 * change to the reporting date (newest first).
 */
export async function GET(request: NextRequest) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: 'Admin session required' }, { status: 403 });
  }
  try {
    const orderId = new URL(request.url).searchParams.get('orderId') || '';
    if (!orderId) return NextResponse.json({ error: 'orderId is required' }, { status: 400 });
    const order = await getOrder(orderId);
    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    return NextResponse.json({
      orderId,
      placedDate: breweryLocalDate(order.createdAt),
      reportingDate: order.reportingDate ?? null,
      history: await getOrderReportingDateChanges(orderId),
    });
  } catch (err) {
    console.error('[orders/reporting-date GET] failed:', err);
    return NextResponse.json({ error: extractError(err) }, { status: 500 });
  }
}

/**
 * PUT /api/admin/orders/reporting-date
 * Body: { orderId, reportingDate: 'YYYY-MM-DD' | null }
 *
 * Moves which day (and so which month) an order counts toward in reports.
 * The placed timestamp is never changed. null, or the placed day itself,
 * resets it to follow the placed date. Future dates are rejected: the point
 * is filing a late-entered order under the month it belongs to, and a
 * future date would make this month's report silently short.
 */
export async function PUT(request: NextRequest) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: 'Admin session required' }, { status: 403 });
  }
  try {
    const body = await request.json().catch(() => null);
    const orderId = typeof body?.orderId === 'string' ? body.orderId : '';
    if (!orderId) return NextResponse.json({ error: 'orderId is required' }, { status: 400 });

    const raw = body?.reportingDate;
    if (raw !== null && raw !== '' && (typeof raw !== 'string' || !isCalendarDate(raw))) {
      return NextResponse.json(
        { error: 'Order date must be a date in YYYY-MM-DD format.' },
        { status: 400 },
      );
    }

    const order = await getOrder(orderId);
    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

    const placedDate = breweryLocalDate(order.createdAt);
    const today = breweryLocalDate(new Date().toISOString());
    let reportingDate: string | null = raw || null;
    if (reportingDate && reportingDate > today) {
      return NextResponse.json(
        { error: 'The order date cannot be in the future.' },
        { status: 400 },
      );
    }
    // Choosing the placed day is the same as "no override". Storing it
    // explicitly would make the order look back-dated when it is not.
    if (reportingDate === placedDate) reportingDate = null;

    const updated = await setOrderReportingDate(orderId, reportingDate);
    if (!updated) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

    // Read back: if the stored value is not what was asked for, say so
    // rather than letting the UI claim a save that did not happen.
    if ((updated.reportingDate ?? null) !== reportingDate) {
      return NextResponse.json(
        { error: 'The order date did not save. The database may need migration 003.' },
        { status: 500 },
      );
    }

    return NextResponse.json({
      orderId,
      placedDate,
      reportingDate: updated.reportingDate ?? null,
      history: await getOrderReportingDateChanges(orderId),
    });
  } catch (err) {
    console.error('[orders/reporting-date PUT] failed:', err);
    const message = extractError(err);
    const needsMigration = /reporting_date|order_reporting_date_changes/.test(message);
    return NextResponse.json(
      {
        error: needsMigration
          ? 'Order dates are not set up in the database yet (migration 003).'
          : message,
      },
      { status: needsMigration ? 503 : 500 },
    );
  }
}
