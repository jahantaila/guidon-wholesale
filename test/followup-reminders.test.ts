import { describe, it, expect, vi, beforeEach } from "vitest";
import { addDays, dueReminders, parseReminderSettings } from "@/lib/followup-reminders";

// Day-before and day-of follow-up reminder emails (Mike, Sept 24 2026).

describe("addDays", () => {
  it("rolls months and years", () => {
    expect(addDays("2026-09-30", 1)).toBe("2026-10-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
  it("survives the DST change (Nov 1 2026)", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-11-01", 1)).toBe("2026-11-02");
  });
});

describe("dueReminders", () => {
  const subjects = [
    { id: "c1", businessName: "Asheville Wine Market", isCustomer: true, nextFollowupDate: "2026-09-29", nextFollowupNotes: "Ask for Marshall" },
    { id: "l1", businessName: "New Bar", isCustomer: false, nextFollowupDate: "2026-09-28" },
    { id: "c2", businessName: "Overdue Taproom", isCustomer: true, nextFollowupDate: "2026-09-20" },
    { id: "c3", businessName: "Far Future", isCustomer: true, nextFollowupDate: "2026-10-15" },
    { id: "c4", businessName: "None", isCustomer: true, nextFollowupDate: null },
  ];

  it("day before: only tomorrow's follow-ups, with customer, date, note and link", () => {
    const r = dueReminders(subjects, "2026-09-28");
    expect(r).toEqual([
      {
        subjectId: "c1", businessName: "Asheville Wine Market", followupDate: "2026-09-29",
        notes: "Ask for Marshall", kind: "day_before", path: "/admin/customers/c1",
      },
      {
        subjectId: "l1", businessName: "New Bar", followupDate: "2026-09-28",
        notes: "", kind: "day_of", path: "/admin/crm?filter=followups",
      },
    ]);
  });

  it("day of", () => {
    expect(dueReminders(subjects, "2026-09-29").map((r) => [r.subjectId, r.kind])).toEqual([["c1", "day_of"]]);
  });

  it("never reminds on overdue, far-future or unscheduled follow-ups", () => {
    expect(dueReminders(subjects, "2026-09-25")).toEqual([]);
  });
});

describe("parseReminderSettings", () => {
  it("defaults off and drops junk recipients", () => {
    expect(parseReminderSettings(undefined)).toEqual({ enabled: false, recipients: [] });
    expect(parseReminderSettings({ enabled: "yes", recipients: ["Mike@X.com ", "nope", 3] })).toEqual({
      enabled: false,
      recipients: ["mike@x.com"],
    });
  });
});

// ─── Cron route ─────────────────────────────────────────────────────────────

const h = vi.hoisted(() => ({
  customers: [] as Record<string, unknown>[],
  contacts: [] as Record<string, unknown>[],
  settings: { enabled: true, recipients: ["mike@guidon.test"] } as unknown,
  claimed: new Set<string>(),
  send: vi.fn(async (_a: Record<string, unknown>) => ({ ok: true } as { ok: boolean; error?: string })),
  today: "2026-09-28",
}));

vi.mock("@/lib/data", () => ({
  getCustomers: vi.fn(async () => h.customers),
  getCrmContacts: vi.fn(async () => h.contacts),
  getSetting: vi.fn(async () => h.settings),
  claimFollowupReminder: vi.fn(async (s: string, d: string, k: string) => {
    const key = `${s}:${d}:${k}`;
    if (h.claimed.has(key)) return false;
    h.claimed.add(key);
    return true;
  }),
  releaseFollowupReminder: vi.fn(async (s: string, d: string, k: string) => {
    h.claimed.delete(`${s}:${d}:${k}`);
  }),
}));
vi.mock("@/lib/email", () => ({ notifyFollowupReminder: h.send }));
vi.mock("@/lib/sales-report", () => ({ breweryLocalDate: () => h.today }));

import { GET } from "@/app/api/cron/followup-reminders/route";

function cron(query = "", headers: Record<string, string> = { "x-vercel-cron": "1" }) {
  return GET(new Request(`https://x.test/api/cron/followup-reminders${query}`, { headers }) as never);
}

beforeEach(() => {
  h.send.mockClear();
  h.send.mockResolvedValue({ ok: true });
  h.claimed.clear();
  h.today = "2026-09-28";
  h.settings = { enabled: true, recipients: ["mike@guidon.test"] };
  h.customers.length = 0;
  h.contacts.length = 0;
  h.customers.push(
    { id: "c1", businessName: "Asheville Wine Market", nextFollowupDate: "2026-09-29", nextFollowupNotes: "Ask for Marshall", archivedAt: null },
    { id: "c9", businessName: "Archived", nextFollowupDate: "2026-09-29", archivedAt: "2026-01-01" },
  );
});

describe("GET /api/cron/followup-reminders", () => {
  it("rejects unauthenticated calls", async () => {
    expect((await cron("", {})).status).toBe(401);
  });

  it("sends the day-before reminder to the configured recipients only", async () => {
    const body = await (await cron()).json();
    expect(body.sent).toEqual(["c1:2026-09-29:day_before"]);
    expect(h.send).toHaveBeenCalledTimes(1);
    expect(h.send.mock.calls[0][0]).toMatchObject({
      to: ["mike@guidon.test"], businessName: "Asheville Wine Market", followupDate: "2026-09-29",
      kind: "day_before", path: "/admin/customers/c1",
    });
  });

  it("a retry the same day sends nothing twice", async () => {
    await cron();
    const again = await (await cron()).json();
    expect(again.sent).toEqual([]);
    expect(again.skipped).toEqual(["c1:2026-09-29:day_before"]);
    expect(h.send).toHaveBeenCalledTimes(1);
  });

  it("then sends the day-of reminder the next morning", async () => {
    await cron();
    h.today = "2026-09-29";
    const body = await (await cron()).json();
    expect(body.sent).toEqual(["c1:2026-09-29:day_of"]);
    expect(h.send).toHaveBeenCalledTimes(2);
  });

  it("moving the follow-up to a new date gets fresh reminders for the new date", async () => {
    await cron();
    h.customers[0].nextFollowupDate = "2026-10-02";
    h.today = "2026-10-01";
    const body = await (await cron()).json();
    expect(body.sent).toEqual(["c1:2026-10-02:day_before"]);
  });

  it("a failed send is released so a re-run can retry it", async () => {
    h.send.mockResolvedValueOnce({ ok: false, error: "resend down" });
    const first = await (await cron()).json();
    expect(first.ok).toBe(false);
    expect(first.failed[0].key).toBe("c1:2026-09-29:day_before");
    const second = await (await cron()).json();
    expect(second.sent).toEqual(["c1:2026-09-29:day_before"]);
  });

  it("does nothing while switched off", async () => {
    h.settings = { enabled: false, recipients: ["mike@guidon.test"] };
    const body = await (await cron()).json();
    expect(body.skipped).toBe("disabled");
    expect(h.send).not.toHaveBeenCalled();
  });

  it("dryRun previews without sending or claiming", async () => {
    const body = await (await cron("?dryRun=1&today=2026-09-29")).json();
    expect(body.reminders.map((r: { kind: string }) => r.kind)).toEqual(["day_of"]);
    expect(h.send).not.toHaveBeenCalled();
    expect(h.claimed.size).toBe(0);
  });

  it("testTo sends only to the internal test address, even when off, and records nothing", async () => {
    h.settings = { enabled: false, recipients: [] };
    const body = await (await cron("?testTo=jahan@derbydigital.test")).json();
    expect(body.test).toBe(true);
    expect(h.send).toHaveBeenCalledTimes(1);
    expect(h.send.mock.calls[0][0].to).toEqual(["jahan@derbydigital.test"]);
    expect(h.claimed.size).toBe(0);
    expect((await cron("?testTo=not-an-email")).status).toBe(400);
  });

  it("ignores a forced 'today' on the live path", async () => {
    const body = await (await cron("?today=2026-09-29")).json();
    expect(body.today).toBe("2026-09-28");
  });
});
