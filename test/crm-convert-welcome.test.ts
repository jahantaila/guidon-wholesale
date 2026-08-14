import { describe, it, expect, vi, beforeEach } from "vitest";

// Converting a prospect to a customer (2026-08-14 change) now provisions a
// portal login and emails a welcome — same as approving a wholesale
// application. Both are best-effort and must not fail the conversion.

const h = vi.hoisted(() => ({
  isSupabaseConfiguredSpy: vi.fn(() => true),
  syncSpy: vi.fn(async (_args: Record<string, unknown>) => undefined),
  notifySpy: vi.fn(async (_args: Record<string, unknown>) => undefined),
  isEmailConfiguredSpy: vi.fn(() => true),
  contact: {
    id: "lead-1", businessName: "Drive-By Tavern", contactName: "Sam", email: "",
    phone: "", streetAddress: "", city: "", state: "", zip: "", status: "prospect",
    notes: "", tags: [], nextFollowupDate: null, nextFollowupNotes: "",
    convertedCustomerId: null as string | null, convertedAt: null as string | null,
    archivedAt: null, createdAt: "2026-06-01T00:00:00Z",
  },
}));

vi.mock("@/lib/auth-check", () => ({ isAdminRequest: async () => true }));
vi.mock("@/lib/supabase", () => ({ isSupabaseConfigured: h.isSupabaseConfiguredSpy }));
vi.mock("@/lib/auth-provision", () => ({ syncSupabaseAuthPassword: h.syncSpy }));
vi.mock("@/lib/email", () => ({
  notifyApplicationDecision: h.notifySpy,
  portalUrl: () => "https://portal.test",
  isEmailConfigured: h.isEmailConfiguredSpy,
}));
vi.mock("@/lib/data", () => ({
  getCrmContact: vi.fn(async (id: string) => (id === h.contact.id ? h.contact : undefined)),
  updateCrmContact: vi.fn(async (id: string, u: Record<string, unknown>) => { Object.assign(h.contact, u); return h.contact; }),
  getCustomers: vi.fn(async () => []),
  createCustomer: vi.fn(async (c: Record<string, unknown>) => c),
  getCrmActivities: vi.fn(async () => []),
  createCrmActivity: vi.fn(async (a: Record<string, unknown>) => a),
  deleteCrmActivity: vi.fn(async () => true),
}));

import { POST as convertPOST } from "@/app/api/admin/crm/contacts/convert/route";

function req(body: unknown) {
  return new Request("https://x.test/api/admin/crm/contacts/convert", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as never;
}

beforeEach(() => {
  h.isSupabaseConfiguredSpy.mockReturnValue(true);
  h.isEmailConfiguredSpy.mockReturnValue(true);
  h.syncSpy.mockClear();
  h.notifySpy.mockClear();
  Object.assign(h.contact, { convertedAt: null, convertedCustomerId: null, email: "" });
});

describe("convert → welcome + login", () => {
  it("provisions a portal login with the shared temp password", async () => {
    await convertPOST(req({ id: "lead-1", email: "owner@bar.test" }));
    expect(h.syncSpy).toHaveBeenCalledTimes(1);
    const arg = h.syncSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.email).toBe("owner@bar.test");
    expect(arg.password).toBe("guidon");
  });

  it("emails the welcome with the login (approved template + temp password)", async () => {
    const res = await convertPOST(req({ id: "lead-1", email: "owner@bar.test" }));
    expect(h.notifySpy).toHaveBeenCalledTimes(1);
    const arg = h.notifySpy.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.decision).toBe("approved");
    expect(arg.tempPassword).toBe("guidon");
    expect(arg.applicantEmail).toBe("owner@bar.test");
    expect((await res.json()).welcomeEmailed).toBe(true);
  });

  it("reports welcomeEmailed=false when email isn't configured, but still converts", async () => {
    h.isEmailConfiguredSpy.mockReturnValue(false);
    const res = await convertPOST(req({ id: "lead-1", email: "owner@bar.test" }));
    expect(res.status).toBe(201);
    expect((await res.json()).welcomeEmailed).toBe(false);
  });

  it("skips login provisioning when Supabase isn't configured (file mode) but still converts", async () => {
    h.isSupabaseConfiguredSpy.mockReturnValue(false);
    const res = await convertPOST(req({ id: "lead-1", email: "owner@bar.test" }));
    expect(res.status).toBe(201);
    expect(h.syncSpy).not.toHaveBeenCalled();
  });

  it("still converts even if the welcome email throws", async () => {
    h.notifySpy.mockRejectedValueOnce(new Error("resend down"));
    const res = await convertPOST(req({ id: "lead-1", email: "owner@bar.test" }));
    expect(res.status).toBe(201);
    expect((await res.json()).customerId).toBeTruthy();
  });

  it("adopts the existing customer id when the insert loses a unique-email race", async () => {
    // The early dupe check passes (getCustomers empty), then createCustomer
    // 409s on the unique email — a concurrent convert already inserted it. The
    // route must return that EXISTING customer's id, not the local object whose
    // insert failed (which would 404 when Mike opens "the customer").
    const data = await import("@/lib/data");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (data.createCustomer as any).mockRejectedValueOnce(
      new Error('duplicate key value violates unique constraint "customers_email_key"'),
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (data.getCustomers as any)
      .mockResolvedValueOnce([]) // early dupe check
      .mockResolvedValueOnce([{ id: "cust-existing", email: "owner@bar.test", businessName: "X" }]); // adopt
    const res = await convertPOST(req({ id: "lead-1", email: "owner@bar.test" }));
    expect(res.status).toBe(201);
    expect((await res.json()).customerId).toBe("cust-existing");
  });
});
