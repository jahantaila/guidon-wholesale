import { NextRequest, NextResponse } from 'next/server';
import { createApplication } from '@/lib/data';
import { generateId } from '@/lib/utils';
import type { WholesaleApplication } from '@/lib/types';

export async function POST(request: NextRequest) {
  const body = await request.json();

  if (!body.businessName || !body.contactName || !body.email) {
    return NextResponse.json(
      { error: 'Business name, contact name, and email are required.' },
      { status: 400 }
    );
  }

  const application: WholesaleApplication = {
    id: generateId('app'),
    businessName: body.businessName,
    contactName: body.contactName,
    email: body.email,
    phone: body.phone || '',
    address: body.address || '',
    businessType: body.businessType || '',
    expectedMonthlyVolume: body.expectedMonthlyVolume || '',
    createdAt: new Date().toISOString(),
  };

  await createApplication(application);
  return NextResponse.json(application, { status: 201 });
}
