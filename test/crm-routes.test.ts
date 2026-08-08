import { describe, it, expect, vi, beforeEach } from "vitest";

// Route-level tests for the CRM. Every handler checks isAdminRequest itself —
// importing a handler directly never runs middleware, so a route relying on
// middleware alone would look protected here while being open in any context
// where middleware is bypassed or degraded (which happened in production on
// 2026-08-07, see test/admin-routes-selfguard.test.ts).

const h = vi.hoisted(() => {
  const contacts: Record<string, unknown>[] = [
    {
      id: "lead-1", businessName: "New Bar", contactName: "Sam", email: "",
      phone: "8285550000", streetAddress: "", city: "", state: "", zip: "",
      status: "lead", notes: "", tags: [], nextFollowupDate: null,
      nextFollowupNotes: "", convertedCustomerId: null, convertedAt: null,
      archivedAt: null, createdAt: "2026-06-01T00:00:00Z",
    },
  ];
  const customers: Record<string, unknown>[] = [
    { id: "cust-1", businessName: "Salty Landing", email: "taken@x.test", archivedAt: null },
  ];
  const activities: Record<string, unknown>[] = [];
  return {
    isAdminRequestSpy: vi.fn(async () => true),
    contacts, customers, activities,
    createCustomerSpy: vi.fn(async (c: Record<string, unknown>) => { customers.push(c); return c; }),
    createCrmActivitySpy: vi.fn(async (a: Record<string, unknown>) => { activities.push(a); return a; }),
    deleteCrmActivitySpy: vi.fn(async () => true),
    updateCrmContactSpy: vi.fn(async (id: string, u: Record<string, unknown>) => {
      const c = contacts.find((x) => x.id === id);
      if (!c) return undefined;
      Object.assign(c, u);
      return c;
    }),
    createCrmContactSpy: vi.fn(async (c: Record<string, unknown>) => { contacts.push(c); return c; }),
  };
});

vi.mock("@/lib/auth-check", () => ({ isAdminRequest: h.isAdminRequestSpy }));
vi.mock("@/lib/data", () => ({
  getCrmContacts: vi.fn(async () => h.contacts),
  getCrmContact: vi.fn(async (id: string) => h.contacts.find((c) => c.id === id)),
  createCrmContact: h.createCrmContactSpy,
  updateCrmContact: h.updateCrmContactSpy,
  getCrmActivities: vi.fn(async (subjectId?: string) =>
    subjectId ? h.activities.filter((a) => a.customerId === subjectId || a.contactId === subjectId) : h.activities),
  createCrmActivity: h.createCrmActivitySpy,
  deleteCrmActivity: h.deleteCrmActivitySpy,
  getCustomers: vi.fn(async () => h.customers),
  getCustomer: vi.fn(async (id: string) => h.customers.find((c) => c.id === id)),
  createCustomer: h.createCustomerSpy,
  getOrders: vi.fn(async () => []),
}));

import { POST as contactsPOST, PUT as contactsPUT, GET as contactsGET } from "@/app/api/admin/crm/contacts/route";
import { POST as convertPOST } from "@/app/api/admin/crm/contacts/convert/route";
import { POST as activityPOST, GET as activityGET } from "@/app/api/admin/crm/activities/route";
import { GET as summaryGET } from "@/app/api/admin/crm/summary/route";

function req(body?: unknown, method = "POST", url = "https://x.test/api/admin/crm/x") {
  return new Request(url, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  }) as never;
}

beforeEach(() => {
  h.isAdminRequestSpy.mockResolvedValue(true);
  h.createCustomerSpy.mockClear();
  h.createCrmActivitySpy.mockClear();
  h.activities.length = 0;
  h.contacts.length = 1;
  Object.assign(h.contacts[0], { convertedAt: null, convertedCustomerId: null, email: "" });
  h.customers.length = 1;
});

describe("admin guard", () => {
  it("every CRM handler rejects a non-admin with 403", async () => {
    h.isAdminRequestSpy.mockResolvedValue(false);
    expect((await contactsGET(req(undefined, "GET"))).status).toBe(403);
    expect((await contactsPOST(req({ businessName: "x" }))).status).toBe(403);
    expect((await contactsPUT(req({ id: "lead-1" }, "PUT"))).status).toBe(403);
    expect((await convertPOST(req({ id: "lead-1" }))).status).toBe(403);
    expect((await activityGET(req(undefined, "GET"))).status).toBe(403);
    expect((await activityPOST(req({ subjectId: "lead-1", type: "cold_call" }))).status).toBe(403);
    expect((await summaryGET(req(undefined, "GET")))?.status).toBe(403);
  });
});

describe("POST /crm/contacts", () => {
  it("needs only a business name — a lead can start with nothing else", async () => {
    const res = await contactsPOST(req({ businessName: "  Drive-By Tavern  " }));
    expect(res.status).toBe(201);
    expect((await res.json()).businessName).toBe("Drive-By Tavern");
  });

  it("rejects a blank business name", async () => {
    expect((await contactsPOST(req({ businessName: "   " }))).status).toBe(400);
    expect((await contactsPOST(req({}))).status).toBe(400);
  });

  it("defaults status to lead and accepts prospect", async () => {
    expect((await (await contactsPOST(req({ businessName: "A" }))).json()).status).toBe("lead");
    expect((await (await contactsPOST(req({ businessName: "B", status: "prospect" }))).json()).status).toBe("prospect");
  });

  it("ignores an invalid status rather than writing it", async () => {
    const body = await (await contactsPOST(req({ businessName: "C", status: "customer" }))).json();
    expect(body.status).toBe("lead");
  });
});

describe("PUT /crm/contacts", () => {
  it("refuses to set status to customer — that is what convert is for", async () => {
    const res = await contactsPUT(req({ id: "lead-1", status: "customer" }, "PUT"));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/convert/i);
  });

  it("cannot fake a conversion by writing the bookkeeping fields directly", async () => {
    await contactsPUT(req({ id: "lead-1", convertedCustomerId: "cust-999", convertedAt: "2026-01-01" }, "PUT"));
    const [, updates] = h.updateCrmContactSpy.mock.calls.at(-1)!;
    expect(updates).not.toHaveProperty("convertedCustomerId");
    expect(updates).not.toHaveProperty("convertedAt");
  });

  it("404s an unknown contact", async () => {
    expect((await contactsPUT(req({ id: "nope" }, "PUT"))).status).toBe(404);
  });
});

describe("POST /crm/activities", () => {
  it("logs against a lead", async () => {
    const res = await activityPOST(req({ subjectId: "lead-1", type: "cold_call" }));
    expect(res.status).toBe(201);
    const a = await res.json();
    expect(a.contactId).toBe("lead-1");
    expect(a.customerId).toBeNull();
  });

  it("logs against a customer", async () => {
    const a = await (await activityPOST(req({ subjectId: "cust-1", type: "dropped_samples" }))).json();
    expect(a.customerId).toBe("cust-1");
    expect(a.contactId).toBeNull();
  });

  it("never sets both subjects, whatever the caller sends", async () => {
    // The DB constraint enforces exactly-one; the route must not rely on the
    // client to respect it.
    const a = await (await activityPOST(req({ subjectId: "lead-1", customerId: "cust-1", contactId: "lead-1", type: "cold_call" }))).json();
    expect(Boolean(a.customerId) && Boolean(a.contactId)).toBe(false);
  });

  it("rejects an unknown activity type", async () => {
    const res = await activityPOST(req({ subjectId: "lead-1", type: "sent_pigeon" }));
    expect(res.status).toBe(400);
  });

  it("rejects a missing subject and an unknown subject", async () => {
    expect((await activityPOST(req({ type: "cold_call" }))).status).toBe(400);
    expect((await activityPOST(req({ subjectId: "ghost", type: "cold_call" }))).status).toBe(404);
  });

  it("defaults occurredAt to now and accepts an explicit date", async () => {
    const now = await (await activityPOST(req({ subjectId: "lead-1", type: "cold_call" }))).json();
    expect(Number.isNaN(Date.parse(now.occurredAt))).toBe(false);
    const back = await (await activityPOST(req({ subjectId: "lead-1", type: "cold_call", occurredAt: "2026-07-04T12:00:00Z" }))).json();
    expect(back.occurredAt).toBe("2026-07-04T12:00:00.000Z");
  });

  it("falls back to now when occurredAt is unparseable", async () => {
    const a = await (await activityPOST(req({ subjectId: "lead-1", type: "cold_call", occurredAt: "last tuesday" }))).json();
    expect(Number.isNaN(Date.parse(a.occurredAt))).toBe(false);
  });
});

describe("POST /crm/contacts/convert", () => {
  it("creates a customer and links the contact back to it", async () => {
    const res = await convertPOST(req({ id: "lead-1", email: "new@bar.test" }));
    expect(res.status).toBe(201);
    expect(h.createCustomerSpy).toHaveBeenCalledTimes(1);
    expect(h.contacts[0].convertedCustomerId).toBeTruthy();
  });

  it("re-parents activity history so promoting does not erase it", async () => {
    h.activities.push({ id: "a1", contactId: "lead-1", customerId: null, type: "cold_call", occurredAt: "2026-07-01T00:00:00Z", notes: "", source: "admin", createdAt: "" });
    const res = await convertPOST(req({ id: "lead-1", email: "new@bar.test" }));
    expect((await res.json()).movedActivities).toBe(1);
    const reparented = h.createCrmActivitySpy.mock.calls.at(-1)![0] as Record<string, unknown>;
    expect(reparented.contactId).toBeNull();
    expect(reparented.customerId).toBeTruthy();
  });

  it("requires an email, since a customer account needs one", async () => {
    const res = await convertPOST(req({ id: "lead-1" }));
    expect(res.status).toBe(400);
    expect(h.createCustomerSpy).not.toHaveBeenCalled();
  });

  it("takes the email supplied at conversion time", async () => {
    // Converting is usually the moment Mike finally has the address.
    expect((await convertPOST(req({ id: "lead-1", email: "late@bar.test" }))).status).toBe(201);
  });

  it("409s when that email is already a customer, naming who", async () => {
    const res = await convertPOST(req({ id: "lead-1", email: "taken@x.test" }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/Salty Landing/);
    expect(h.createCustomerSpy).not.toHaveBeenCalled();
  });

  it("is idempotent — a second click returns the same customer, not a duplicate", async () => {
    const first = await (await convertPOST(req({ id: "lead-1", email: "new@bar.test" }))).json();
    h.createCustomerSpy.mockClear();
    const second = await convertPOST(req({ id: "lead-1" }));
    expect(second.status).toBe(200);
    expect((await second.json())).toMatchObject({ customerId: first.customerId, alreadyConverted: true });
    expect(h.createCustomerSpy).not.toHaveBeenCalled();
  });

  it("404s an unknown contact", async () => {
    expect((await convertPOST(req({ id: "ghost", email: "x@y.test" }))).status).toBe(404);
  });

  it("releases the claim if creating the customer fails, so the lead is not stranded", async () => {
    h.createCustomerSpy.mockRejectedValueOnce(new Error("db exploded"));
    const res = await convertPOST(req({ id: "lead-1", email: "new@bar.test" }));
    expect(res.status).toBe(500);
    expect(h.contacts[0].convertedAt).toBeNull();
  });
});

describe("GET /crm/summary", () => {
  it("returns the unified list with per-status counts", async () => {
    const body = await (await summaryGET(req(undefined, "GET"))).json();
    expect(body.counts.total).toBe(body.rows.length);
    expect(body.counts.lead + body.counts.prospect + body.counts.customer).toBe(body.rows.length);
  });

  it("clamps a nonsense quietDays to the default", async () => {
    const body = await (await summaryGET(req(undefined, "GET", "https://x.test/api/admin/crm/summary?quietDays=-5"))).json();
    expect(body.quietDays).toBe(45);
  });

  it("accepts a valid quietDays", async () => {
    const body = await (await summaryGET(req(undefined, "GET", "https://x.test/api/admin/crm/summary?quietDays=90"))).json();
    expect(body.quietDays).toBe(90);
  });
});
