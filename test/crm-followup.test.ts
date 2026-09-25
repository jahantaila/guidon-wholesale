import { describe, it, expect, vi, beforeEach } from "vitest";
import { followupState, scheduledFollowups, buildCrmList } from "@/lib/crm";
import type { Customer, CrmContact } from "@/lib/types";

// Scheduled follow-ups, created from the CRM (Mike's Sept 24 email).
// Reported bug: follow-ups for two customers "did not save". Production had
// both saved (Sep 29) — the CRM simply never showed a follow-up that wasn't
// due yet. These tests pin: save + read-back on two different customers,
// visibility in the list, and the filter that keeps overdue ones.

const h = vi.hoisted(() => {
  const customers: Record<string, unknown>[] = [];
  const contacts: Record<string, unknown>[] = [];
  return {
    customers,
    contacts,
    isAdmin: vi.fn(async () => true),
    updateCustomer: vi.fn(async (id: string, u: Record<string, unknown>) => {
      const c = customers.find((x) => x.id === id);
      if (!c) return undefined;
      Object.assign(c, u);
      return { ...c };
    }),
    updateCrmContact: vi.fn(async (id: string, u: Record<string, unknown>) => {
      const c = contacts.find((x) => x.id === id);
      if (!c) return undefined;
      Object.assign(c, u);
      return { ...c };
    }),
  };
});

vi.mock("@/lib/auth-check", () => ({ isAdminRequest: h.isAdmin }));
vi.mock("@/lib/data", () => ({
  getCustomer: vi.fn(async (id: string) => h.customers.find((c) => c.id === id)),
  updateCustomer: h.updateCustomer,
  getCrmContact: vi.fn(async (id: string) => h.contacts.find((c) => c.id === id)),
  updateCrmContact: h.updateCrmContact,
}));

import { PUT } from "@/app/api/admin/crm/followup/route";

function put(body: unknown) {
  return PUT(
    new Request("https://x.test/api/admin/crm/followup", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }) as never,
  );
}

function customer(id: string, name: string): Record<string, unknown> {
  return { id, businessName: name, archivedAt: null, nextFollowupDate: null, nextFollowupNotes: "" };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.isAdmin.mockResolvedValue(true);
  h.customers.length = 0;
  h.contacts.length = 0;
  h.customers.push(customer("cust-a", "Asheville Wine Market"), customer("cust-b", "Salty Landing"));
  h.contacts.push({ id: "lead-1", businessName: "New Bar", nextFollowupDate: null, nextFollowupNotes: "" });
});

describe("PUT /api/admin/crm/followup", () => {
  it("saves follow-ups on two different customers, each on the right account", async () => {
    const a = await put({ subjectId: "cust-a", date: "2026-09-29", notes: "Ask for Marshall" });
    const b = await put({ subjectId: "cust-b", date: "2026-10-02", notes: "Fall seasonal" });
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(await a.json()).toMatchObject({ subjectId: "cust-a", nextFollowupDate: "2026-09-29", nextFollowupNotes: "Ask for Marshall" });
    // "Reload": the stored rows, not the response, are what the list reads.
    expect(h.customers[0]).toMatchObject({ nextFollowupDate: "2026-09-29", nextFollowupNotes: "Ask for Marshall" });
    expect(h.customers[1]).toMatchObject({ nextFollowupDate: "2026-10-02", nextFollowupNotes: "Fall seasonal" });
  });

  it("works for a lead too", async () => {
    const res = await put({ subjectId: "lead-1", date: "2026-10-01" });
    expect(res.status).toBe(200);
    expect(h.updateCrmContact).toHaveBeenCalledWith("lead-1", { nextFollowupDate: "2026-10-01", nextFollowupNotes: "" });
    expect(h.updateCustomer).not.toHaveBeenCalled();
  });

  it("clears the date and its note together", async () => {
    await put({ subjectId: "cust-a", date: "2026-09-29", notes: "x" });
    const res = await put({ subjectId: "cust-a", date: null, notes: "ignored" });
    expect(res.status).toBe(200);
    expect(h.customers[0]).toMatchObject({ nextFollowupDate: null, nextFollowupNotes: "" });
  });

  it("returns a 500 when the database write does not stick", async () => {
    h.updateCustomer.mockResolvedValueOnce({ ...customer("cust-a", "Asheville Wine Market") });
    const res = await put({ subjectId: "cust-a", date: "2026-09-29" });
    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/did not save/);
  });

  it("returns a 500 when the database write fails outright", async () => {
    h.updateCustomer.mockResolvedValueOnce(undefined);
    expect((await put({ subjectId: "cust-a", date: "2026-09-29" })).status).toBe(500);
  });

  it("validates input and the admin gate", async () => {
    expect((await put({ date: "2026-09-29" })).status).toBe(400);
    expect((await put({ subjectId: "cust-a", date: "09/29/2026" })).status).toBe(400);
    expect((await put({ subjectId: "cust-a", date: "2026-02-31" })).status).toBe(400);
    expect((await put({ subjectId: "ghost", date: "2026-09-29" })).status).toBe(404);
    h.isAdmin.mockResolvedValue(false);
    expect((await put({ subjectId: "cust-a", date: "2026-09-29" })).status).toBe(403);
  });
});

describe("followupState", () => {
  it("classifies against today", () => {
    expect(followupState("2026-09-20", "2026-09-24")).toBe("overdue");
    expect(followupState("2026-09-24", "2026-09-24")).toBe("today");
    expect(followupState("2026-09-29", "2026-09-24")).toBe("upcoming");
    expect(followupState(null, "2026-09-24")).toBeNull();
  });
});

describe("scheduled follow-ups in the CRM list", () => {
  const customers = [
    { id: "c1", businessName: "Asheville Wine Market", nextFollowupDate: "2026-09-29", nextFollowupNotes: "Ask for Marshall" },
    { id: "c2", businessName: "Salty Landing", nextFollowupDate: "2026-09-10", nextFollowupNotes: "" },
    { id: "c3", businessName: "Ecusta Market", nextFollowupDate: null },
  ] as unknown as Customer[];
  const contacts = [
    { id: "l1", businessName: "New Bar", status: "lead", nextFollowupDate: "2026-09-29", nextFollowupNotes: "" },
  ] as unknown as CrmContact[];

  it("carries the date AND note onto each list row, not just due ones", () => {
    const rows = buildCrmList(contacts, customers, [], []);
    expect(rows.find((r) => r.id === "c1")).toMatchObject({ nextFollowupDate: "2026-09-29", nextFollowupNotes: "Ask for Marshall" });
  });

  it("lists every scheduled follow-up soonest first, overdue included", () => {
    const rows = scheduledFollowups(buildCrmList(contacts, customers, [], []));
    expect(rows.map((r) => r.id)).toEqual(["c2", "c1", "l1"]);
  });
});
