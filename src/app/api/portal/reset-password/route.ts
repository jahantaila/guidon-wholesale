import { NextRequest, NextResponse } from 'next/server';
import { getCustomers, updateCustomer } from '@/lib/data';
import { isSupabaseConfigured, createAdminClient } from '@/lib/supabase';
import { send } from '@/lib/email';
import { syncSupabaseAuthPassword } from '@/lib/auth-provision';

/**
 * POST /api/portal/reset-password
 * Body: { email: string }
 *
 * Triggers a password reset. Two-tier strategy:
 *   1. Preferred: ask Supabase to generate a recovery link and email it to
 *      the customer via our branded template. They click → land on /portal
 *      with #access_token=...&type=recovery → set a new password inline.
 *   2. Fallback (when generateLink returns no link, the auth user doesn't
 *      exist yet, or anything else goes wrong on step 1): issue the fixed
 *      temp password "guidon", sync it into Supabase Auth, flip the
 *      must_change_password flag on the customer row, and email the temp
 *      directly. The portal force-change-password modal will catch them
 *      on next login. This branch is what stopped the prior silent-fail
 *      pattern where customers got nothing in their inbox.
 *
 * Always returns 200 even when the email is unknown, to avoid leaking
 * account existence (standard practice for password resets). Looks up
 * archived customers too — a forgotten password on an archived account
 * should still produce a clear "no account" outcome for the customer's
 * inbox (they get nothing), not a 500.
 */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const email: string | undefined = body?.email?.trim().toLowerCase();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'A valid email is required.' }, { status: 400 });
  }

  // Always respond 200 after this point; don't leak existence.
  try {
    // Include archived rows so we don't silently fail when the email matches
    // an archived account; the actual decision to do nothing for archived
    // is made below.
    const customers = await getCustomers(true);
    const customer = customers.find((c) => c.email.toLowerCase() === email);

    if (!customer || customer.archivedAt) {
      // Unknown / archived email — respond 200 silently.
      return NextResponse.json({ ok: true });
    }

    if (isSupabaseConfigured()) {
      const sb = createAdminClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const adminApi = (sb.auth as any).admin;
      // Compute the redirect target so Supabase's recovery link lands on
      // our /portal page (where the recovery handler reads the access_token
      // from the URL hash).
      const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '')
        || new URL(request.url).origin;
      const redirectTo = `${appUrl}/portal`;

      let recoveryLink: string | undefined;
      if (adminApi?.generateLink) {
        try {
          const res = await adminApi.generateLink({
            type: 'recovery',
            email,
            options: { redirectTo },
          });
          recoveryLink = res?.data?.properties?.action_link;
          if (res?.error) {
            console.error('[reset-password] generateLink error:', res.error.message);
          }
        } catch (err) {
          console.error('[reset-password] generateLink threw:', err);
        }
      }

      if (recoveryLink) {
        await send({
          to: email,
          subject: 'Guidon Brewing Co. — Reset your portal password',
          html: `<!doctype html><html><body style="margin:0;padding:24px 16px;background:#F5EFDF;font-family:Georgia,serif;color:#2A2416;">
<table cellpadding="0" cellspacing="0" width="100%" style="max-width:560px;margin:0 auto;border:1px solid #D8CDA8;background:#FBF7EA;">
  <tr><td style="padding:24px 28px;">
    <div style="font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#9E7A3B;font-weight:600;margin-bottom:6px;">Guidon Brewing Co.</div>
    <h1 style="margin:0 0 12px;font-size:24px;font-weight:500;">Reset your password</h1>
    <p style="margin:12px 0;">Click below to set a new password for your wholesale portal account.</p>
    <p style="margin:16px 0;"><a href="${recoveryLink}" style="display:inline-block;background:#9E7A3B;color:#F5EFDF;padding:10px 18px;text-decoration:none;font-weight:600;">Reset password &rarr;</a></p>
    <p style="margin:16px 0;font-size:13px;color:#6B5F48;">This link expires in 24 hours. If you didn't request a reset, ignore this email.</p>
  </td></tr>
</table></body></html>`,
        });
      } else {
        // Fallback: no recovery link (auth user missing, generateLink failed,
        // etc.). Issue the fixed temp password, sync it into auth, flip the
        // must-change flag, and email the temp directly. This makes the
        // forgot-password flow self-healing — even a customer whose auth
        // user got dropped at some point can recover via this path.
        const tempPassword = 'guidon';
        try {
          await syncSupabaseAuthPassword({
            email,
            password: tempPassword,
            businessName: customer.businessName,
            contactName: customer.contactName,
          });
          await updateCustomer(customer.id, {
            mustChangePassword: true,
            password: tempPassword,
          });
          await send({
            to: email,
            subject: 'Guidon Brewing Co. — Your temporary password',
            html: `<!doctype html><html><body style="margin:0;padding:24px 16px;background:#F5EFDF;font-family:Georgia,serif;color:#2A2416;">
<table cellpadding="0" cellspacing="0" width="100%" style="max-width:560px;margin:0 auto;border:1px solid #D8CDA8;background:#FBF7EA;">
  <tr><td style="padding:24px 28px;">
    <div style="font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#9E7A3B;font-weight:600;margin-bottom:6px;">Guidon Brewing Co.</div>
    <h1 style="margin:0 0 12px;font-size:24px;font-weight:500;">Your temporary password</h1>
    <p style="margin:12px 0;">Sign in at the wholesale portal with your email and this temporary password:</p>
    <p style="margin:16px 0;font-size:18px;"><code style="background:#EEE5CE;padding:6px 12px;font-weight:bold;">${tempPassword}</code></p>
    <p style="margin:16px 0;font-size:13px;color:#6B5F48;">You'll be asked to set a new password on first sign-in.</p>
  </td></tr>
</table></body></html>`,
          });
        } catch (fallbackErr) {
          console.error('[reset-password] fallback temp-password path failed:', fallbackErr);
        }
      }
    } else {
      // File-based fallback: email the stored password. Dev only.
      await send({
        to: email,
        subject: 'Guidon Brewing Co. — Your portal password',
        html: `<!doctype html><html><body style="background:#F5EFDF;font-family:Georgia,serif;padding:24px 16px;">
<p>Your portal password is: <code style="background:#EEE5CE;padding:2px 6px;">${customer.password ?? '(not set)'}</code></p>
<p>This reset flow is in dev/file-fallback mode. In production, Supabase will send a proper reset link.</p>
</body></html>`,
      });
    }
  } catch (err) {
    // Log but still respond 200 to avoid leaking errors.
    console.error('[reset-password] error (non-fatal):', err);
  }

  return NextResponse.json({ ok: true });
}
