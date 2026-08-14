import { NextRequest, NextResponse } from 'next/server';
import { extractError } from '@/lib/extract-error';
import { isAdminRequest } from '@/lib/auth-check';
import { getProducts, getAllProducts, createProduct, updateProduct, deleteProduct, reorderProducts } from '@/lib/data';
import { generateId } from '@/lib/utils';
import type { Product } from '@/lib/types';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const all = searchParams.get('all');

    if (all === 'true') {
      // Unfiltered "all" list is for admin; accepts cookie OR Bearer.
      if (!(await isAdminRequest(request))) {
        return NextResponse.json([], { status: 200 });
      }
      const products = await getAllProducts();
      return NextResponse.json(products);
    }

    const products = await getProducts();
    return NextResponse.json(products);
  } catch (err) {
    console.error('[api/products GET] failed:', err);
    const message = extractError(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = await isAdminRequest(request);
    if (!admin) {
      return NextResponse.json({ error: 'Admin session required' }, { status: 403 });
    }
    const body = await request.json();

    if (!body.name || !body.style || !body.category) {
      return NextResponse.json({ error: 'Name, style, and category are required.' }, { status: 400 });
    }

    const product: Product = {
      id: generateId('prod'),
      name: body.name,
      style: body.style,
      abv: body.abv || 0,
      description: body.description || '',
      category: body.category,
      available: body.available !== false,
      sizes: body.sizes || [],
    };

    await createProduct(product);
    return NextResponse.json(product, { status: 201 });
  } catch (err) {
    console.error('[api/products POST] failed:', err);
    const message = extractError(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const admin = await isAdminRequest(request);
    if (!admin) {
      return NextResponse.json({ error: 'Admin session required' }, { status: 403 });
    }
    const body = await request.json();

    if (!body.id) {
      return NextResponse.json({ error: 'Product ID is required.' }, { status: 400 });
    }

    const { id, ...fields } = body;
    const updated = await updateProduct(id, fields);
    if (!updated) {
      return NextResponse.json({ error: 'Product not found.' }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch (err) {
    console.error('[api/products PUT] failed:', err);
    const message = extractError(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * PATCH /api/products  — reorder the whole catalog.
 * Body: { order: string[] }  (product ids in the desired display order)
 *
 * Separate from PUT (which edits one product) because a drag-and-drop reorder
 * writes many rows at once and carries no other field changes.
 */
export async function PATCH(request: NextRequest) {
  try {
    const admin = await isAdminRequest(request);
    if (!admin) {
      return NextResponse.json({ error: 'Admin session required' }, { status: 403 });
    }
    const body = await request.json();
    const order = body?.order;
    if (!Array.isArray(order) || order.some((id) => typeof id !== 'string')) {
      return NextResponse.json({ error: 'order must be an array of product ids.' }, { status: 400 });
    }
    await reorderProducts(order);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[api/products PATCH] failed:', err);
    const message = extractError(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const admin = await isAdminRequest(request);
    if (!admin) {
      return NextResponse.json({ error: 'Admin session required' }, { status: 403 });
    }
    const body = await request.json();

    if (!body.id) {
      return NextResponse.json({ error: 'Product ID is required.' }, { status: 400 });
    }

    const deleted = await deleteProduct(body.id);
    if (!deleted) {
      return NextResponse.json({ error: 'Product not found.' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[api/products DELETE] failed:', err);
    const message = extractError(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
