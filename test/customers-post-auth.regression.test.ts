import { describe, it, expect, vi, beforeEach } from "vitest";

// REGRESSION — 2026-08-07.
//
// POST /api/customers had no auth guard at all, while GET/PUT/DELETE in the
// same file each had one. It also lives outside /api/admin/*, so middleware
// did not cover it either. Two anonymous attacks followed:
//
//   1. Account creation. The handler provisions a Supabase Auth user with a
//      caller-supplied password and email_confirm: true, so anyone could mint
//      a working wholesale portal login.
//   2. Customer disclosure. Posting an email that already existed returned
//      that customer's full record (name, phone, address, ABC permit number)
//      by design, as an idempotency convenience for the application-approval
//      flow. Unauthenticated, that is a lookup oracle.

const { isAdminRequestSpy, createCustomerSpy, getCustomersSpy } = vi.hoisted(() => ({
  isAdminRequestSpy: vi.fn(async () => true),
  createCustomerSpy: vi.fn(async (c: unknown) => c),
  getCustomersSpy: vi.fn(async () => [
    {
      id: "cust-existing",
      businessName: "Salty Landing",
      contactName: "Pat",
      email: "orders@saltylanding.test",
      phone: "8285551234",
      abcPermitNumber: "ABC-9911",
      password: "hunter2",
    },
  ]),
}));

vi.mock("@/lib/auth-check", () => ({ isAdminRequest: isAdminRequestSpy }));
vi.mock("@/lib/data", () => ({
  getCustomers: getCustomersSpy,
  createCustomer: createCustomerSpy,
  updateCustomer: vi.fn(async () => undefined),
  deleteCustomer: vi.fn(async () => true),
  getOrders: vi.fn(async () => []),
  getInvoices: vi.fn(async () => []),
  getKegLedger: vi.fn(async () => []),
}));
vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => false,
  createAdminClient: () => {
    throw new Error("not configured in test");
  },
}));

import { POST } from "@/app/api/customers/route";

function makeRequest(body: Record<string, unknown>): Request {
  return new Request("https://example.test/api/customers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const VALID = {
  businessName: "Attacker Bar",
  contactName: "Mal",
  email: "mal@evil.test",
  password: "chosen-by-attacker",
};

describe("POST /api/customers — admin guard", () => {
  beforeEach(() => {
    createCustomerSpy.mockClear();
    isAdminRequestSpy.mockResolvedValue(true);
  });

  it("rejects anonymous callers with 403 and creates nothing", async () => {
    isAdminRequestSpy.mockResolvedValue(false);
    const res = await POST(makeRequest(VALID) as never);
    expect(res.status).toBe(403);
    expect(createCustomerSpy).not.toHaveBeenCalled();
  });

  it("does not leak an existing customer's record to an anonymous caller", async () => {
    isAdminRequestSpy.mockResolvedValue(false);
    const res = await POST(
      makeRequest({ ...VALID, email: "orders@saltylanding.test" }) as never,
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(JSON.stringify(body)).not.toContain("Salty Landing");
    expect(JSON.stringify(body)).not.toContain("ABC-9911");
    expect(JSON.stringify(body)).not.toContain("8285551234");
  });

  it("still lets an authenticated admin create a customer", async () => {
    const res = await POST(makeRequest(VALID) as never);
    expect(res.status).toBe(201);
    expect(createCustomerSpy).toHaveBeenCalledTimes(1);
  });
});
