import { NextRequest, NextResponse } from 'next/server';
import { getRecurringOrders, createRecurringOrder, updateRecurringOrder, deleteRecurringOrder } from '@/lib/data';
import { generateId } from '@/lib/utils';
import type { RecurringOrder } from '@/lib/types';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const customerId = searchParams.get('customerId') || undefined;
    const rows = await getRecurringOrders(customerId);
    return NextResponse.json(rows);
  } catch (err) {
    console.error('[api/recurring-orders GET] failed:', err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body.customerId || !body.name || !Array.isArray(body.items) || body.items.length === 0) {
      return NextResponse.json(
        { error: 'customerId, name, and non-empty items[] are required' },
        { status: 400 },
      );
    }
    const intervalDays = Number(body.intervalDays);
    if (!Number.isInteger(intervalDays) || intervalDays < 1 || intervalDays > 365) {
      return NextResponse.json({ error: 'intervalDays must be 1..365' }, { status: 400 });
    }
    // Default first run to "intervalDays from now" so the very first order
    // goes out on schedule. Admin can override via body.nextRunAt.
    const nextRunAt = body.nextRunAt
      ? new Date(body.nextRunAt).toISOString()
      : new Date(Date.now() + intervalDays * 24 * 60 * 60 * 1000).toISOString();

    const rec: RecurringOrder = {
      id: generateId('rec'),
      customerId: body.customerId,
      name: String(body.name).trim(),
      items: body.items,
      intervalDays,
      nextRunAt,
      active: body.active !== false,
      createdAt: new Date().toISOString(),
    };
    await createRecurringOrder(rec);
    return NextResponse.json(rec, { status: 201 });
  } catch (err) {
    console.error('[api/recurring-orders POST] failed:', err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, ...updates } = body;
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }
    const updated = await updateRecurringOrder(id, updates);
    if (!updated) {
      return NextResponse.json({ error: 'Recurring order not found' }, { status: 404 });
    }
    return NextResponse.json(updated);
  } catch (err) {
    console.error('[api/recurring-orders PUT] failed:', err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body.id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }
    const ok = await deleteRecurringOrder(body.id);
    if (!ok) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[api/recurring-orders DELETE] failed:', err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
