import { NextRequest, NextResponse } from 'next/server';
import { getProducts, getAllProducts, createProduct, updateProduct, deleteProduct } from '@/lib/data';
import { generateId } from '@/lib/utils';
import type { Product } from '@/lib/types';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const all = searchParams.get('all');

  if (all === 'true') {
    const products = await getAllProducts();
    return NextResponse.json(products);
  }

  const products = await getProducts();
  return NextResponse.json(products);
}

export async function POST(request: NextRequest) {
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
}

export async function PUT(request: NextRequest) {
  const body = await request.json();

  if (!body.id) {
    return NextResponse.json({ error: 'Product ID is required.' }, { status: 400 });
  }

  const updated = await updateProduct(body.id, body);
  if (!updated) {
    return NextResponse.json({ error: 'Product not found.' }, { status: 404 });
  }

  return NextResponse.json(updated);
}

export async function DELETE(request: NextRequest) {
  const body = await request.json();

  if (!body.id) {
    return NextResponse.json({ error: 'Product ID is required.' }, { status: 400 });
  }

  const deleted = await deleteProduct(body.id);
  if (!deleted) {
    return NextResponse.json({ error: 'Product not found.' }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
