import { NextRequest, NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/auth-check';
import { getApplications, createApplication, updateApplication, createCustomer, updateCustomer, getCustomers } from '@/lib/data';
import { generateId, isValidUsStateCode } from '@/lib/utils';
import type { WholesaleApplication, Customer } from '@/lib/types';
import { notifyApplicationSubmitted, notifyApplicationDecision, portalUrl } from '@/lib/email';
import { isSupabaseConfigured } from '@/lib/supabase';
import { syncSupabaseAuthPassword } from '@/lib/auth-provision';

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
  let approvalError: string | undefined;

  // APPROVAL: upgrade the applicant into a real wholesale customer.
  // The flow must be robust across these pre-existing states for the email:
  //   (a) Brand new — no customer row, no auth user
  //   (b) Active customer row already exists (idempotent re-approval)
  //   (c) Archived customer row exists (prior soft-delete) — unarchive it
  //   (d) Auth user exists but no customer row (drift from a partial prior run)
  //   (e) Customer row exists but no auth user (drift in the other direction)
  // The previous implementation only handled (a) and (b), so any prior
  // archive/re-apply cycle or partial failure would silently drop the new
  // customer and leave the brewery with a "they got the email but it doesn't
  // work" support ticket. Now we always converge to: customer row present,
  // not-archived, with auth user provisioned and password synced to
  // TEMP_PASSWORD + must_change_password=true.
  //
  // Temp password is fixed at "guidon" per brewery preference (2026-04-29).
  // The mustChangePassword flag forces an immediate change on first login,
  // so "guidon" is never the customer's actual long-term password.
  if (body.status === 'approved') {
    try {
      tempPassword = TEMP_PASSWORD;
      const normalizedEmail = app.email.toLowerCase().trim();

      // (b)+(c): check the FULL customer table including archived rows.
      // Default getCustomers() filters archived, which was the original bug:
      // an archived row blocked the unique-email insert silently.
      const existingCustomers = await getCustomers(true);
      const alreadyCustomer = existingCustomers.find(
        (c) => c.email.toLowerCase() === normalizedEmail,
      );

      if (alreadyCustomer) {
        // Re-approving an existing customer. Bring the row back to the
        // approved baseline: not archived, mustChangePassword=true so they
        // get prompted to set a real password on next login. Refresh
        // application-sourced fields (ABC permit, payment method) in case
        // the applicant updated them on a re-submission.
        await updateCustomer(alreadyCustomer.id, {
          archivedAt: null,
          mustChangePassword: true,
          password: tempPassword,
          abcPermitNumber: app.abcPermitNumber || alreadyCustomer.abcPermitNumber || '',
          preferredPaymentMethod:
            app.preferredPaymentMethod || alreadyCustomer.preferredPaymentMethod || 'no_preference',
        });
      } else {
        // (a): brand new. Insert the customer row.
        const newCustomer: Customer = {
          id: generateId('cust'),
          businessName: app.businessName,
          contactName: app.contactName,
          email: normalizedEmail,
          phone: app.phone,
          streetAddress: app.streetAddress,
          city: app.city,
          state: app.state,
          zip: app.zip,
          abcPermitNumber: app.abcPermitNumber || '',
          preferredPaymentMethod: app.preferredPaymentMethod || 'no_preference',
          password: tempPassword, // only used by file-based fallback auth
          mustChangePassword: true,
          createdAt: new Date().toISOString(),
        };
        await createCustomer(newCustomer);
      }

      // Always sync Supabase Auth to the temp password — covers (d) and (e)
      // and is also the only path that makes login actually work. Previously
      // this was skipped entirely on the "customer already exists" branch,
      // which meant a re-approval kept the old (forgotten) auth password
      // even though the email said "guidon."
      if (isSupabaseConfigured()) {
        await syncSupabaseAuthPassword({
          email: normalizedEmail,
          password: tempPassword,
          businessName: app.businessName,
          contactName: app.contactName,
        });
      }
    } catch (err) {
      console.error('[approval] customer creation failed:', err);
      // Surface the error in the response so the admin UI can show it
      // instead of silently claiming success while nothing happened.
      approvalError =
        err instanceof Error
          ? err.message
          : 'Customer creation failed. Check server logs.';
      tempPassword = undefined; // don't include in the decision email
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

  return NextResponse.json({ success: true, tempPassword, approvalError });
}

/**
 * Fixed temporary password issued to every newly-approved customer. The
 * mustChangePassword flag on the customer record forces an immediate
 * change on first login — this value is only ever used once.
 *
 * Switched from auto-generated word lists (e.g. "oak-drift-flag-33") to
 * a fixed string on 2026-04-29 because the generated passwords were
 * causing ongoing customer support issues: copy/paste whitespace,
 * em-dash vs hyphen confusion, etc. A single word the admin can verbally
 * relay is more reliable, and the must-change flow keeps it one-use.
 */
const TEMP_PASSWORD = 'guidon';
