import { NextRequest, NextResponse } from 'next/server';
import { getApplications, createApplication, updateApplication } from '@/lib/data';
import { generateId } from '@/lib/utils';
import type { WholesaleApplication } from '@/lib/types';

export async function GET() {
  const applications = await getApplications();
  return NextResponse.json(applications);
}

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

export async function PUT(request: NextRequest) {
  const body = await request.json();

  if (!body.id || !body.status) {
    return NextResponse.json({ error: 'ID and status are required.' }, { status: 400 });
  }

  if (!['pending', 'approved', 'rejected'].includes(body.status)) {
    return NextResponse.json({ error: 'Invalid status.' }, { status: 400 });
  }

  const success = await updateApplication(body.id, body.status);
  if (!success) {
    return NextResponse.json({ error: 'Application not found.' }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
