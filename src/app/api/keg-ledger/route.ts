import { NextRequest, NextResponse } from 'next/server';
import { getKegLedger, getKegLedgerByCustomer, getAllKegBalances, addKegLedgerEntry } from '@/lib/data';
import { generateId } from '@/lib/utils';
import type { KegLedgerEntry } from '@/lib/types';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const customerId = searchParams.get('customerId');
  const balances = searchParams.get('balances');

  if (balances === 'true') {
    return NextResponse.json(getAllKegBalances());
  }

  if (customerId) {
    return NextResponse.json(getKegLedgerByCustomer(customerId));
  }

  return NextResponse.json(getKegLedger());
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const entry: KegLedgerEntry = {
    id: generateId('kl'),
    customerId: body.customerId,
    orderId: body.orderId || '',
    type: body.type,
    size: body.size,
    quantity: body.quantity,
    depositAmount: body.depositAmount,
    totalAmount: body.type === 'return' ? -(body.depositAmount * body.quantity) : body.depositAmount * body.quantity,
    date: new Date().toISOString(),
    notes: body.notes || '',
  };
  addKegLedgerEntry(entry);
  return NextResponse.json(entry, { status: 201 });
}
