import { describe, it, expect, vi, beforeEach } from "vitest";

// Settings: follow-up reminders can't be switched on with nobody to email.

const h = vi.hoisted(() => ({ store: {} as Record<string, unknown> }));
vi.mock("@/lib/auth-check", () => ({ isAdminRequest: async () => true }));
vi.mock("@/lib/data", () => ({
  getNotificationEmails: async () => ["sales@guidon.test"],
  getSetting: async (k: string, d: unknown) => (k in h.store ? h.store[k] : d),
  setSetting: async (k: string, v: unknown) => { h.store[k] = v; },
}));

import { GET, PUT } from "@/app/api/admin/settings/route";

const put = (body: unknown) =>
  PUT(new Request("https://x.test/api/admin/settings", { method: "PUT", body: JSON.stringify(body) }) as never);

beforeEach(() => { h.store = {}; });

describe("followupReminders setting", () => {
  it("defaults to off with no recipients", async () => {
    const body = await (await GET(new Request("https://x.test/api/admin/settings") as never)).json();
    expect(body.followupReminders).toEqual({ enabled: false, recipients: [] });
  });

  it("refuses to turn on with no recipients", async () => {
    const res = await put({ followupReminders: { enabled: true, recipients: [] } });
    expect(res.status).toBe(400);
    expect(h.store.followup_reminders).toBeUndefined();
  });

  it("rejects a malformed address", async () => {
    expect((await put({ followupReminders: { enabled: false, recipients: ["mike@"] } })).status).toBe(400);
  });

  it("saves recipients and the on switch", async () => {
    const res = await put({ followupReminders: { enabled: true, recipients: ["Mike@Guidon.test"] } });
    expect(res.status).toBe(200);
    expect((await res.json()).followupReminders).toEqual({ enabled: true, recipients: ["mike@guidon.test"] });
  });
});
