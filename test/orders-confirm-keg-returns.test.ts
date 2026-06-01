import { describe, it, expect, vi, beforeEach } from "vitest";

// Behavior (2026-05 change): confirming an order auto-posts keg DEPOSITS to
// the customer's ledger, but never posts RETURNS. Keg returns are recorded
// manually by the brewery from the Keg Tracker once the empties are in hand —
// they are never derived from the order. This replaces the prior behavior
// where customer-declared returns posted as status:'pending'.
//
// Even if a (legacy) order carries kegReturns, confirming it must NOT create
// any return ledger entries.

const {
  addKegLedgerEntrySpy,
  getOrderSpy,
  updateOrderSpy,
  getKegLedgerByCustomerSpy,
  adjustProductInventorySpy,
} = vi.hoisted(() => ({
  addKegLedgerEntrySpy: vi.fn(async (entry: unknown) => entry),
  getOrderSpy: vi.fn(),
  updateOrderSpy: vi.fn(async (id: string, updates: Record<string, unknown>) => ({ id, ...updates })),
  getKegLedgerByCustomerSpy: vi.fn(async () => []),
  adjustProductInventorySpy: vi.fn(async () => ({ inventoryCount: 0, parLevel: null })),
}));

vi.mock("@/lib/data", () => ({
  getOrder: getOrderSpy,
  updateOrder: updateOrderSpy,
  addKegLedgerEntry: addKegLedgerEntrySpy,
  getKegLedgerByCustomer: getKegLedgerByCustomerSpy,
  adjustProductInventory: adjustProductInventorySpy,
  getCustomers: vi.fn(async () => []),
  getInvoices: vi.fn(async () => []),
  updateInvoice: vi.fn(async () => undefined),
  getOrders: vi.fn(async () => []),
  createOrder: vi.fn(async (o: unknown) => o),
  createInvoice: vi.fn(async (i: unknown) => i),
}));
vi.mock("@/lib/auth-check", () => ({
  isAdminRequest: () => true,
}));
vi.mock("@/lib/email", () => ({
  notifyOrderPlaced: vi.fn(async () => undefined),
  notifyOrderStatusChanged: vi.fn(async () => undefined),
  notifyLowStock: vi.fn(async () => undefined),
  fireInvoiceEmail: vi.fn(async () => undefined),
}));

import { PUT } from "@/app/api/orders/route";

function makeRequest(body: Record<string, unknown>): Request {
  return new Request("https://example.test/api/orders", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const PENDING_ORDER_WITH_RETURNS = {
  id: "ord-test",
  customerId: "cust-test",
  status: "pending",
  items: [{ productId: "prod-1", productName: "Test", size: "1/2bbl", quantity: 2, unitPrice: 100, deposit: 50 }],
  // Legacy field — even if present, confirming must not post return entries.
  kegReturns: [{ size: "1/2bbl", quantity: 1 }],
  subtotal: 200,
  totalDeposit: 100,
  total: 300,
  notes: "",
  createdAt: new Date().toISOString(),
};

describe("PUT /api/orders confirmation — keg ledger entries", () => {
  beforeEach(() => {
    addKegLedgerEntrySpy.mockClear();
    getOrderSpy.mockReset();
    getKegLedgerByCustomerSpy.mockResolvedValue([]);
  });

  it("does NOT create any RETURN ledger entries on confirm (returns are manual)", async () => {
    getOrderSpy.mockResolvedValue(PENDING_ORDER_WITH_RETURNS);
    const res = await PUT(makeRequest({ id: "ord-test", status: "confirmed" }) as never);
    expect(res.status).toBe(200);

    const calls = addKegLedgerEntrySpy.mock.calls.map((args) => args[0] as Record<string, unknown>);
    const returnEntries = calls.filter((c) => c.type === "return");
    expect(returnEntries.length).toBe(0);
  });

  it("creates DEPOSIT ledger entries with the default 'approved' status (deposits count immediately)", async () => {
    getOrderSpy.mockResolvedValue(PENDING_ORDER_WITH_RETURNS);
    await PUT(makeRequest({ id: "ord-test", status: "confirmed" }) as never);

    const calls = addKegLedgerEntrySpy.mock.calls.map((args) => args[0] as Record<string, unknown>);
    const depositEntries = calls.filter((c) => c.type === "deposit");
    expect(depositEntries.length).toBe(1);
    // Deposits go OUT to the customer the moment the order is confirmed, so
    // they must not be flagged pending.
    expect(depositEntries[0].status).not.toBe("pending");
    expect(depositEntries[0].size).toBe("1/2bbl");
    expect(depositEntries[0].quantity).toBe(2);
  });

  it("handles an order with NO kegReturns and still posts deposits", async () => {
    const orderWithoutReturns = { ...PENDING_ORDER_WITH_RETURNS, kegReturns: [] };
    getOrderSpy.mockResolvedValue(orderWithoutReturns);
    await PUT(makeRequest({ id: "ord-test", status: "confirmed" }) as never);

    const calls = addKegLedgerEntrySpy.mock.calls.map((args) => args[0] as Record<string, unknown>);
    expect(calls.filter((c) => c.type === "return").length).toBe(0);
    expect(calls.filter((c) => c.type === "deposit").length).toBe(1);
  });
});
