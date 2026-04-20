import { NextResponse } from 'next/server';
import { isSupabaseConfigured, createAdminClient } from '@/lib/supabase';

/**
 * GET /api/health
 *
 * Public. Returns a snapshot of core service health so you can point a
 * monitoring hook (UptimeRobot, BetterUptime, Vercel Observability) at a
 * single URL. Never throws; returns { ok: boolean, checks: {...} }.
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  const checks: Record<string, { ok: boolean; detail?: string }> = {};

  // Supabase: lightweight count query on products. If this works, reads
  // work, service role key is valid, and the schema is migrated.
  if (isSupabaseConfigured()) {
    try {
      const sb = createAdminClient();
      const { error } = await sb.from('products').select('id', { count: 'exact', head: true });
      checks.supabase = error ? { ok: false, detail: error.message } : { ok: true };
    } catch (err) {
      checks.supabase = { ok: false, detail: err instanceof Error ? err.message : String(err) };
    }
  } else {
    checks.supabase = { ok: false, detail: 'Not configured (file-based fallback)' };
  }

  // Resend: just check that the key is present and has the expected prefix.
  // We don't do a real send here to avoid wasting the Resend quota on probes.
  const resendKey = process.env.RESEND_API_KEY;
  checks.resend = resendKey
    ? { ok: resendKey.startsWith('re_'), detail: resendKey.startsWith('re_') ? undefined : 'Key format unexpected' }
    : { ok: false, detail: 'RESEND_API_KEY not set' };

  // From-address clean
  const from = process.env.EMAIL_FROM || '';
  const fromOK = from.includes('@') && !from.startsWith('"');
  checks.email_from = fromOK
    ? { ok: true }
    : { ok: false, detail: from.startsWith('"') ? 'EMAIL_FROM has literal quotes (Resend will reject)' : 'EMAIL_FROM missing or invalid' };

  const allOk = Object.values(checks).every((c) => c.ok);
  return NextResponse.json(
    { ok: allOk, ts: new Date().toISOString(), checks },
    { status: allOk ? 200 : 503 },
  );
}
