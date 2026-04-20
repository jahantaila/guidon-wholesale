import { NextResponse } from 'next/server';
import { getSetting } from '@/lib/data';

/**
 * GET /api/delivery-schedule
 *
 * Public endpoint — the customer-facing /order and /portal checkout screens
 * call this to discover which weekdays the brewery delivers and how much
 * lead time is required. Returns safe defaults (Tue + Thu, 2-day lead)
 * when unset. No sensitive data so no auth required.
 */
export async function GET() {
  try {
    const [deliveryDays, deliveryLeadDays] = await Promise.all([
      getSetting<number[]>('delivery_days', [2, 4]),
      getSetting<number>('delivery_lead_days', 2),
    ]);
    return NextResponse.json({ deliveryDays, deliveryLeadDays });
  } catch (err) {
    console.error('[api/delivery-schedule GET] failed:', err);
    // Safe fallback so checkout never totally breaks.
    return NextResponse.json({ deliveryDays: [2, 4], deliveryLeadDays: 2 });
  }
}
