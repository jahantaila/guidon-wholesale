import { describe, it, expect, vi, beforeEach } from "vitest";

// Admin item-editing on a placed order (2026-08-14). A PUT carrying `items`
// edits the order's contents and reconciles everything downstream:
//   - money is recomputed server-side (never trust client totals)
//   - a CONFIRMED order also moves inventory by the per-size delta and rebuilds
//     its keg-deposit ledger; a PENDING order touches neither (stock + deposits
//     don't exist until confirm)
//   - any non-paid invoice is re-synced; a paid one is left alone
//   - completed / cancelled orders can't be edited

const {
  getOrderSpy,
  updateOrderSpy,
  addKegLedgerEntrySpy,
  deleteOrderKegDepositsSpy,
  adjustProductInventorySpy,
  getInvoicesSpy,
  updateInvoiceSpy,
} = vi.hoisted(() => ({
  getOrderSpy: vi.fn(),
  updateOrderSpy: vi.fn(async (id: string, updates: Record<string, unknown>) => ({ id, ...updates })),
  addKegLedgerEntrySpy: vi.fn(async (entry: unknown) => entry),
  deleteOrderKegDepositsSpy: vi.fn(async () => undefined),
  adjustProductInventorySpy: vi.fn(async () => 0),
  getInvoicesSpy: vi.fn(async (): Promise<Record<string, unknown>[]> => []),
  updateInvoiceSpy: vi.fn(async (_id: string, _updates: unknown) => undefined),
}));

vi.mock("@/lib/data", () => ({
  getOrder: getOrderSpy,
  updateOrder: updateOrderSpy,
  addKegLedgerEntry: addKegLedgerEntrySpy,
  deleteOrderKegDeposits: deleteOrderKegDepositsSpy,
  adjustProductInventory: adjustProductInventorySpy,
  getInvoices: getInvoicesSpy,
  updateInvoice: updateInvoiceSpy,
  getKegLedgerByCustomer: vi.fn(async () => []),
  getCustomers: vi.fn(async () => []),
  getOrders: vi.fn(async () => []),
  getProducts: vi.fn(async () => []),
  createOrder: vi.fn(async (o: unknown) => o),
  createInvoice: vi.fn(async (i: unknown) => i),
}));
vi.mock("@/lib/auth-check", () => ({
  isAdminRequest: () => true,
  authContext: async () => ({ admin: true, portalCustomerId: null }),
}));
vi.mock("@/lib/email", () => ({
  notifyOrderPlaced: vi.fn(async () => undefined),
  notifyOrderStatusChanged: vi.fn(async () => undefined),
  notifyLowStock: vi.fn(async () => undefined),
  send: vi.fn(async () => ({ ok: true })),
  formatCurrencyForEmail: (n: number) => `$${n}`,
}));

import { PUT } from "@/app/api/orders/route";

function makeRequest(body: Record<string, unknown>): Request {
  return new Request("https://example.test/api/orders", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const baseOrder = {
  id: "ord-1",
  customerId: "cust-1",
  items: [{ productId: "prod-1", productName: "Kolsch", size: "1/2bbl", quantity: 2, unitPrice: 100, deposit: 50 }],
  kegReturns: [],
  subtotal: 200,
  totalDeposit: 100,
  total: 300,
  notes: "",
  createdAt: new Date().toISOString(),
};

const NEW_ITEMS = [
  { productId: "prod-1", productName: "Kolsch", size: "1/2bbl", quantity: 3, unitPrice: 100, deposit: 50 },
];

beforeEach(() => {
  getOrderSpy.mockReset();
  updateOrderSpy.mockClear();
  addKegLedgerEntrySpy.mockClear();
  deleteOrderKegDepositsSpy.mockClear();
  adjustProductInventorySpy.mockClear();
  getInvoicesSpy.mockReset();
  getInvoicesSpy.mockResolvedValue([]);
  updateInvoiceSpy.mockClear();
});

describe("PUT /api/orders — item edit", () => {
  it("recomputes totals server-side from the new items", async () => {
    getOrderSpy.mockResolvedValue({ ...baseOrder, status: "pending" });
    const res = await PUT(makeRequest({ id: "ord-1", items: NEW_ITEMS }) as never);
    expect(res.status).toBe(200);
    const [, updates] = updateOrderSpy.mock.calls[0];
    // 3 × $100 = 300 subtotal; 3 × $50 = 150 deposits; total 450.
    expect(updates.subtotal).toBe(300);
    expect(updates.totalDeposit).toBe(150);
    expect(updates.total).toBe(450);
  });

  it("does NOT move inventory or the ledger for a PENDING order", async () => {
    getOrderSpy.mockResolvedValue({ ...baseOrder, status: "pending" });
    await PUT(makeRequest({ id: "ord-1", items: NEW_ITEMS }) as never);
    expect(adjustProductInventorySpy).not.toHaveBeenCalled();
    expect(deleteOrderKegDepositsSpy).not.toHaveBeenCalled();
    expect(addKegLedgerEntrySpy).not.toHaveBeenCalled();
  });

  it("moves inventory by the per-size DELTA for a CONFIRMED order", async () => {
    getOrderSpy.mockResolvedValue({ ...baseOrder, status: "confirmed" });
    await PUT(makeRequest({ id: "ord-1", items: NEW_ITEMS }) as never);
    // qty 2 → 3 means one more keg out: inventory decrements by 1.
    expect(adjustProductInventorySpy).toHaveBeenCalledWith("prod-1", "1/2bbl", -1);
  });

  it("rebuilds the deposit ledger for a CONFIRMED order (delete + repost)", async () => {
    getOrderSpy.mockResolvedValue({ ...baseOrder, status: "confirmed" });
    await PUT(makeRequest({ id: "ord-1", items: NEW_ITEMS }) as never);
    expect(deleteOrderKegDepositsSpy).toHaveBeenCalledWith("ord-1");
    const deposits = addKegLedgerEntrySpy.mock.calls
      .map((c) => c[0] as Record<string, unknown>)
      .filter((e) => e.type === "deposit");
    expect(deposits).toHaveLength(1);
    expect(deposits[0].quantity).toBe(3);
  });

  it("restores inventory when a size's quantity drops", async () => {
    getOrderSpy.mockResolvedValue({ ...baseOrder, status: "confirmed" });
    const fewer = [{ ...NEW_ITEMS[0], quantity: 1 }]; // 2 → 1
    await PUT(makeRequest({ id: "ord-1", items: fewer }) as never);
    // One fewer keg out: inventory goes back up by 1 (delta -1 → adjust +1).
    expect(adjustProductInventorySpy).toHaveBeenCalledWith("prod-1", "1/2bbl", 1);
  });

  it("syncs a non-paid invoice but leaves a paid one alone", async () => {
    getOrderSpy.mockResolvedValue({ ...baseOrder, status: "confirmed" });
    getInvoicesSpy.mockResolvedValue([
      { id: "inv-unpaid", orderId: "ord-1", status: "unpaid" },
      { id: "inv-paid", orderId: "ord-1", status: "paid" },
      { id: "inv-other", orderId: "ord-2", status: "unpaid" },
    ]);
    await PUT(makeRequest({ id: "ord-1", items: NEW_ITEMS }) as never);
    const invoiceIds = updateInvoiceSpy.mock.calls.map((c) => c[0]);
    expect(invoiceIds).toContain("inv-unpaid");
    expect(invoiceIds).not.toContain("inv-paid");
    expect(invoiceIds).not.toContain("inv-other");
  });

  it("rejects an edit that would empty the order", async () => {
    getOrderSpy.mockResolvedValue({ ...baseOrder, status: "pending" });
    const res = await PUT(makeRequest({ id: "ord-1", items: [] }) as never);
    expect(res.status).toBe(400);
  });

  it("refuses to edit a completed order", async () => {
    getOrderSpy.mockResolvedValue({ ...baseOrder, status: "completed" });
    const res = await PUT(makeRequest({ id: "ord-1", items: NEW_ITEMS }) as never);
    expect(res.status).toBe(409);
  });

  it("computes returns credit from KEG_DEPOSITS, not the edited items", async () => {
    // The order returns a 1/2bbl empty, but the edited items are all 1/6bbl.
    // Credit must stay KEG_DEPOSITS['1/2bbl']=50 (how checkout priced it), not
    // collapse to 0 just because no 1/2bbl line item remains — otherwise the
    // customer is silently overbilled.
    getOrderSpy.mockResolvedValue({ ...baseOrder, status: "pending", kegReturns: [{ size: "1/2bbl", quantity: 1 }] });
    const items = [{ productId: "prod-1", productName: "Kolsch", size: "1/6bbl", quantity: 2, unitPrice: 100, deposit: 30 }];
    await PUT(makeRequest({ id: "ord-1", items }) as never);
    const [, updates] = updateOrderSpy.mock.calls[0];
    // subtotal 200, depositsOut 60, returnsCredit 50, totalDeposit 10, total 210
    expect(updates.totalDeposit).toBe(10);
    expect(updates.total).toBe(210);
  });

  it("returns 500 (not a false success) when the item write fails to persist", async () => {
    getOrderSpy.mockResolvedValue({ ...baseOrder, status: "pending" });
    updateOrderSpy.mockResolvedValueOnce(undefined as never);
    const res = await PUT(makeRequest({ id: "ord-1", items: NEW_ITEMS }) as never);
    expect(res.status).toBe(500);
  });
});

describe("PUT /api/orders — keg deposit cleanup on cancel/revert", () => {
  it("removes the order's keg deposits when a CONFIRMED order is cancelled", async () => {
    getOrderSpy.mockResolvedValue({ ...baseOrder, status: "confirmed" });
    await PUT(makeRequest({ id: "ord-1", status: "cancelled" }) as never);
    expect(deleteOrderKegDepositsSpy).toHaveBeenCalledWith("ord-1");
  });

  it("removes the order's keg deposits when a CONFIRMED order is reverted to pending", async () => {
    getOrderSpy.mockResolvedValue({ ...baseOrder, status: "confirmed" });
    await PUT(makeRequest({ id: "ord-1", status: "pending" }) as never);
    expect(deleteOrderKegDepositsSpy).toHaveBeenCalledWith("ord-1");
  });

  it("does NOT touch deposits when cancelling a PENDING order (none were posted)", async () => {
    getOrderSpy.mockResolvedValue({ ...baseOrder, status: "pending" });
    await PUT(makeRequest({ id: "ord-1", status: "cancelled" }) as never);
    expect(deleteOrderKegDepositsSpy).not.toHaveBeenCalled();
  });
});
