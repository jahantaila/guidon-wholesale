import { createAdminClient } from '@/lib/supabase';

/**
 * Provision-or-update a Supabase Auth user so the customer can sign in
 * with the given password. Used by both the application-approval flow
 * and the password-reset fallback. Idempotent across all auth states:
 * missing user, existing user with stale password, existing user with
 * email-not-confirmed.
 *
 * Throws on unrecoverable errors so the caller can surface them. Returns
 * nothing on success.
 */
export async function syncSupabaseAuthPassword(args: {
  email: string;
  password: string;
  businessName?: string;
  contactName?: string;
}): Promise<void> {
  const sb = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adminApi = (sb.auth as any).admin;
  if (!adminApi?.createUser) {
    throw new Error('Supabase admin API unavailable.');
  }

  const createRes = await adminApi.createUser({
    email: args.email,
    password: args.password,
    email_confirm: true,
    user_metadata: {
      business_name: args.businessName,
      contact_name: args.contactName,
    },
  });

  if (!createRes?.error) return; // brand-new user, done.

  const alreadyExists = /already|exists|registered/i.test(createRes.error.message);
  if (!alreadyExists) {
    throw new Error(`Supabase auth user creation failed: ${createRes.error.message}`);
  }

  // User exists already — sync the password in. listUsers paginates at 50 by
  // default, so request a wide page so we can find the email on instances
  // with more than 50 auth users. perPage caps at 1000.
  if (!adminApi.listUsers || !adminApi.updateUserById) {
    throw new Error('Supabase admin API missing listUsers/updateUserById.');
  }
  const listRes = await adminApi.listUsers({ page: 1, perPage: 1000 });
  const authUser = listRes?.data?.users?.find(
    (u: { email?: string }) => u.email?.toLowerCase() === args.email.toLowerCase(),
  );
  if (!authUser) {
    throw new Error(
      'Supabase reported the user exists but listUsers could not locate it. Auth state is inconsistent.',
    );
  }
  const updateRes = await adminApi.updateUserById(authUser.id, {
    password: args.password,
    email_confirm: true,
  });
  if (updateRes?.error) {
    throw new Error(`Supabase auth password sync failed: ${updateRes.error.message}`);
  }
}
