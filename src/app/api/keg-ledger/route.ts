import { NextRequest, NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/auth-check';
import { getKegLedger, getKegLedgerByCustomer, getAllKegBalances, addKegLedgerEntry } from '@/lib/data';
import { generateId } from '@/lib/utils';
import type { KegLedgerEntry, KegSize } from '@/lib/types';
import { KEG_DEPOSITS } from '@/lib/types';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const customerId = searchParams.get('customerId');
  const balances = searchParams.get('balances');
  const admin = isAdminRequest(request);
  const portalCustomerId = request.cookies.get('portal_session')?.value || '';

  // Balances and unfiltered ledger: admin-only.
  if (balances === 'true') {
    if (!admin) return NextResponse.json([], { status: 200 });
    return NextResponse.json(await getAllKegBalances());
  }

  if (customerId) {
    // Admin can query anyone; portal user only themselves.
    if (!admin && portalCustomerId !== customerId) {
      return NextResponse.json([], { status: 200 });
    }
    return NextResponse.json(await getKegLedgerByCustomer(customerId));
  }

  if (!admin) return NextResponse.json([], { status: 200 });
  return NextResponse.json(await getKegLedger());
}

export async function POST(request: NextRequest) {
  const body = await request.json();

  // Authz: admin can log any customer's keg movement; portal user can
  // only log their own (e.g. request a return). Prevents a logged-in
  // customer from crediting arbitrary accounts.
  const admin = isAdminRequest(request);
  const portalCustomerId = request.cookies.get('portal_session')?.value || '';
  if (!admin && portalCustomerId !== body.customerId) {
    return NextResponse.json({ error: 'Not authorized for this customer' }, { status: 403 });
  }

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
  if (typeof body.size !== 'string' || !body.size.trim()) {
    return NextResponse.json(
      { error: 'size is required.' },
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
  // fall back to the legacy KEG_DEPOSITS table for the three original sizes.
  // Custom sizes without an explicit deposit fall through to 0 — admin can
  // adjust manually if deposit is applicable.
  const depositAmount: number =
    typeof body.depositAmount === 'number' && Number.isFinite(body.depositAmount)
      ? body.depositAmount
      : KEG_DEPOSITS[body.size as KegSize] ?? 0;

  // Stamp a default source on the notes field so the ledger reads as an audit
  // trail: order-delivery auto-posts say "Order xxx delivery" (written by
  // orders route), portal returns say "Portal return request", and any other
  // direct POST gets a generic "Manual adjustment" tag. Customer-supplied
  // notes win over the default.
  const userNote: string = typeof body.notes === 'string' ? body.notes.trim() : '';
  const defaultSource =
    body.type === 'return' ? 'Portal return request' : 'Manual adjustment';
  const notes = userNote ? `${defaultSource}: ${userNote}` : defaultSource;

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
    notes,
  };
  await addKegLedgerEntry(entry);
  return NextResponse.json(entry, { status: 201 });
}
