import { NextRequest, NextResponse } from 'next/server';
import { getApplications, createApplication, updateApplication, createCustomer, getCustomers } from '@/lib/data';
import { generateId } from '@/lib/utils';
import type { WholesaleApplication, Customer } from '@/lib/types';
import { notifyApplicationSubmitted, notifyApplicationDecision, portalUrl } from '@/lib/email';
import { isSupabaseConfigured, createAdminClient } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  // Admin-only: applications contain applicant PII and business context.
  const session = request.cookies.get('admin_session');
  if (session?.value !== 'authenticated') {
    return NextResponse.json([], { status: 200 });
  }
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

  // Await the email so Vercel's serverless runtime doesn't cut it off when
  // the function returns. Fire-and-forget promises after a response get
  // killed; awaiting here adds a ~1s latency but actually delivers the mail.
  // notifyApplicationSubmitted itself catches Resend errors internally, so
  // it never throws and blocking here is safe.
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

  // Resolve the application record before mutating, so we can pass the
  // full payload to the approval flow.
  const allApps = await getApplications();
  const app = allApps.find((a) => a.id === body.id);
  if (!app) {
    return NextResponse.json({ error: 'Application not found.' }, { status: 404 });
  }

  const success = await updateApplication(body.id, body.status);
  if (!success) {
    return NextResponse.json({ error: 'Application not found.' }, { status: 404 });
  }

  let tempPassword: string | undefined;

  // APPROVAL: upgrade the applicant into a real wholesale customer.
  // 1. Check whether a customer with this email already exists (idempotent).
  // 2. If not, create a file/DB customer row and generate a temp password.
  // 3. If Supabase is configured, provision a Supabase Auth user with the
  //    same temp password so they can log into /portal immediately.
  // All failures are logged but don't block the admin's approve action.
  if (body.status === 'approved') {
    try {
      const existingCustomers = await getCustomers();
      const alreadyCustomer = existingCustomers.find(
        (c) => c.email.toLowerCase() === app.email.toLowerCase(),
      );

      if (!alreadyCustomer) {
        tempPassword = generateTempPassword();
        const newCustomer: Customer = {
          id: generateId('cust'),
          businessName: app.businessName,
          contactName: app.contactName,
          email: app.email.toLowerCase().trim(),
          phone: app.phone,
          address: app.address,
          password: tempPassword, // only used by file-based fallback auth
          createdAt: new Date().toISOString(),
        };
        await createCustomer(newCustomer);

        // Provision a Supabase Auth user so the portal login (which uses
        // sb.auth.signInWithPassword) works for this email.
        if (isSupabaseConfigured()) {
          try {
            const sb = createAdminClient();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const adminApi = (sb.auth as any).admin;
            if (adminApi?.createUser) {
              const res = await adminApi.createUser({
                email: newCustomer.email,
                password: tempPassword,
                email_confirm: true,
                user_metadata: {
                  business_name: newCustomer.businessName,
                  contact_name: newCustomer.contactName,
                },
              });
              if (res?.error) {
                // If the user already exists in Supabase Auth, treat as success.
                const alreadyExists = /already|exists|registered/i.test(res.error.message);
                if (!alreadyExists) {
                  console.error('[approval] Supabase auth user creation failed:', res.error.message);
                }
              }
            }
          } catch (err) {
            console.error('[approval] Supabase auth provisioning failed (non-fatal):', err);
          }
        }
      }
    } catch (err) {
      console.error('[approval] customer creation failed (non-fatal):', err);
    }
  }

  // Notify the applicant of the decision. Await so Vercel doesn't kill the
  // promise after response. notifyApplicationDecision catches internally.
  if (body.status === 'approved' || body.status === 'rejected') {
    try {
      await notifyApplicationDecision({
        applicationId: app.id,
        applicantEmail: app.email,
        applicantName: app.contactName,
        businessName: app.businessName,
        decision: body.status,
        portalUrl: portalUrl(),
        tempPassword,
      });
    } catch (err) {
      console.error('[email] notifyApplicationDecision failed (non-fatal):', err);
    }
  }

  return NextResponse.json({ success: true, tempPassword });
}

/**
 * Generate a human-typable temp password: 3 short words + 2 digits.
 * Readable over the phone in case the email ends up in spam and the
 * admin needs to relay it. Low bits of entropy but fine as a one-time
 * reset credential; the portal prompts for a password change on first
 * login (future work) and these are always replaceable via the reset
 * flow.
 */
function generateTempPassword(): string {
  const words = [
    'amber', 'brass', 'hops', 'malt', 'pine', 'cask', 'reed', 'barn',
    'field', 'stone', 'ridge', 'flag', 'oak', 'drift', 'clove', 'wheat',
  ];
  const pick = () => words[Math.floor(Math.random() * words.length)];
  const digits = Math.floor(10 + Math.random() * 90);
  return `${pick()}-${pick()}-${pick()}-${digits}`;
}
