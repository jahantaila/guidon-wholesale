import { NextRequest, NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/auth-check';
import { extractError } from '@/lib/extract-error';
import { getCrmContacts, getCustomers, getOrders, getCrmActivities } from '@/lib/data';
import { buildCrmList, quietAccounts } from '@/lib/crm';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/crm/summary
 *
 * The unified CRM list — leads, prospects and customers in one shape — plus
 * the quiet-accounts roll-up.
 *
 * Merged server-side on purpose. The customers page fetches all customers,
 * all orders and all invoices and joins them in the browser; doing the same
 * here would mean shipping the entire activity history to the client on every
 * page load, and that grows without bound. The browser gets one small payload.
 */
export async function GET(request: NextRequest) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: 'Admin session required' }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const quietDaysRaw = Number(searchParams.get('quietDays'));
    const quietDays =
      Number.isFinite(quietDaysRaw) && quietDaysRaw > 0 && quietDaysRaw <= 365
        ? Math.floor(quietDaysRaw)
        : 45;

    const [contacts, customers, orders, activities] = await Promise.all([
      getCrmContacts(),
      getCustomers(),
      getOrders(),
      getCrmActivities(),
    ]);

    const rows = buildCrmList(contacts, customers, orders, activities);
    const quiet = quietAccounts(customers, orders, quietDays);

    return NextResponse.json({
      rows,
      quiet,
      quietDays,
      counts: {
        total: rows.length,
        lead: rows.filter((r) => r.status === 'lead').length,
        prospect: rows.filter((r) => r.status === 'prospect').length,
        customer: rows.filter((r) => r.status === 'customer').length,
        followups: rows.filter((r) => !!r.nextFollowupDate).length,
      },
      // Surfaced so the UI can explain an empty page rather than looking
      // broken when the migration has not been run yet.
      activityLogAvailable: activities.length > 0 || contacts.length > 0,
    });
  } catch (err) {
    console.error('[api/admin/crm/summary] failed:', err);
    return NextResponse.json(
      { error: `CRM summary failed: ${extractError(err)}` },
      { status: 500 },
    );
  }
}
