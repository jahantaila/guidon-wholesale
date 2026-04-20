import { NextRequest, NextResponse } from 'next/server';
import { extractError } from '@/lib/extract-error';
import { getOrders, getCustomers, getInvoices, getKegLedger, getApplications } from '@/lib/data';
import { send, formatCurrencyForEmail } from '@/lib/email';

/**
 * /api/cron/weekly-digest
 *
 * Vercel cron runs this Mondays at 13:00 UTC. Sends a single email to the
 * notification recipients summarizing the past 7 days: orders placed,
 * revenue confirmed, outstanding AR, applications awaiting review, and
 * kegs that have been out a while (>60 days) so Mike can follow up.
 *
 * Auth: same shape as the recurring-orders cron — Vercel cron header or
 * CRON_SECRET bearer.
 */
export const dynamic = 'force-dynamic';

function authorized(request: NextRequest): boolean {
  if (request.headers.get('x-vercel-cron')) return true;
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const provided = request.headers.get('authorization') || request.headers.get('x-cron-secret');
  if (!provided) return false;
  const token = provided.startsWith('Bearer ') ? provided.slice(7) : provided;
  return token === expected;
}

async function buildDigest() {
  const [orders, customers, invoices, ledger, apps] = await Promise.all([
    getOrders(),
    getCustomers(),
    getInvoices(),
    getKegLedger(),
    getApplications(),
  ]);

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const weekOrders = orders.filter((o) => new Date(o.createdAt) >= weekAgo);
  const weekRevenue = orders
    .filter((o) => (o.status === 'confirmed' || o.status === 'completed') && new Date(o.createdAt) >= weekAgo)
    .reduce((s, o) => s + o.total, 0);

  const outstandingInvoices = invoices.filter((i) => i.status === 'unpaid' || i.status === 'overdue');
  const outstandingAR = outstandingInvoices.reduce((s, i) => s + i.total, 0);

  const pendingApps = apps.filter((a) => !a.status || a.status === 'pending');

  // Per-customer oldest-outstanding-keg age (FIFO, same as admin keg tracker)
  const staleKegs: Array<{ businessName: string; days: number; count: number }> = [];
  const byCustomer = new Map<string, typeof ledger>();
  for (const e of ledger) {
    if (!byCustomer.has(e.customerId)) byCustomer.set(e.customerId, [] as typeof ledger);
    byCustomer.get(e.customerId)!.push(e);
  }
  byCustomer.forEach((entries, custId) => {
    const sorted = [...entries].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    type Q = { date: string; qty: number };
    const queue: Q[] = [];
    for (const e of sorted) {
      if (e.type === 'deposit') queue.push({ date: e.date, qty: e.quantity });
      else {
        let rem = e.quantity;
        while (rem > 0 && queue.length > 0) {
          const head = queue[0];
          if (head.qty <= rem) { rem -= head.qty; queue.shift(); }
          else { head.qty -= rem; rem = 0; }
        }
      }
    }
    if (queue.length > 0) {
      const days = Math.floor((Date.now() - new Date(queue[0].date).getTime()) / (1000 * 60 * 60 * 24));
      if (days > 60) {
        const cust = customers.find((c) => c.id === custId);
        const count = queue.reduce((s, q) => s + q.qty, 0);
        if (cust) staleKegs.push({ businessName: cust.businessName, days, count });
      }
    }
  });
  staleKegs.sort((a, b) => b.days - a.days);

  return {
    weekOrders: weekOrders.length,
    weekRevenue,
    outstandingInvoices: outstandingInvoices.length,
    outstandingAR,
    pendingApps: pendingApps.length,
    staleKegs: staleKegs.slice(0, 5),
  };
}

function renderDigestHtml(d: Awaited<ReturnType<typeof buildDigest>>) {
  const weekEnd = new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const weekStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const staleRows = d.staleKegs
    .map(
      (k) =>
        `<li style="margin:4px 0;"><strong>${k.businessName}</strong> &middot; ${k.count} keg${k.count === 1 ? '' : 's'} out <em style="color:#C0392B;">${k.days} days</em></li>`,
    )
    .join('');

  return `<!doctype html><html><body style="margin:0;padding:24px 16px;background:#F5EFDF;font-family:Georgia,serif;color:#2A2416;">
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:560px;margin:0 auto;border:1px solid #D8CDA8;background:#FBF7EA;">
  <tr><td style="padding:24px 28px;border-bottom:1px solid #D8CDA8;">
    <div style="font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#9E7A3B;font-weight:600;margin-bottom:6px;">Guidon Brewing Co. &middot; Weekly digest</div>
    <h1 style="margin:0;font-size:24px;font-weight:500;">Week of ${weekStart} – ${weekEnd}</h1>
  </td></tr>
  <tr><td style="padding:20px 28px;font-size:15px;line-height:1.6;">
    <p style="margin:0 0 12px;"><strong>${d.weekOrders}</strong> order${d.weekOrders === 1 ? '' : 's'} placed this week.</p>
    <p style="margin:0 0 12px;"><strong>${formatCurrencyForEmail(d.weekRevenue)}</strong> in confirmed revenue this week.</p>
    ${d.outstandingInvoices > 0
      ? `<p style="margin:0 0 12px;color:#C0392B;"><strong>${d.outstandingInvoices}</strong> invoice${d.outstandingInvoices === 1 ? '' : 's'} outstanding (${formatCurrencyForEmail(d.outstandingAR)}).</p>`
      : `<p style="margin:0 0 12px;">No outstanding invoices.</p>`}
    ${d.pendingApps > 0
      ? `<p style="margin:0 0 12px;"><strong>${d.pendingApps}</strong> wholesale application${d.pendingApps === 1 ? '' : 's'} awaiting review.</p>`
      : ''}
    ${staleRows
      ? `<div style="margin-top:16px;padding:12px 14px;background:#EEE5CE;border-left:3px solid #C0392B;">
          <div style="font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#6B5F48;margin-bottom:6px;">Old kegs to chase</div>
          <ul style="margin:4px 0 0 18px;font-size:14px;">${staleRows}</ul>
        </div>`
      : ''}
  </td></tr>
  <tr><td style="padding:16px 28px;border-top:1px solid #D8CDA8;font-size:11px;color:#6B5F48;">
    Open the dashboard for full detail. This email is auto-sent every Monday — manage recipients in admin settings.
  </td></tr>
</table></body></html>`;
}

async function runCron() {
  const digest = await buildDigest();
  const html = renderDigestHtml(digest);
  const { getNotificationEmails } = await import('@/lib/data');
  const to = await getNotificationEmails();
  const result = await send({
    to,
    subject: `Weekly digest — ${digest.weekOrders} orders, ${formatCurrencyForEmail(digest.weekRevenue)}`,
    html,
  });
  return { sent: result.ok, to, digest };
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    return NextResponse.json(await runCron());
  } catch (err) {
    console.error('[weekly-digest] failed:', err);
    const message = extractError(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}
