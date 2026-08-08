import { describe, it, expect, vi, beforeEach } from "vitest";

// REGRESSION — 2026-08-07.
//
// Order placement had NO inventory check. Stock was only decremented later,
// when an admin confirmed the order, and adjustProductInventory clamps at
// zero — so a size with 1 case on hand accepted an order for 2 and the
// shortfall left no trace. Reported after a Kolsch was oversold.

const { createOrderSpy, getProductsSpy, authContextSpy } = vi.hoisted(() => ({
  createOrderSpy: vi.fn(async (o: unknown) => o),
  getProductsSpy: vi.fn(async () => [
    {
      id: "prod-kolsch",
      name: "Kolsch",
      available: true,
      sizes: [
        { size: "1/2bbl", price: 180, deposit: 50, inventoryCount: 1, available: true },
        { size: "1/6bbl", price: 90, deposit: 30, inventoryCount: 0, available: true },
      ],
    },
    {
      id: "prod-retired",
      name: "Retired Ale",
      available: false,
      sizes: [{ size: "1/2bbl", price: 180, deposit: 50, inventoryCount: 9, available: true }],
    },
  ]),
  authContextSpy: vi.fn(async () => ({ admin: false, portalCustomerId: "cust-1" })),
}));

vi.mock("@/lib/auth-check", () => ({
  authContext: authContextSpy,
  isAdminRequest: vi.fn(async () => false),
}));
vi.mock("@/lib/data", () => ({
  getProducts: getProductsSpy,
  getOrders: vi.fn(async () => []),
  createOrder: createOrderSpy,
  updateOrder: vi.fn(async () => undefined),
  getOrder: vi.fn(async () => undefined),
  createInvoice: vi.fn(async () => undefined),
  getInvoices: vi.fn(async () => []),
  updateInvoice: vi.fn(async () => undefined),
  addKegLedgerEntry: vi.fn(async () => undefined),
  adjustProductInventory: vi.fn(async () => 0),
  getCustomers: vi.fn(async () => [
    { id: "cust-1", businessName: "Salty Landing", contactName: "Pat", email: "p@x.test" },
  ]),
}));
vi.mock("@/lib/email", () => ({
  notifyOrderPlaced: vi.fn(async () => undefined),
  notifyOrderStatusChanged: vi.fn(async () => undefined),
  notifyLowStock: vi.fn(async () => undefined),
  send: vi.fn(async () => ({ ok: true })),
  formatCurrencyForEmail: (n: number) => `$${n}`,
}));

import { POST } from "@/app/api/orders/route";

function order(items: { productId: string; productName: string; size: string; quantity: number }[]) {
  return new Request("https://example.test/api/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ customerId: "cust-1", items }),
  });
}

const KOLSCH_HALF = { productId: "prod-kolsch", productName: "Kolsch", size: "1/2bbl" };

describe("POST /api/orders — inventory cap", () => {
  beforeEach(() => {
    createOrderSpy.mockClear();
    authContextSpy.mockResolvedValue({ admin: false, portalCustomerId: "cust-1" });
  });

  it("rejects ordering more than the on-hand count", async () => {
    // The exact reported bug: 1 case on hand, customer orders 2.
    const res = await POST(order([{ ...KOLSCH_HALF, quantity: 2 }]) as never);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/only 1 left/i);
    expect(createOrderSpy).not.toHaveBeenCalled();
  });

  it("allows ordering exactly the on-hand count", async () => {
    const res = await POST(order([{ ...KOLSCH_HALF, quantity: 1 }]) as never);
    expect(res.status).toBe(201);
    expect(createOrderSpy).toHaveBeenCalledTimes(1);
  });

  it("rejects a size that is out of stock", async () => {
    const res = await POST(
      order([{ productId: "prod-kolsch", productName: "Kolsch", size: "1/6bbl", quantity: 1 }]) as never,
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/out of stock/i);
  });

  it("rejects an unavailable product even when stock is positive", async () => {
    const res = await POST(
      order([
        { productId: "prod-retired", productName: "Retired Ale", size: "1/2bbl", quantity: 1 },
      ]) as never,
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/not currently available/i);
  });

  it("sums duplicate line items for the same product+size before checking", async () => {
    // Two lines of 1 each against 1 on hand must fail; checking them
    // independently would let this through.
    const res = await POST(
      order([
        { ...KOLSCH_HALF, quantity: 1 },
        { ...KOLSCH_HALF, quantity: 1 },
      ]) as never,
    );
    expect(res.status).toBe(409);
    expect(createOrderSpy).not.toHaveBeenCalled();
  });

  it("rejects an item that is no longer in the catalog", async () => {
    const res = await POST(
      order([{ productId: "prod-gone", productName: "Ghost IPA", size: "1/2bbl", quantity: 1 }]) as never,
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/no longer in the catalog/i);
  });

  it("reports every problem at once rather than one at a time", async () => {
    const res = await POST(
      order([
        { ...KOLSCH_HALF, quantity: 5 },
        { productId: "prod-kolsch", productName: "Kolsch", size: "1/6bbl", quantity: 1 },
      ]) as never,
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.outOfStock).toHaveLength(2);
  });

  it("applies the cap to admin-placed orders too", async () => {
    authContextSpy.mockResolvedValue({ admin: true, portalCustomerId: "" });
    const res = await POST(order([{ ...KOLSCH_HALF, quantity: 2 }]) as never);
    expect(res.status).toBe(409);
  });
});
