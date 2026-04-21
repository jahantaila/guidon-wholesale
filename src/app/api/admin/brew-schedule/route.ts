import { NextRequest, NextResponse } from 'next/server';
import { extractError } from '@/lib/extract-error';
import { isAdminRequest } from '@/lib/auth-check';
import {
  getBrewSchedule,
  createBrewSchedule,
  updateBrewSchedule,
  deleteBrewSchedule,
  adjustProductInventory,
} from '@/lib/data';
import { generateId } from '@/lib/utils';
import type { BrewSchedule } from '@/lib/types';

// Opt out of static prerendering — like other admin mutation routes, without
// this Next.js can prerender the GET and serve 405 for POST/PUT/DELETE on prod.
export const dynamic = 'force-dynamic';

/**
 * /api/admin/brew-schedule
 *
 * Admin-only CRUD for the "I'm brewing X on date Y" schedule. The production
 * planning page uses the earliest uncompleted brewDate per product+size to
 * project when deficits clear.
 *
 * GET     → list non-completed brews (use ?all=true to include history)
 * POST    → create a new scheduled brew
 * PUT     → update fields OR mark complete (completedAt set). Marking
 *           complete also bumps product_sizes.inventory_count by
 *           expected_yield so on-hand reflects the new stock.
 * DELETE  → cancel a scheduled brew (admin changed plan).
 */

export async function GET(request: NextRequest) {
  if (!isAdminRequest(request)) {
    return NextResponse.json([], { status: 200 });
  }
  try {
    const includeCompleted = new URL(request.url).searchParams.get('all') === 'true';
    const rows = await getBrewSchedule(includeCompleted);
    return NextResponse.json(rows);
  } catch (err) {
    console.error('[api/admin/brew-schedule GET] failed:', err);
    return NextResponse.json({ error: extractError(err) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: 'Admin session required' }, { status: 403 });
  }
  try {
    const body = await request.json();
    if (!body.productId || !body.size || !body.brewDate) {
      return NextResponse.json(
        { error: 'productId, size, and brewDate are required.' },
        { status: 400 },
      );
    }
    const yield_ = Number(body.expectedYield);
    const entry: BrewSchedule = {
      id: generateId('brew'),
      productId: String(body.productId),
      size: String(body.size),
      brewDate: String(body.brewDate),
      expectedYield: Number.isFinite(yield_) && yield_ > 0 ? Math.floor(yield_) : 0,
      notes: typeof body.notes === 'string' ? body.notes : '',
      createdAt: new Date().toISOString(),
    };
    const created = await createBrewSchedule(entry);
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    console.error('[api/admin/brew-schedule POST] failed:', err);
    return NextResponse.json({ error: extractError(err) }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: 'Admin session required' }, { status: 403 });
  }
  try {
    const body = await request.json();
    const { id, ...rest } = body;
    if (!id) return NextResponse.json({ error: 'id is required.' }, { status: 400 });

    // Complete flow: if caller passes { complete: true }, mark completed
    // AND bump inventory. Keeping this in one endpoint so admin has a
    // single "Mark complete" action that both records the landing and
    // reconciles stock.
    if (rest.complete === true) {
      const existing = (await getBrewSchedule(true)).find((b) => b.id === id);
      if (!existing) {
        return NextResponse.json({ error: 'Brew schedule entry not found.' }, { status: 404 });
      }
      if (existing.completedAt) {
        return NextResponse.json(existing);
      }
      const completedAt = new Date().toISOString();
      const updated = await updateBrewSchedule(id, { completedAt });
      if (existing.expectedYield > 0) {
        await adjustProductInventory(existing.productId, existing.size, existing.expectedYield);
      }
      return NextResponse.json(updated);
    }

    const updates: Partial<BrewSchedule> = {};
    if (rest.productId !== undefined) updates.productId = String(rest.productId);
    if (rest.size !== undefined) updates.size = String(rest.size);
    if (rest.brewDate !== undefined) updates.brewDate = String(rest.brewDate);
    if (rest.expectedYield !== undefined) updates.expectedYield = Math.max(0, Number(rest.expectedYield));
    if (rest.notes !== undefined) updates.notes = String(rest.notes);
    const updated = await updateBrewSchedule(id, updates);
    if (!updated) {
      return NextResponse.json({ error: 'Brew schedule entry not found.' }, { status: 404 });
    }
    return NextResponse.json(updated);
  } catch (err) {
    console.error('[api/admin/brew-schedule PUT] failed:', err);
    return NextResponse.json({ error: extractError(err) }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ error: 'Admin session required' }, { status: 403 });
  }
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id is required.' }, { status: 400 });
    const ok = await deleteBrewSchedule(id);
    if (!ok) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[api/admin/brew-schedule DELETE] failed:', err);
    return NextResponse.json({ error: extractError(err) }, { status: 500 });
  }
}
