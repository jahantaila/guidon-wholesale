import { NextRequest, NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/auth-check';
import { getApplications, createApplication, updateApplication, createCustomer, getCustomers } from '@/lib/data';
import { generateId, isValidUsStateCode } from '@/lib/utils';
import type { WholesaleApplication, Customer } from '@/lib/types';
import { notifyApplicationSubmitted, notifyApplicationDecision, portalUrl } from '@/lib/email';
import { isSupabaseConfigured, createAdminClient } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  // Admin-only: applications contain applicant PII and business context.
  // isAdminRequest accepts cookie OR Bearer header so iframe-embedded
  // admins (where 3rd-party cookies are blocked) still see their data.
  if (!isAdminRequest(request)) {
    return NextResponse.json([], { status: 200 });
  }
  const applications = await getApplications();
  return NextResponse.json(applications);
}

export async function POST(request: NextRequest) {
  const body = await request.json();

  // Required-field gate. Mirrors the client-side check on /apply so a
  // crafted request that bypasses the form (or an old cached form HTML)
  // can't sneak in incomplete applications. Order matches the form's
  // field order so the message reads naturally.
  const trim = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const required: Record<string, string> = {
    'Business Name': trim(body.businessName),
    'Contact Name': trim(body.contactName),
    'Email': trim(body.email),
    'Phone': trim(body.phone),
    'ABC Permit Number': trim(body.abcPermitNumber),
    'Street Address': trim(body.streetAddress),
    'City': trim(body.city),
    'State': trim(body.state),
    'Zip': trim(body.zip),
  };
  const missing = Object.entries(required).filter(([, v]) => !v).map(([k]) => k);
  if (missing.length > 0) {
    return NextResponse.json(
      { error: `${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} required.` },
      { status: 400 },
    );
  }
  // State must be a valid 2-letter US postal code so downstream consumers
  // (delivery routing, invoice billing) can rely on a normalized value.
  const state = required['State'].toUpperCase();
  if (!isValidUsStateCode(state)) {
    return NextResponse.json({ error: 'State must be a valid 2-letter US postal code.' }, { status: 400 });
  }

  const allowedPayment = ['check', 'fintech', 'no_preference'] as const;
  const preferredPaymentMethod =
    allowedPayment.includes(body.preferredPaymentMethod)
      ? (body.preferredPaymentMethod as (typeof allowedPayment)[number])
      : 'no_preference';

  const application: WholesaleApplication = {
    id: generateId('app'),
    businessName: required['Business Name'],
    contactName: required['Contact Name'],
    email: required['Email'],
    phone: required['Phone'],
    streetAddress: required['Street Address'],
    city: required['City'],
    state,
    zip: required['Zip'],
    abcPermitNumber: required['ABC Permit Number'],
    businessType: body.businessType || '',
    expectedMonthlyVolume: body.expectedMonthlyVolume || '',
    preferredPaymentMethod,
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
      streetAddress: application.streetAddress,
      city: application.city,
      state: application.state,
      zip: application.zip,
      abcPermitNumber: application.abcPermitNumber,
      businessType: application.businessType,
      expectedMonthlyVolume: application.expectedMonthlyVolume,
      preferredPaymentMethod: application.preferredPaymentMethod,
    });
  } catch (err) {
    console.error('[email] notifyApplicationSubmitted failed (non-fatal):', err);
  }

  return NextResponse.json(application, { status: 201 });
}

export async function PUT(request: NextRequest) {
  const admin = isAdminRequest(request);
  if (!admin) {
    return NextResponse.json({ error: 'Admin session required' }, { status: 403 });
  }
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
          streetAddress: app.streetAddress,
          city: app.city,
          state: app.state,
          zip: app.zip,
          password: tempPassword, // only used by file-based fallback auth
          // Force the customer to change their password on first login —
          // the auto-generated temp is emailed in plaintext and shouldn't
          // stay in use.
          mustChangePassword: true,
          createdAt: new Date().toISOString(),
        };
        await createCustomer(newCustomer);

        // Provision a Supabase Auth user so the portal login (which uses
        // sb.auth.signInWithPassword) works for this email. If an auth user
        // already exists (orphaned from a prior approval, a test run, or a
        // manual admin action), we UPDATE its password to the freshly
        // generated temp so the email we just sent actually matches what
        // the auth table stores. Without this update, the old symptom was
        // "customer gets the email but can't log in."
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
                const alreadyExists = /already|exists|registered/i.test(res.error.message);
                if (alreadyExists && adminApi.listUsers && adminApi.updateUserById) {
                  // Auth user exists with an unknown password. Sync the new
                  // temp password in so the email-delivered credential works.
                  const listRes = await adminApi.listUsers();
                  const authUser = listRes?.data?.users?.find(
                    (u: { email?: string }) =>
                      u.email?.toLowerCase() === newCustomer.email.toLowerCase(),
                  );
                  if (authUser) {
                    const updateRes = await adminApi.updateUserById(authUser.id, {
                      password: tempPassword,
                      email_confirm: true,
                    });
                    if (updateRes?.error) {
                      console.error(
                        '[approval] Supabase auth password sync failed:',
                        updateRes.error.message,
                      );
                    }
                  } else {
                    console.error(
                      '[approval] createUser said "exists" but listUsers could not find the email; auth state is inconsistent.',
                    );
                  }
                } else if (!alreadyExists) {
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
