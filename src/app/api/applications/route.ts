import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { generateId } from '@/lib/utils';
import type { WholesaleApplication } from '@/lib/types';

const filePath = path.join(process.cwd(), 'data', 'applications.json');

function getApplications(): WholesaleApplication[] {
  const data = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(data) as WholesaleApplication[];
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

  const applications = getApplications();
  applications.push(application);
  fs.writeFileSync(filePath, JSON.stringify(applications, null, 2), 'utf-8');

  return NextResponse.json(application, { status: 201 });
}
