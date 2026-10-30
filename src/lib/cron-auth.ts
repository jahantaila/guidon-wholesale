import type { NextRequest } from 'next/server';
import { getSetting, setSetting } from '@/lib/data';

/**
 * Who is calling a /api/cron/* route.
 *
 * 'secret'    — Authorization: Bearer <CRON_SECRET> (or x-cron-secret). Vercel
 *               sends this itself once CRON_SECRET is set on the project; it is
 *               also how a person triggers a run or a test by hand.
 * 'scheduler' — Vercel's scheduler without a secret. Vercel identifies cron
 *               requests by `user-agent: vercel-cron/1.0` and an
 *               `x-vercel-cron-schedule` header.
 *
 * Until 2026-10-30 the routes looked for an `x-vercel-cron` header, which
 * Vercel never sends, and CRON_SECRET was not set in production, so every
 * scheduled run since launch was rejected with a 401 (reminders never went
 * out; April invoices never turned overdue).
 *
 * The scheduler headers can be spoofed, so a 'scheduler' caller only gets the
 * plain scheduled run (no test/preview options) and is rate-limited by
 * claimCronRun. Every job is idempotent or deduplicated, so the worst a spoofed
 * call can do is run a job early.
 */
export type CronCaller = 'secret' | 'scheduler';

export function cronCaller(request: NextRequest | Request): CronCaller | null {
  const expected = process.env.CRON_SECRET;
  if (expected) {
    const provided = request.headers.get('authorization') || request.headers.get('x-cron-secret');
    if (provided) {
      const token = provided.startsWith('Bearer ') ? provided.slice(7) : provided;
      if (token === expected) return 'secret';
    }
  }
  const ua = request.headers.get('user-agent') || '';
  if (ua.startsWith('vercel-cron/') || request.headers.get('x-vercel-cron-schedule')) return 'scheduler';
  return null;
}

export const CRON_RUNS_SETTINGS_KEY = 'cron_last_run';

export type CronRuns = Record<string, { at: string; caller: CronCaller }>;

export async function getCronRuns(): Promise<CronRuns> {
  const runs = await getSetting<unknown>(CRON_RUNS_SETTINGS_KEY, {});
  return runs && typeof runs === 'object' && !Array.isArray(runs) ? (runs as CronRuns) : {};
}

/**
 * Records that `job` is running and says whether it may. A 'scheduler'
 * caller is refused if the job already ran within `minHours`; a 'secret'
 * caller always runs. The record doubles as a heartbeat: Settings data shows
 * when each job last ran.
 */
export async function claimCronRun(job: string, caller: CronCaller, minHours: number): Promise<boolean> {
  const runs = await getCronRuns();
  const last = runs[job]?.at ? new Date(runs[job].at).getTime() : 0;
  if (caller === 'scheduler' && last && Date.now() - last < minHours * 60 * 60 * 1000) return false;
  await setSetting(CRON_RUNS_SETTINGS_KEY, { ...runs, [job]: { at: new Date().toISOString(), caller } });
  return true;
}
