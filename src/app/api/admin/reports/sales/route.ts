import { NextRequest, NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/auth-check';
import { extractError } from '@/lib/extract-error';
import { getOrders, getProducts, getCustomers } from '@/lib/data';
import {
  buildSalesReport,
  salesReportToCsv,
  salesReportFilename,
} from '@/lib/sales-report';

// Reads request state, so it must not be statically evaluated at build time
// (which happens in CI, where there is no Supabase).
export const dynamic = 'force-dynamic';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * GET /api/admin/reports/sales
 *
 * How much of each beer style, in each package type, was ordered over a date
 * range. Admin-only.
 *
 * Query params:
 *   from, to           YYYY-MM-DD, inclusive, brewery-local calendar dates
 *   includeCustomer    'true' to break every row out per customer
 *   includeCancelled   'true' to count cancelled orders as demand
 *   format             'csv' for a download; anything else returns JSON
 *
 * The aggregation itself lives in src/lib/sales-report.ts so it can be unit
 * tested without a request or a database.
 */
export async function GET(request: NextRequest) {
  // Checked here as well as in middleware. Middleware runs on the Edge
  // runtime and cannot always resolve the signing secret, so it is defence in
  // depth rather than the boundary.
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: 'Admin session required' }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const from = searchParams.get('from') || undefined;
    const to = searchParams.get('to') || undefined;

    // Reject malformed dates rather than silently ignoring them — a typo'd
    // range that quietly returns all-time numbers is worse than an error.
    for (const [name, value] of [['from', from], ['to', to]] as const) {
      if (value && !DATE_RE.test(value)) {
        return NextResponse.json(
          { error: `${name} must be a date in YYYY-MM-DD format.` },
          { status: 400 },
        );
      }
    }
    if (from && to && from > to) {
      return NextResponse.json(
        { error: 'The start date is after the end date.' },
        { status: 400 },
      );
    }

    const includeCustomer = searchParams.get('includeCustomer') === 'true';
    const includeCancelled = searchParams.get('includeCancelled') === 'true';

    const [orders, products, customers] = await Promise.all([
      getOrders(),
      getProducts(),
      // Only needed for the customer dimension; skip the round trip otherwise.
      includeCustomer ? getCustomers(true) : Promise.resolve([]),
    ]);

    const report = buildSalesReport(orders, products, customers, {
      from,
      to,
      includeCustomer,
      includeCancelled,
    });

    if (searchParams.get('format') === 'csv') {
      return new NextResponse(salesReportToCsv(report), {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${salesReportFilename(report)}"`,
        },
      });
    }

    return NextResponse.json(report);
  } catch (err) {
    console.error('[api/admin/reports/sales] failed:', err);
    return NextResponse.json(
      { error: `Sales report failed: ${extractError(err)}` },
      { status: 500 },
    );
  }
}
