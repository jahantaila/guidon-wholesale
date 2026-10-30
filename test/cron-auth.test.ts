import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Vercel's scheduler sends `user-agent: vercel-cron/1.0` and
// `x-vercel-cron-schedule`, plus `Authorization: Bearer <CRON_SECRET>` only
// when CRON_SECRET is set. The routes used to look for `x-vercel-cron`, which
// Vercel never sends, so every scheduled run in production 401'd.

const h = vi.hoisted(() => ({ store: {} as Record<string, unknown> }));
vi.mock("@/lib/data", () => ({
  getSetting: vi.fn(async (k: string, fb: unknown) => (k in h.store ? h.store[k] : fb)),
  setSetting: vi.fn(async (k: string, v: unknown) => { h.store[k] = v; }),
}));

import { cronCaller, claimCronRun, getCronRuns } from "@/lib/cron-auth";

const req = (headers: Record<string, string>) => new Request("https://x.test/api/cron/x", { headers });

beforeEach(() => {
  h.store = {};
  delete process.env.CRON_SECRET;
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-31T13:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("cronCaller", () => {
  it("recognises Vercel's scheduler with no secret configured", () => {
    expect(cronCaller(req({ "user-agent": "vercel-cron/1.0" }))).toBe("scheduler");
    expect(cronCaller(req({ "x-vercel-cron-schedule": "0 12 * * *" }))).toBe("scheduler");
  });

  it("rejects everything else", () => {
    expect(cronCaller(req({}))).toBeNull();
    expect(cronCaller(req({ "x-vercel-cron": "1" }))).toBeNull();
    expect(cronCaller(req({ "user-agent": "curl/8" }))).toBeNull();
    expect(cronCaller(req({ authorization: "Bearer anything" }))).toBeNull(); // no secret set
  });

  it("accepts the secret (Bearer or x-cron-secret) once CRON_SECRET is set, and only the right one", () => {
    process.env.CRON_SECRET = "s3cret-value";
    expect(cronCaller(req({ authorization: "Bearer s3cret-value" }))).toBe("secret");
    expect(cronCaller(req({ "x-cron-secret": "s3cret-value" }))).toBe("secret");
    expect(cronCaller(req({ authorization: "Bearer nope" }))).toBeNull();
    // Vercel sends both once the secret is set: the secret wins.
    expect(cronCaller(req({ authorization: "Bearer s3cret-value", "user-agent": "vercel-cron/1.0" }))).toBe("secret");
  });
});

describe("claimCronRun", () => {
  it("lets the scheduler run once per window and records a heartbeat", async () => {
    expect(await claimCronRun("mark-overdue", "scheduler", 12)).toBe(true);
    expect((await getCronRuns())["mark-overdue"]).toEqual({ at: "2026-10-31T13:00:00.000Z", caller: "scheduler" });
    vi.setSystemTime(new Date("2026-10-31T20:00:00Z")); // 7h later: a spoofed early call
    expect(await claimCronRun("mark-overdue", "scheduler", 12)).toBe(false);
    vi.setSystemTime(new Date("2026-11-01T13:00:00Z")); // next day's scheduled run
    expect(await claimCronRun("mark-overdue", "scheduler", 12)).toBe(true);
  });

  it("jobs have independent windows", async () => {
    await claimCronRun("mark-overdue", "scheduler", 12);
    expect(await claimCronRun("recurring-orders", "scheduler", 12)).toBe(true);
  });

  it("a secret caller always runs", async () => {
    await claimCronRun("weekly-digest", "scheduler", 144);
    expect(await claimCronRun("weekly-digest", "secret", 144)).toBe(true);
  });
});
