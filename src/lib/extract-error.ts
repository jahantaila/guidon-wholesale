/**
 * Pull a human-readable string out of whatever the server threw.
 * Supabase's PostgrestError is a plain object — not an Error instance —
 * and `String(err)` on it returns "[object Object]". That leaked into
 * admin-facing alert() dialogs.
 *
 * Priority order:
 * - string → return as-is
 * - Error → .message
 * - object with .message → .message (plus .details / .hint if present)
 * - fallback → JSON.stringify or "[unserializable error]"
 */
export function extractError(err: unknown): string {
  if (!err) return 'Unknown error';
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message;
  if (typeof err === 'object') {
    const e = err as {
      message?: unknown;
      details?: unknown;
      hint?: unknown;
      code?: unknown;
    };
    if (typeof e.message === 'string' && e.message.trim()) {
      const detail = typeof e.details === 'string' && e.details ? ` (${e.details})` : '';
      const hint = typeof e.hint === 'string' && e.hint ? ` — ${e.hint}` : '';
      return e.message + detail + hint;
    }
    try { return JSON.stringify(err); } catch { return '[unserializable error]'; }
  }
  return String(err);
}

/**
 * Detect "already exists" on uniqueness-constraint or Supabase-auth errors
 * so callers can return a friendlier 409 instead of a 500.
 */
export function isAlreadyExistsError(err: unknown): boolean {
  const msg = extractError(err).toLowerCase();
  return /already (exists|registered)|duplicate|unique/i.test(msg);
}
