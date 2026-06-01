import { describe, it, expect, vi, beforeEach } from "vitest";

// CRM follow-up fields (2026-05): admin can set nextFollowupDate +
// nextFollowupNotes on a customer via PUT /api/customers. Portal self-edits
// must NOT be able to touch them (admin-only CRM data).

const { updateCustomerSpy, isAdminRequestSpy } = vi.hoisted(() => ({
  updateCustomerSpy: vi.fn(async (id: string, updates: Record<string, unknown>) => ({
    id,
    businessName: "Test Co",
    contactName: "Pat",
    email: "pat@test.co",
    ...updates,
  })),
  isAdminRequestSpy: vi.fn(() => true),
}));

vi.mock("@/lib/data", () => ({
  getCustomers: vi.fn(async () => []),
  createCustomer: vi.fn(async (c: unknown) => c),
  updateCustomer: updateCustomerSpy,
  deleteCustomer: vi.fn(async () => true),
  getOrders: vi.fn(async () => []),
  getInvoices: vi.fn(async () => []),
  getKegLedger: vi.fn(async () => []),
}));
vi.mock("@/lib/auth-check", () => ({
  isAdminRequest: isAdminRequestSpy,
}));
vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => false,
  createAdminClient: () => {
    throw new Error("not used in this test");
  },
}));

import { NextRequest } from "next/server";
import { PUT } from "@/app/api/customers/route";

function makeRequest(body: Record<string, unknown>, cookie?: string): NextRequest {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (cookie) headers["cookie"] = cookie;
  return new NextRequest("https://example.test/api/customers", {
    method: "PUT",
    headers,
    body: JSON.stringify(body),
  });
}

describe("PUT /api/customers — CRM follow-up fields", () => {
  beforeEach(() => {
    updateCustomerSpy.mockClear();
    isAdminRequestSpy.mockReturnValue(true);
  });

  it("admin can set nextFollowupDate + nextFollowupNotes", async () => {
    const res = await PUT(
      makeRequest({
        id: "cust-1",
        nextFollowupDate: "2026-07-15",
        nextFollowupNotes: "Pitch the fall seasonal",
      }) as never,
    );
    expect(res.status).toBe(200);
    const [, updates] = updateCustomerSpy.mock.calls[0];
    expect(updates.nextFollowupDate).toBe("2026-07-15");
    expect(updates.nextFollowupNotes).toBe("Pitch the fall seasonal");
  });

  it("portal self-edit cannot set follow-up CRM fields", async () => {
    isAdminRequestSpy.mockReturnValue(false);
    const res = await PUT(
      makeRequest(
        {
          id: "cust-1",
          contactName: "Pat New",
          nextFollowupDate: "2026-07-15",
          nextFollowupNotes: "sneaky",
        },
        "portal_session=cust-1",
      ) as never,
    );
    expect(res.status).toBe(200);
    const [, updates] = updateCustomerSpy.mock.calls[0];
    expect(updates.contactName).toBe("Pat New");
    expect(updates.nextFollowupDate).toBeUndefined();
    expect(updates.nextFollowupNotes).toBeUndefined();
  });
});
