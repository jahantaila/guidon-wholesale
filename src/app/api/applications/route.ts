import { NextRequest, NextResponse } from 'next/server';
import { getApplications, createApplication, updateApplication } from '@/lib/data';
import { generateId } from '@/lib/utils';
import type { WholesaleApplication } from '@/lib/types';
import { notifyApplicationSubmitted, notifyApplicationDecision } from '@/lib/email';

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

  // Fire-and-forget email: thank the applicant + notify the brewery.
  (async () => {
    try {
      await notifyApplicationSubmitted({
        applicationId: application.id,
        applicantEmail: application.email,
        applicantName: application.contactName,
        businessName: application.businessName,
        phone: application.phone,
        businessType: application.businessType,
        expectedMonthlyVolume: application.expectedMonthlyVolume,
      });
    } catch (err) {
      console.error('[email] notifyApplicationSubmitted failed (non-fatal):', err);
    }
  })();

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

  // Notify the applicant of the decision. We don't have the full application
  // on `updateApplication`, so re-fetch for the email payload.
  if (body.status === 'approved' || body.status === 'rejected') {
    (async () => {
      try {
        const apps = await getApplications();
        const app = apps.find((a) => a.id === body.id);
        if (app) {
          await notifyApplicationDecision({
            applicationId: app.id,
            applicantEmail: app.email,
            applicantName: app.contactName,
            businessName: app.businessName,
            decision: body.status,
            portalUrl: 'https://guidon-wholesale.vercel.app/portal',
          });
        }
      } catch (err) {
        console.error('[email] notifyApplicationDecision failed (non-fatal):', err);
      }
    })();
  }

  return NextResponse.json({ success: true });
}
