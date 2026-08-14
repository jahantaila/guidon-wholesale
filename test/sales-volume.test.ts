import { describe, it, expect } from "vitest";
import { unitVolumeGallons, GALLONS_PER_BARREL, buildSalesReport } from "@/lib/sales-report";
import type { Order, Product } from "@/lib/types";

// Gallons/barrels columns on the sales report. Keg sizes are barrel fractions
// and convert exactly; non-keg packages carry no keg volume and count as 0.

describe("unitVolumeGallons", () => {
  it("converts the standard keg fractions exactly", () => {
    expect(unitVolumeGallons("1/2bbl")).toBeCloseTo(15.5, 5);
    expect(unitVolumeGallons("1/4bbl")).toBeCloseTo(7.75, 5);
    expect(unitVolumeGallons("1/6bbl")).toBeCloseTo(GALLONS_PER_BARREL / 6, 5);
  });

  it("handles spacing and 'barrel' spellings", () => {
    expect(unitVolumeGallons("1/2 bbl")).toBeCloseTo(15.5, 5);
    expect(unitVolumeGallons("1/2 Barrel")).toBeCloseTo(15.5, 5);
    expect(unitVolumeGallons("1 barrel")).toBeCloseTo(31, 5);
    expect(unitVolumeGallons("1bbl")).toBeCloseTo(31, 5);
  });

  it("returns 0 for non-keg packages and junk (no invented volume)", () => {
    expect(unitVolumeGallons("Mixed Case")).toBe(0);
    expect(unitVolumeGallons("12-pack")).toBe(0);
    expect(unitVolumeGallons("Case of 16oz Cans")).toBe(0);
    expect(unitVolumeGallons("")).toBe(0);
    expect(unitVolumeGallons("bbl")).toBe(0); // no number
  });

  it("does NOT grab a stray number from barrel-worded free-text sizes", () => {
    // The number must be adjacent to the unit — regression guard against a
    // parser that read "16" barrels out of a barrel-aged can case.
    expect(unitVolumeGallons("Barrel-Aged Case of 16oz Cans")).toBe(0);
    expect(unitVolumeGallons("Bourbon Barrel Aged Stout 12-pack")).toBe(0);
    expect(unitVolumeGallons("Half Barrel")).toBe(0); // no digit → not counted
    expect(unitVolumeGallons("Barrel Select 4-pack")).toBe(0);
  });
});

const products = [{ id: "p1", name: "Kolsch", style: "Kolsch", sizes: [] }] as unknown as Product[];

function order(id: string, items: { size: string; quantity: number }[]): Order {
  return {
    id,
    customerId: "c1",
    status: "completed",
    createdAt: "2026-08-01T12:00:00Z",
    items: items.map((i) => ({ productId: "p1", productName: "Kolsch", size: i.size, quantity: i.quantity, unitPrice: 100, deposit: 50 })),
    kegReturns: [],
    subtotal: 0,
    totalDeposit: 0,
    total: 0,
    notes: "",
  } as unknown as Order;
}

describe("buildSalesReport gallons totals", () => {
  it("sums gallons per row and overall, ignoring non-keg volume", () => {
    const report = buildSalesReport(
      [order("o1", [{ size: "1/2bbl", quantity: 2 }, { size: "1/6bbl", quantity: 1 }, { size: "Mixed Case", quantity: 5 }])],
      products,
    );
    // 2 × 15.5 + 1 × (31/6) + 5 × 0
    expect(report.totalGallons).toBeCloseTo(31 + GALLONS_PER_BARREL / 6, 4);

    const half = report.rows.find((r) => r.packageType === "1/2bbl")!;
    expect(half.gallons).toBeCloseTo(31, 4);
    const mixed = report.rows.find((r) => r.packageType === "Mixed Case")!;
    expect(mixed.gallons).toBe(0);
  });
});
