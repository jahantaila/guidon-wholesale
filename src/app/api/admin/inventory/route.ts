import { NextRequest, NextResponse } from 'next/server';
import { adjustProductInventory, setProductInventory } from '@/lib/data';
import type { KegSize } from '@/lib/types';

/**
 * PATCH /api/admin/inventory
 *
 * Body: { productId: string, size: string, count?: number, delta?: number }
 *
 * Size is arbitrary (admin-defined on the product). If `count` is provided,
 * sets absolute inventory. If `delta` is provided, adjusts relative
 * (positive = restock, negative = consume). Returns { inventoryCount }.
 */
export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const { productId, size, count, delta } = body as {
    productId?: string;
    size?: string;
    count?: number;
    delta?: number;
  };

  if (!productId || !size) {
    return NextResponse.json(
      { error: 'productId and size are required.' },
      { status: 400 },
    );
  }
  if (count === undefined && delta === undefined) {
    return NextResponse.json(
      { error: 'Either count or delta must be provided.' },
      { status: 400 },
    );
  }

  let result: number | null;
  if (count !== undefined) {
    result = await setProductInventory(productId, size as KegSize, count);
  } else {
    result = await adjustProductInventory(productId, size as KegSize, delta!);
  }

  if (result === null) {
    return NextResponse.json(
      {
        error:
          'Product/size not found, or inventory_count column missing. Re-run supabase/schema.sql to enable inventory tracking.',
      },
      { status: 404 },
    );
  }

  return NextResponse.json({ inventoryCount: result });
}
