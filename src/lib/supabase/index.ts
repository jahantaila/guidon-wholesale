import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

/** Returns true when all Supabase credentials are configured (URL, anon key, and service role key). */
export function isSupabaseConfigured(): boolean {
  return (
    supabaseUrl.length > 0 &&
    !supabaseUrl.includes('placeholder') &&
    supabaseUrl !== 'https://placeholder.supabase.co' &&
    supabaseAnonKey !== 'placeholder' &&
    supabaseAnonKey.length > 0 &&
    supabaseServiceKey !== 'placeholder' &&
    supabaseServiceKey.length > 0
  );
}

/** Browser / client-side Supabase client */
export function createBrowserClient() {
  return createClient(supabaseUrl, supabaseAnonKey);
}

// Next.js 14 App Router auto-caches GET fetches made inside route handlers.
// The Supabase JS SDK uses fetch() for SELECTs, which means a read right
// after a write returns the stale cached response instead of the just-
// inserted row. Visible symptom: admin adds a notification recipient,
// PUT returns 200, but the response body (and subsequent GETs) still
// show the old list — because setSetting wrote the DB correctly but the
// follow-up getSetting hit the Next.js fetch cache.
//
// Fix: pass a custom fetch that tags every request as no-store so Next.js
// never caches it. Supabase's internal calls are short-lived and ID-scoped
// — caching them isn't a win, and the staleness breaks correctness.
const noCacheFetch: typeof fetch = (input, init) =>
  fetch(input, { ...init, cache: 'no-store' });

/** Server-side Supabase client using the anon key */
export function createServerClient() {
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: { fetch: noCacheFetch },
  });
}

/** Admin Supabase client using service role key (bypasses RLS) */
export function createAdminClient() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: { fetch: noCacheFetch },
  });
}
