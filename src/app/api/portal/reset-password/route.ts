import { NextRequest, NextResponse } from 'next/server';
import { getCustomers } from '@/lib/data';
import { isSupabaseConfigured, createAdminClient } from '@/lib/supabase';
import { send } from '@/lib/email';

/**
 * POST /api/portal/reset-password
 * Body: { email: string }
 *
 * Triggers a password reset. Uses Supabase's generateLink API when
 * Supabase is configured — this sends the magic-link email via Supabase's
 * own mailer. Always returns 200 even when the email is unknown, to avoid
 * leaking account existence (standard practice for password resets).
 *
 * For the file-based fallback (Supabase not configured), we email the
 * customer's stored password — a dev-only shortcut. Production deployments
 * must run with Supabase configured.
 */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const email: string | undefined = body?.email?.trim().toLowerCase();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'A valid email is required.' }, { status: 400 });
  }

  // Always respond 200 after this point; don't leak existence.
  try {
    const customers = await getCustomers();
    const customer = customers.find((c) => c.email.toLowerCase() === email);

    if (!customer) {
      // Unknown email — respond 200 silently.
      return NextResponse.json({ ok: true });
    }

    if (isSupabaseConfigured()) {
      const sb = createAdminClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const adminApi = (sb.auth as any).admin;
      if (adminApi?.generateLink) {
        const res = await adminApi.generateLink({
          type: 'recovery',
          email,
        });
        if (res?.data?.properties?.action_link) {
          await send({
            to: email,
            subject: 'Guidon Brewing — Reset your portal password',
            html: `<!doctype html><html><body style="margin:0;padding:24px 16px;background:#F5EFDF;font-family:Georgia,serif;color:#2A2416;">
<table cellpadding="0" cellspacing="0" width="100%" style="max-width:560px;margin:0 auto;border:1px solid #D8CDA8;background:#FBF7EA;">
  <tr><td style="padding:24px 28px;">
    <div style="font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#9E7A3B;font-weight:600;margin-bottom:6px;">Guidon Brewing Co.</div>
    <h1 style="margin:0 0 12px;font-size:24px;font-weight:500;">Reset your password</h1>
    <p style="margin:12px 0;">Click below to set a new password for your wholesale portal account.</p>
    <p style="margin:16px 0;"><a href="${res.data.properties.action_link}" style="display:inline-block;background:#9E7A3B;color:#F5EFDF;padding:10px 18px;text-decoration:none;font-weight:600;">Reset password &rarr;</a></p>
    <p style="margin:16px 0;font-size:13px;color:#6B5F48;">This link expires in 24 hours. If you didn't request a reset, ignore this email.</p>
  </td></tr>
</table></body></html>`,
          });
        }
      }
    } else {
      // File-based fallback: email the stored password. Dev only.
      await send({
        to: email,
        subject: 'Guidon Brewing — Your portal password',
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
