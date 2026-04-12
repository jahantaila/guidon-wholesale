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

/** Server-side Supabase client using the anon key */
export function createServerClient() {
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/** Admin Supabase client using service role key (bypasses RLS) */
export function createAdminClient() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
