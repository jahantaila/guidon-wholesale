// Regression: orders POST allowed anonymous + empty-cart + bogus-customerId orders
// Found by /qa on 2026-05-20
// Report: .gstack/qa-reports/qa-report-guidon-wholesale-vercel-app-2026-05-20.md
//
// Before the fix, POST /api/orders had no auth check and no input validation.
// Anyone could submit a {} body or empty items and either get a $0 order
// committed to the DB or a raw Postgres FK violation leaked back to the client.
//
// These tests lock in the gate order:
//   401 anonymous → 400 missing customerId → 403 wrong portal customer
//   → 400 empty items → 400 malformed item → 404 missing customer
//
// Mocks are kept minimal so the test exercises the route's validation logic
// directly. We do NOT mock createOrder — the validation always returns BEFORE
// reaching createOrder, so the test would fail if a validation gate falls
// through (good signal).

import { describe, it, expect, vi, beforeEach } from "vitest";

const { getCustomersSpy, createOrderSpy } = vi.hoisted(() => ({
  getCustomersSpy: vi.fn(async () => [
    {
      id: "cust-real",
      businessName: "Test Tavern",
      contactName: "Jane Doe",
      email: "jane@test.example",
      phone: "",
      streetAddress: "", city: "", state: "", zip: "",
      abcPermitNumber: "", preferredPaymentMethod: "no_preference",
      archivedAt: null, createdAt: "2026-01-01T00:00:00Z",
    },
    {
      id: "cust-archived",
      businessName: "Old Place",
      contactName: "X", email: "x@x.com", phone: "",
      streetAddress: "", city: "", state: "", zip: "",
      abcPermitNumber: "", preferredPaymentMethod: "no_preference",
      archivedAt: "2025-12-01T00:00:00Z", createdAt: "2025-01-01T00:00:00Z",
    },
  ]),
  createOrderSpy: vi.fn(async (o: unknown) => o),
}));

vi.mock("@/lib/data", () => ({
  getCustomers: getCustomersSpy,
  createOrder: createOrderSpy,
  createInvoice: vi.fn(async () => undefined),
  getInvoices: vi.fn(async () => []),
  getOrders: vi.fn(async () => []),
  updateOrder: vi.fn(async () => undefined),
  getOrder: vi.fn(async () => undefined),
  updateInvoice: vi.fn(async () => undefined),
  addKegLedgerEntry: vi.fn(async () => undefined),
  adjustProductInventory: vi.fn(async () => 100),
}));

vi.mock("@/lib/email", () => ({
  notifyOrderPlaced: vi.fn(async () => undefined),
  notifyOrderStatusChanged: vi.fn(async () => undefined),
  notifyLowStock: vi.fn(async () => undefined),
  send: vi.fn(async () => undefined),
  formatCurrencyForEmail: (n: number) => `$${n}`,
}));

let adminFlag = true;
let portalCustomerId = "";

vi.mock("@/lib/auth-check", () => ({
  isAdminRequest: () => adminFlag,
  authContext: () => ({ admin: adminFlag, portalCustomerId }),
}));

import { POST } from "@/app/api/orders/route";

function makeRequest(body: Record<string, unknown>): Request {
  return new Request("https://example.test/api/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const VALID_ITEM = {
  productId: "prod-1",
  productName: "Test Beer",
  size: "1/2bbl",
  quantity: 2,
  unitPrice: 179,
  deposit: 50,
};

describe("POST /api/orders — validation regression suite", () => {
  beforeEach(() => {
    adminFlag = true;
    portalCustomerId = "";
    createOrderSpy.mockClear();
    getCustomersSpy.mockClear();
  });

  it("rejects anonymous callers with HTTP 401", async () => {
    adminFlag = false;
    portalCustomerId = "";
    const res = await POST(makeRequest({}) as never);
    expect(res.status).toBe(401);
    expect(createOrderSpy).not.toHaveBeenCalled();
  });

  it("rejects empty body (no customerId) with HTTP 400", async () => {
    const res = await POST(makeRequest({}) as never);
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toMatch(/customerId/i);
    expect(createOrderSpy).not.toHaveBeenCalled();
  });

  it("rejects portal customer ordering for someone else with HTTP 403", async () => {
    adminFlag = false;
    portalCustomerId = "cust-real";
    const res = await POST(
      makeRequest({ customerId: "cust-different", items: [VALID_ITEM] }) as never,
    );
    expect(res.status).toBe(403);
    expect(createOrderSpy).not.toHaveBeenCalled();
  });

  it("rejects empty items array with HTTP 400", async () => {
    const res = await POST(
      makeRequest({ customerId: "cust-real", items: [] }) as never,
    );
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toMatch(/at least one item/i);
    expect(createOrderSpy).not.toHaveBeenCalled();
  });

  it("rejects items missing productId with HTTP 400", async () => {
    const res = await POST(
      makeRequest({
        customerId: "cust-real",
        items: [{ ...VALID_ITEM, productId: "" }],
      }) as never,
    );
    expect(res.status).toBe(400);
    expect(createOrderSpy).not.toHaveBeenCalled();
  });

  it("rejects items with quantity less than 1 with HTTP 400", async () => {
    const res = await POST(
      makeRequest({
        customerId: "cust-real",
        items: [{ ...VALID_ITEM, quantity: 0 }],
      }) as never,
    );
    expect(res.status).toBe(400);
    expect(createOrderSpy).not.toHaveBeenCalled();
  });

  it("rejects items with non-numeric quantity with HTTP 400", async () => {
    const res = await POST(
      makeRequest({
        customerId: "cust-real",
        items: [{ ...VALID_ITEM, quantity: "two" }],
      }) as never,
    );
    expect(res.status).toBe(400);
    expect(createOrderSpy).not.toHaveBeenCalled();
  });

  it("returns HTTP 404 for unknown customerId without leaking Postgres details", async () => {
    const res = await POST(
      makeRequest({
        customerId: "cust-nope",
        items: [VALID_ITEM],
      }) as never,
    );
    expect(res.status).toBe(404);
    const data = (await res.json()) as { error: string };
    // The fix prevents the raw FK message ("violates foreign key constraint")
    // from ever reaching the response.
    expect(data.error).not.toMatch(/foreign key|constraint|relation/i);
    expect(data.error).toMatch(/customer/i);
    expect(createOrderSpy).not.toHaveBeenCalled();
  });

  it("returns HTTP 403 with an archive message when ordering against an archived customer", async () => {
    const res = await POST(
      makeRequest({
        customerId: "cust-archived",
        items: [VALID_ITEM],
      }) as never,
    );
    expect(res.status).toBe(403);
    const data = (await res.json()) as { error: string };
    expect(data.error).toMatch(/archive/i);
    expect(createOrderSpy).not.toHaveBeenCalled();
  });

  it("accepts a valid order from an admin and calls createOrder", async () => {
    const res = await POST(
      makeRequest({
        customerId: "cust-real",
        items: [VALID_ITEM],
        subtotal: 358,
        totalDeposit: 100,
        total: 458,
      }) as never,
    );
    expect(res.status).toBe(201);
    expect(createOrderSpy).toHaveBeenCalledOnce();
    const persisted = createOrderSpy.mock.calls[0][0] as {
      customerId: string;
      items: unknown[];
    };
    expect(persisted.customerId).toBe("cust-real");
    expect(persisted.items).toHaveLength(1);
  });

  it("accepts a valid order from a portal customer placing for themselves", async () => {
    adminFlag = false;
    portalCustomerId = "cust-real";
    const res = await POST(
      makeRequest({
        customerId: "cust-real",
        items: [VALID_ITEM],
      }) as never,
    );
    expect(res.status).toBe(201);
    expect(createOrderSpy).toHaveBeenCalledOnce();
  });
});
