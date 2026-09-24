import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { buildSalesReport, orderReportDay } from "@/lib/sales-report";
import type { Order, Product } from "@/lib/types";

// Late-entry month attribution (Mike, Sept 2026): a brewery order entered
// after month-end must be countable in the previous month's report without
// editing its real creation timestamp, and must never count in both months.

const products = [{ id: "p1", name: "Kolsch", style: "Kolsch", sizes: [] }] as unknown as Product[];

function order(overrides: Partial<Order>): Order {
  return {
    id: "o1",
    customerId: "c1",
    status: "completed",
    createdAt: "2026-09-02T14:00:00Z", // Sept 2, 10am Eastern
    reportingDate: null,
    items: [{ productId: "p1", productName: "Kolsch", size: "1/2bbl", quantity: 1, unitPrice: 100, deposit: 50 }],
    kegReturns: [],
    subtotal: 100,
    totalDeposit: 50,
    total: 150,
    notes: "",
    ...overrides,
  } as Order;
}

const AUGUST = { from: "2026-08-01", to: "2026-08-31" };
const SEPTEMBER = { from: "2026-09-01", to: "2026-09-30" };

describe("orderReportDay", () => {
  it("uses the reporting date when one is set", () => {
    expect(orderReportDay(order({ reportingDate: "2026-08-31" }))).toBe("2026-08-31");
  });

  it("falls back to the brewery-local placed day", () => {
    // 00:30 UTC Sept 1 is still Aug 31 in Hendersonville.
    expect(orderReportDay(order({ createdAt: "2026-09-01T00:30:00Z" }))).toBe("2026-08-31");
    expect(orderReportDay(order({ reportingDate: undefined }))).toBe("2026-09-02");
  });
});

describe("sales report month attribution", () => {
  it("a late-entered order with an August reporting date lands in August only", () => {
    const late = order({ reportingDate: "2026-08-31" });
    const aug = buildSalesReport([late], products, [], AUGUST);
    const sep = buildSalesReport([late], products, [], SEPTEMBER);
    expect(aug.orderCount).toBe(1);
    expect(aug.totalGallons).toBeCloseTo(15.5, 6);
    expect(sep.orderCount).toBe(0);
    expect(sep.totalGallons).toBe(0);
  });

  it("without a reporting date the same order stays in the month it was placed", () => {
    const normal = order({});
    expect(buildSalesReport([normal], products, [], AUGUST).orderCount).toBe(0);
    expect(buildSalesReport([normal], products, [], SEPTEMBER).orderCount).toBe(1);
  });

  it("never mutates createdAt", () => {
    const late = order({ reportingDate: "2026-08-31" });
    buildSalesReport([late], products, [], AUGUST);
    expect(late.createdAt).toBe("2026-09-02T14:00:00Z");
  });
});

// ─── Data layer (file fallback): audit trail ────────────────────────────────

describe("setOrderReportingDate (file store)", () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "guidon-rd-"));
    fs.mkdirSync(path.join(dir, "data"));
    fs.writeFileSync(path.join(dir, "data", "orders.json"), JSON.stringify([order({})]));
    vi.spyOn(process, "cwd").mockReturnValue(dir);
    vi.resetModules();
    vi.doMock("@/lib/supabase", () => ({ isSupabaseConfigured: () => false, createAdminClient: () => null }));
  });

  afterEach(() => {
    vi.doUnmock("@/lib/supabase");
    vi.restoreAllMocks();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("stores the date, keeps createdAt, and records each change", async () => {
    const data = await import("@/lib/data");
    const updated = await data.setOrderReportingDate("o1", "2026-08-31");
    expect(updated?.reportingDate).toBe("2026-08-31");
    expect(updated?.createdAt).toBe("2026-09-02T14:00:00Z");

    await data.setOrderReportingDate("o1", null);
    const history = await data.getOrderReportingDateChanges("o1");
    expect(history.map((h) => [h.previousDate, h.newDate])).toEqual(
      expect.arrayContaining([
        ["2026-08-31", null],
        [null, "2026-08-31"],
      ]),
    );
    expect(history).toHaveLength(2);
  });

  it("a no-op change writes no audit row", async () => {
    const data = await import("@/lib/data");
    await data.setOrderReportingDate("o1", null);
    expect(await data.getOrderReportingDateChanges("o1")).toHaveLength(0);
  });

  it("returns undefined for an unknown order", async () => {
    const data = await import("@/lib/data");
    expect(await data.setOrderReportingDate("nope", "2026-08-31")).toBeUndefined();
  });
});
