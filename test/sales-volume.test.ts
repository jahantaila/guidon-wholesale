import { describe, it, expect } from "vitest";
import { unitVolumeGallons, GALLONS_PER_BARREL, buildSalesReport, salesReportToCsv } from "@/lib/sales-report";
import type { Order, Product } from "@/lib/types";

// Gallons/barrels columns on the sales report. Keg sizes are barrel fractions
// and convert exactly. Mike's volumes (Sept 2026 text thread) for the rest:
// case of cans = 3 gal, mixed four-pack = 0.5 gal, 50 L keg = 13.2 gal.

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

  it("returns 0 for unknown packages and junk (no invented volume)", () => {
    expect(unitVolumeGallons("Mixed Case")).toBe(0); // no "can" — not Mike's case of cans
    expect(unitVolumeGallons("12-pack")).toBe(0);
    expect(unitVolumeGallons("")).toBe(0);
    expect(unitVolumeGallons("bbl")).toBe(0); // no number
  });

  it("case of cans = 3 gallons, including the spellings in production", () => {
    // Exact size strings found in production order_items, typos included —
    // historical orders keep the typo'd label, so the report must read them.
    expect(unitVolumeGallons("Case of Cans, 16oz")).toBe(3);
    expect(unitVolumeGallons("Cas of Cans, 16oz")).toBe(3);
    expect(unitVolumeGallons("Case of Cane, 16oz")).toBe(3);
    expect(unitVolumeGallons("Case of 16oz Cans")).toBe(3);
    expect(unitVolumeGallons("cans")).toBe(3); // the case size's old label
  });

  it("mixed four-pack = 0.5 gallon, including the 'Oack' typo", () => {
    expect(unitVolumeGallons("4 Pack of Pilsner")).toBe(0.5);
    expect(unitVolumeGallons("4 Pack of Kolsch")).toBe(0.5);
    expect(unitVolumeGallons("4 Oack of Bandera")).toBe(0.5);
    expect(unitVolumeGallons("4-pack")).toBe(0.5);
    expect(unitVolumeGallons("Four Pack")).toBe(0.5);
  });

  it("50 L keg = 13.2 gallons", () => {
    expect(unitVolumeGallons("50L")).toBe(13.2);
    expect(unitVolumeGallons("50 L")).toBe(13.2);
    expect(unitVolumeGallons("50 Liter")).toBe(13.2);
    expect(unitVolumeGallons("50 litre keg")).toBe(13.2);
  });

  it("does NOT grab a stray number from barrel-worded free-text sizes", () => {
    // The number must be adjacent to the unit — regression guard against a
    // parser that read "16" barrels out of a barrel-aged can case.
    // A case of cans is 3 gal, never 16 barrels.
    expect(unitVolumeGallons("Barrel-Aged Case of 16oz Cans")).toBe(3);
    expect(unitVolumeGallons("Bourbon Barrel Aged Stout 12-pack")).toBe(0);
    expect(unitVolumeGallons("Half Barrel")).toBe(0); // no digit → not counted
    expect(unitVolumeGallons("Barrel Select 4-pack")).toBe(0.5);
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
  it("sums gallons per row and overall, ignoring unknown packages", () => {
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

  it("one case + one four-pack + one 50 L keg = 3 + 0.5 + 13.2 = 16.7 gal", () => {
    // Mike's acceptance case.
    const report = buildSalesReport(
      [order("o1", [
        { size: "Case of Cans, 16oz", quantity: 1 },
        { size: "4 Pack of Pilsner", quantity: 1 },
        { size: "50L", quantity: 1 },
      ])],
      products,
    );
    expect(report.totalGallons).toBeCloseTo(16.7, 6);
    expect(report.totalGallons / GALLONS_PER_BARREL).toBeCloseTo(16.7 / 31, 6);
    const csv = salesReportToCsv(report);
    expect(csv.split("\n").pop()).toContain('"16.7","0.54"');
  });

  it("multiplies each package's volume by quantity", () => {
    const report = buildSalesReport(
      [order("o1", [
        { size: "Case of Cans, 16oz", quantity: 4 },
        { size: "4 Pack of Kolsch", quantity: 6 },
        { size: "50L", quantity: 2 },
      ])],
      products,
    );
    expect(report.rows.find((r) => r.packageType === "Case of Cans, 16oz")!.gallons).toBe(12);
    expect(report.rows.find((r) => r.packageType === "4 Pack of Kolsch")!.gallons).toBe(3);
    expect(report.rows.find((r) => r.packageType === "50L")!.gallons).toBeCloseTo(26.4, 6);
    expect(report.totalGallons).toBeCloseTo(41.4, 6);
  });
});
