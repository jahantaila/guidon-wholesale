/**
 * Signed session tokens for admin + portal auth.
 *
 * WHY THIS EXISTS
 * ---------------
 * Auth used to be a hardcoded marker string: `admin_session=authenticated`,
 * and after the iframe fix (6f215f9) also `Authorization: Bearer authenticated`.
 * As a cookie that was weak; as a header it was nothing at all, because a
 * header is trivially attacker-settable from anywhere:
 *
 *     curl -H "Authorization: Bearer authenticated" https://site/api/customers
 *
 * That returned every customer's name, email, phone, address and ABC permit
 * number to an anonymous caller. Same shape for portal auth, which trusted a
 * bare `portal_session=<customerId>` cookie — so `Bearer <customerId>` would
 * have been instant impersonation had we mirrored the admin pattern.
 *
 * Tokens are now HMAC-SHA256 signed and carry an expiry. A token the server
 * did not mint does not verify, and one that has aged out stops working.
 *
 * WHY WEB CRYPTO INSTEAD OF node:crypto
 * -------------------------------------
 * `middleware.ts` runs on the Edge runtime, which has no `node:crypto`.
 * `crypto.subtle` exists in both Edge and Node 18+, so the same code path
 * guards the middleware and the route handlers. The cost is that verification
 * is async — hence `isAdminRequest`/`authContext` being async too.
 */

export type SessionRole = 'admin' | 'portal';

export interface SessionPayload {
  role: SessionRole;
  /** Subject. Customer id for portal sessions, 'admin' for admin sessions. */
  sub: string;
  /** Expiry, epoch seconds. */
  exp: number;
}

export const ADMIN_SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days
export const PORTAL_SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

const encoder = new TextEncoder();

function b64urlFromBytes(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function bytesFromB64url(value: string): Uint8Array | null {
  try {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

/**
 * Secret material for the signing key.
 *
 * Prefers an explicit SESSION_SECRET. Falls back to the Supabase service-role
 * key, which is server-only, high-entropy, and already set in every
 * environment — so this fix ships without anyone having to add a new Vercel
 * env var first. The key is *derived* from that material rather than used
 * directly, so a leaked session token can never be replayed as a database
 * credential.
 *
 * Returns null when nothing usable is configured. Callers fail closed.
 */
function secretMaterial(): string | null {
  const explicit = process.env.SESSION_SECRET;
  if (explicit && explicit.length >= 16) return explicit;

  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (serviceRole && serviceRole.length >= 16) return serviceRole;

  // Dev/test only. Never in production — an attacker who knows the constant
  // could mint their own admin token, which is the bug we're fixing.
  if (process.env.NODE_ENV !== 'production') return 'guidon-dev-session-secret';

  return null;
}

let cachedKey: Promise<CryptoKey> | null = null;
let cachedFor: string | null = null;

function signingKey(): Promise<CryptoKey> | null {
  const material = secretMaterial();
  if (!material) return null;
  // Re-derive if the underlying secret changed (test suites swap env vars).
  if (!cachedKey || cachedFor !== material) {
    cachedFor = material;
    cachedKey = crypto.subtle.importKey(
      'raw',
      encoder.encode(`guidon-session-v1:${material}`),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign', 'verify'],
    );
  }
  return cachedKey;
}

/** Test seam: drop the memoized key after mutating env vars. */
export function resetSigningKeyCache(): void {
  cachedKey = null;
  cachedFor = null;
}

/** True when a signing secret is available. False means auth cannot work. */
export function isSessionSigningConfigured(): boolean {
  return secretMaterial() !== null;
}

/**
 * Mints a signed token. Throws when no secret is configured, because silently
 * issuing unsigned credentials is how you end up back where we started.
 */
export async function signSession(
  role: SessionRole,
  sub: string,
  maxAgeSec: number,
): Promise<string> {
  const key = signingKey();
  if (!key) {
    throw new Error(
      'Cannot sign session: set SESSION_SECRET (or SUPABASE_SERVICE_ROLE_KEY) in the environment.',
    );
  }
  const payload: SessionPayload = {
    role,
    sub,
    exp: Math.floor(Date.now() / 1000) + maxAgeSec,
  };
  const body = b64urlFromBytes(encoder.encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign('HMAC', await key, encoder.encode(body));
  return `${body}.${b64urlFromBytes(new Uint8Array(sig))}`;
}

/**
 * Verifies a token and returns its payload, or null if anything is off:
 * malformed, wrong signature, expired, or not the role we asked for.
 *
 * Signature comparison goes through `crypto.subtle.verify`, which is
 * constant-time — a hand-rolled `===` on hex strings leaks timing.
 */
export async function verifySession(
  token: string | null | undefined,
  expectedRole: SessionRole,
): Promise<SessionPayload | null> {
  if (!token) return null;
  const key = signingKey();
  if (!key) return null;

  const dot = token.indexOf('.');
  if (dot <= 0 || dot === token.length - 1) return null;
  const body = token.slice(0, dot);
  const sigBytes = bytesFromB64url(token.slice(dot + 1));
  if (!sigBytes) return null;

  let valid = false;
  try {
    valid = await crypto.subtle.verify(
      'HMAC',
      await key,
      sigBytes as unknown as BufferSource,
      encoder.encode(body),
    );
  } catch {
    return null;
  }
  if (!valid) return null;

  const raw = bytesFromB64url(body);
  if (!raw) return null;

  let payload: SessionPayload;
  try {
    payload = JSON.parse(new TextDecoder().decode(raw)) as SessionPayload;
  } catch {
    return null;
  }

  if (payload?.role !== expectedRole) return null;
  if (typeof payload.sub !== 'string' || !payload.sub) return null;
  if (typeof payload.exp !== 'number' || payload.exp <= Math.floor(Date.now() / 1000)) {
    return null;
  }
  return payload;
}

/** Pulls a bearer token out of an Authorization header. */
export function bearerFrom(header: string | null | undefined): string | null {
  if (!header) return null;
  if (!header.startsWith('Bearer ')) return null;
  const value = header.slice(7).trim();
  return value || null;
}
