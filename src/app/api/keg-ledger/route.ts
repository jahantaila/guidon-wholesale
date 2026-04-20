import { NextRequest, NextResponse } from 'next/server';
import { getKegLedger, getKegLedgerByCustomer, getAllKegBalances, addKegLedgerEntry } from '@/lib/data';
import { generateId } from '@/lib/utils';
import type { KegLedgerEntry, KegSize } from '@/lib/types';
import { KEG_DEPOSITS } from '@/lib/types';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const customerId = searchParams.get('customerId');
  const balances = searchParams.get('balances');

  if (balances === 'true') {
    return NextResponse.json(await getAllKegBalances());
  }

  if (customerId) {
    return NextResponse.json(await getKegLedgerByCustomer(customerId));
  }

  return NextResponse.json(await getKegLedger());
}

export async function POST(request: NextRequest) {
  const body = await request.json();

  // Validate required fields. Previously the API multiplied an undefined
  // depositAmount by quantity, producing NaN and a schema violation on
  // insert. Portal only sends {customerId, type, size, quantity, notes},
  // so derive the deposit from KEG_DEPOSITS.
  if (!body.customerId || !body.type || !body.size || !body.quantity) {
    return NextResponse.json(
      { error: 'customerId, type, size, and quantity are required.' },
      { status: 400 },
    );
  }
  if (body.type !== 'deposit' && body.type !== 'return') {
    return NextResponse.json(
      { error: 'type must be "deposit" or "return".' },
      { status: 400 },
    );
  }
  if (!['1/2bbl', '1/4bbl', '1/6bbl'].includes(body.size)) {
    return NextResponse.json(
      { error: 'size must be one of 1/2bbl, 1/4bbl, 1/6bbl.' },
      { status: 400 },
    );
  }
  const quantity = Number(body.quantity);
  if (!Number.isFinite(quantity) || quantity < 1) {
    return NextResponse.json(
      { error: 'quantity must be a positive integer.' },
      { status: 400 },
    );
  }

  // Resolve deposit per keg: use explicit body value if given, otherwise
  // fall back to the canonical KEG_DEPOSITS table.
  const depositAmount: number =
    typeof body.depositAmount === 'number' && Number.isFinite(body.depositAmount)
      ? body.depositAmount
      : KEG_DEPOSITS[body.size as KegSize];

  const entry: KegLedgerEntry = {
    id: generateId('kl'),
    customerId: body.customerId,
    orderId: body.orderId || '',
    type: body.type,
    size: body.size,
    quantity,
    depositAmount,
    totalAmount:
      body.type === 'return'
        ? -(depositAmount * quantity)
        : depositAmount * quantity,
    date: new Date().toISOString(),
    notes: body.notes || '',
  };
  await addKegLedgerEntry(entry);
  return NextResponse.json(entry, { status: 201 });
}
