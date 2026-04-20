import { NextRequest, NextResponse } from 'next/server';
import {
  getDueRecurringOrders,
  getUpcomingRecurringOrders,
  updateRecurringOrder,
  createOrder,
  createInvoice,
  getCustomers,
} from '@/lib/data';
import { generateId } from '@/lib/utils';
import { notifyOrderPlaced, notifyRecurringHeadsUp } from '@/lib/email';
import type { Order, Invoice } from '@/lib/types';

/**
 * /api/cron/recurring-orders
 *
 * Hit daily by Vercel cron. For each active recurring order with
 * next_run_at <= now(): create a pending order from the template, advance
 * next_run_at by intervalDays, draft invoice, notify. Admin reviews and
 * confirms like any other order.
 *
 * Auth: requires either the Vercel cron header (x-vercel-cron) or a
 * CRON_SECRET header match, so random callers can't spam-fire orders.
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

async function runCron() {
  const [due, upcoming, customers] = await Promise.all([
    getDueRecurringOrders(),
    getUpcomingRecurringOrders(25), // next 25h window, + heads-up not yet sent
    getCustomers(),
  ]);
  const created: string[] = [];
  const skipped: string[] = [];
  const headsUp: string[] = [];

  // Fire heads-up emails before the create loop so heads-up is 24h early,
  // not simultaneous with the actual order.
  for (const rec of upcoming) {
    try {
      const customer = customers.find((c) => c.id === rec.customerId);
      if (!customer) continue;
      await notifyRecurringHeadsUp({
        customerEmail: customer.email,
        customerName: customer.contactName,
        templateName: rec.name,
        items: rec.items.map((i) => ({ productName: i.productName, size: i.size, quantity: i.quantity })),
        willFireAt: rec.nextRunAt,
      });
      await updateRecurringOrder(rec.id, { headsUpSentAt: new Date().toISOString() });
      headsUp.push(rec.id);
    } catch (err) {
      console.error('[cron] heads-up failed for', rec.id, err);
    }
  }

  for (const rec of due) {
    try {
      const customer = customers.find((c) => c.id === rec.customerId);
      if (!customer) {
        skipped.push(`${rec.id}: customer ${rec.customerId} gone — deactivating`);
        await updateRecurringOrder(rec.id, { active: false });
        continue;
      }

      // Compute order totals from the template items (unit_price + deposit).
      const subtotal = rec.items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
      const totalDeposit = rec.items.reduce((s, i) => s + i.deposit * i.quantity, 0);
      const total = subtotal + totalDeposit;

      // Default delivery to 3 days from now. Admin will adjust if needed.
      const deliveryDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);

      const order: Order = {
        id: generateId('ord'),
        customerId: rec.customerId,
        status: 'pending',
        items: rec.items,
        kegReturns: [],
        subtotal,
        totalDeposit,
        total,
        deliveryDate,
        notes: `Auto-generated from recurring order "${rec.name}"`,
        createdAt: new Date().toISOString(),
      };
      await createOrder(order);

      // Draft invoice at placement, same as normal POST /api/orders path.
      const draftInvoice: Invoice = {
        id: generateId('inv'),
        orderId: order.id,
        customerId: order.customerId,
        status: 'draft',
        items: order.items,
        subtotal,
        totalDeposit,
        total,
        issuedAt: new Date().toISOString(),
        paidAt: null,
      };
      await createInvoice(draftInvoice).catch((err) =>
        console.error('[cron] draft invoice failed (non-fatal):', err),
      );

      // Email the customer + brewery. Await so we actually deliver.
      await notifyOrderPlaced({
        orderId: order.id,
        customerEmail: customer.email,
        customerName: customer.contactName,
        businessName: customer.businessName,
        items: order.items,
        subtotal,
        totalDeposit,
        total,
        deliveryDate,
        notes: order.notes,
      }).catch((err) => console.error('[cron] email failed (non-fatal):', err));

      // Advance schedule + reset heads-up flag so next cycle's 24h nudge
      // fires again.
      const nextRunAt = new Date(Date.now() + rec.intervalDays * 24 * 60 * 60 * 1000).toISOString();
      await updateRecurringOrder(rec.id, { nextRunAt, headsUpSentAt: null });

      created.push(`${rec.id} -> ${order.id}`);
    } catch (err) {
      console.error('[cron] failed for recurring', rec.id, err);
      skipped.push(`${rec.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { created, skipped, headsUp, due: due.length, upcoming: upcoming.length };
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const result = await runCron();
    return NextResponse.json(result);
  } catch (err) {
    console.error('[cron] top-level error:', err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}
