import { NextRequest, NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/auth-check';
import { getOrderTemplates, createOrderTemplate, deleteOrderTemplate } from '@/lib/data';
import { generateId } from '@/lib/utils';
import type { OrderTemplate } from '@/lib/types';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const customerId = searchParams.get('customerId');
    if (!customerId) {
      return NextResponse.json({ error: 'customerId is required' }, { status: 400 });
    }
    const admin = isAdminRequest(request);
    const portalCustomerId = request.cookies.get('portal_session')?.value || '';
    if (!admin && portalCustomerId !== customerId) {
      return NextResponse.json([], { status: 200 });
    }
    const templates = await getOrderTemplates(customerId);
    return NextResponse.json(templates);
  } catch (err) {
    console.error('[api/order-templates GET] failed:', err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body.customerId || !body.name || !Array.isArray(body.items)) {
      return NextResponse.json(
        { error: 'customerId, name, and items[] are required' },
        { status: 400 },
      );
    }
    const admin = isAdminRequest(request);
    const portalCustomerId = request.cookies.get('portal_session')?.value || '';
    if (!admin && portalCustomerId !== body.customerId) {
      return NextResponse.json({ error: 'Not authorized for this customer' }, { status: 403 });
    }
    const name = String(body.name).trim();
    if (!name) {
      return NextResponse.json({ error: 'Template name cannot be empty' }, { status: 400 });
    }
    if (body.items.length === 0) {
      return NextResponse.json({ error: 'Template must have at least one item' }, { status: 400 });
    }
    const template: OrderTemplate = {
      id: generateId('tpl'),
      customerId: body.customerId,
      name,
      items: body.items,
      createdAt: new Date().toISOString(),
    };
    await createOrderTemplate(template);
    return NextResponse.json(template, { status: 201 });
  } catch (err) {
    console.error('[api/order-templates POST] failed:', err);
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
    const admin = isAdminRequest(request);
    const portalCustomerId = request.cookies.get('portal_session')?.value || '';
    if (!admin) {
      // Portal user can only delete their own templates.
      const mine = await getOrderTemplates(portalCustomerId);
      if (!mine.some((t) => t.id === body.id)) {
        return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
      }
    }
    const ok = await deleteOrderTemplate(body.id);
    if (!ok) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[api/order-templates DELETE] failed:', err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
