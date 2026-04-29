import { describe, it, expect, vi, beforeEach } from "vitest";

// Regression: ISSUE — REQ-5 from 2026-04-29 client request batch.
// Confirming an order with kegReturns must persist the return ledger
// entries as status:'pending', NOT 'approved' (the prior behavior).
// Returns must wait for physical receipt + admin approval from the Keg
// Tracker pending queue before they decrement the customer's outstanding
// balance.
//
// The bug shape: order has kegReturns: [{size:'1/2bbl', quantity:1}],
// admin clicks Confirm, ledger entries created. If status is 'approved'
// (or absent, which defaults to approved), balance drops immediately
// even though the brewery hasn't seen the empties yet — that's the
// regression this test exists to catch.
//
// Found by /qa on 2026-04-29
// Report: .gstack/qa-reports/qa-report-guidon-wholesale-2026-04-29.md

// vi.hoisted so the mock factories can reference these spies (factories
// run before module-level code).
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
  kegReturns: [{ size: "1/2bbl", quantity: 1 }],
  subtotal: 200,
  totalDeposit: 100,
  total: 300,
  notes: "",
  createdAt: new Date().toISOString(),
};

describe("PUT /api/orders confirmation — kegReturns ledger entries", () => {
  beforeEach(() => {
    addKegLedgerEntrySpy.mockClear();
    getOrderSpy.mockReset();
    getKegLedgerByCustomerSpy.mockResolvedValue([]);
  });

  it("creates RETURN ledger entries with status:'pending' (NOT approved)", async () => {
    getOrderSpy.mockResolvedValue(PENDING_ORDER_WITH_RETURNS);
    const res = await PUT(makeRequest({ id: "ord-test", status: "confirmed" }) as never);
    expect(res.status).toBe(200);

    // Pull all calls to addKegLedgerEntry. Filter to type:'return'.
    const calls = addKegLedgerEntrySpy.mock.calls.map((args) => args[0] as Record<string, unknown>);
    const returnEntries = calls.filter((c) => c.type === "return");
    expect(returnEntries.length).toBe(1);
    expect(returnEntries[0].status).toBe("pending");
    // Tracking field — make sure the size + quantity are preserved.
    expect(returnEntries[0].size).toBe("1/2bbl");
    expect(returnEntries[0].quantity).toBe(1);
  });

  it("creates DEPOSIT ledger entries with the default 'approved' status (deposits count immediately)", async () => {
    getOrderSpy.mockResolvedValue(PENDING_ORDER_WITH_RETURNS);
    await PUT(makeRequest({ id: "ord-test", status: "confirmed" }) as never);

    const calls = addKegLedgerEntrySpy.mock.calls.map((args) => args[0] as Record<string, unknown>);
    const depositEntries = calls.filter((c) => c.type === "deposit");
    expect(depositEntries.length).toBe(1);
    // Deposits should NOT carry status:'pending' — they count toward balance
    // the moment the order is confirmed (kegs go OUT to the customer).
    expect(depositEntries[0].status).not.toBe("pending");
  });

  it("notes field on the return entry mentions awaiting brewery confirmation", async () => {
    getOrderSpy.mockResolvedValue(PENDING_ORDER_WITH_RETURNS);
    await PUT(makeRequest({ id: "ord-test", status: "confirmed" }) as never);

    const calls = addKegLedgerEntrySpy.mock.calls.map((args) => args[0] as Record<string, unknown>);
    const returnEntries = calls.filter((c) => c.type === "return");
    expect(returnEntries[0].notes).toMatch(/awaiting brewery confirmation/i);
  });

  it("handles an order with NO kegReturns without creating any return entries", async () => {
    const orderWithoutReturns = { ...PENDING_ORDER_WITH_RETURNS, kegReturns: [] };
    getOrderSpy.mockResolvedValue(orderWithoutReturns);
    await PUT(makeRequest({ id: "ord-test", status: "confirmed" }) as never);

    const calls = addKegLedgerEntrySpy.mock.calls.map((args) => args[0] as Record<string, unknown>);
    const returnEntries = calls.filter((c) => c.type === "return");
    expect(returnEntries.length).toBe(0);
  });
});
