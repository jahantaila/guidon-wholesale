import { NextRequest, NextResponse } from 'next/server';
import { getCustomers, createCustomer, updateCustomer, deleteCustomer } from '@/lib/data';
import { generateId } from '@/lib/utils';
import type { Customer } from '@/lib/types';

export async function GET() {
  const customers = await getCustomers();
  // Strip passwords from response
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const safe = customers.map(({ password, ...rest }) => rest);
  return NextResponse.json(safe);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const customer: Customer = {
    id: generateId('cust'),
    businessName: body.businessName,
    contactName: body.contactName,
    email: body.email,
    phone: body.phone || '',
    address: body.address || '',
    password: body.password || '',
    createdAt: new Date().toISOString(),
  };
  await createCustomer(customer);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { password, ...safe } = customer;
  return NextResponse.json(safe, { status: 201 });
}

export async function PUT(request: NextRequest) {
  const body = await request.json();
  const { id, ...updates } = body;
  const customer = await updateCustomer(id, updates);
  if (!customer) {
    return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
  }
  return NextResponse.json(customer);
}

export async function DELETE(request: NextRequest) {
  const body = await request.json();
  const id = body.id;
  if (!id) {
    return NextResponse.json({ error: 'ID required' }, { status: 400 });
  }
  const deleted = await deleteCustomer(id);
  if (!deleted) {
    return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
