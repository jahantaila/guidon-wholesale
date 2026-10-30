import { describe, it, expect } from "vitest";
import { computeOrderTotals, invoiceBreakdown, noChargeItems, returnsCreditFor } from "@/lib/order-math";

const half = { productId: "p1", productName: "Kolsch", size: "1/2bbl", quantity: 1, unitPrice: 179, deposit: 50 };
const sixth = { productId: "p2", productName: "Pils", size: "1/6bbl", quantity: 2, unitPrice: 87, deposit: 30 };

describe("returnsCreditFor", () => {
  it("prices each returned size from KEG_DEPOSITS", () => {
    expect(returnsCreditFor([{ size: "1/2bbl", quantity: 1 }, { size: "1/6bbl", quantity: 2 }])).toBe(110);
  });
  it("credits unknown sizes at 0 and ignores negative quantities", () => {
    expect(returnsCreditFor([{ size: "Case of Cans", quantity: 3 }, { size: "1/2bbl", quantity: -1 }])).toBe(0);
  });
  it("is 0 with no returns", () => {
    expect(returnsCreditFor([])).toBe(0);
  });
});

describe("computeOrderTotals", () => {
  it("subtracts the returns credit from the total", () => {
    // 179 + 174 = 353 subtotal; 50 + 60 = 110 deposits; 1 half returned = 50 credit
    expect(computeOrderTotals([half, sixth], [{ size: "1/2bbl", quantity: 1 }])).toEqual({
      subtotal: 353, depositsOut: 110, returnsCredit: 50, totalDeposit: 60, total: 413,
    });
  });
  it("lets the net deposit go negative when more empties come back than go out", () => {
    const t = computeOrderTotals([half], [{ size: "1/2bbl", quantity: 3 }]);
    expect(t.totalDeposit).toBe(-100);
    expect(t.total).toBe(79);
  });
});

describe("invoiceBreakdown", () => {
  it("splits the stored net deposit into charged + returns credit", () => {
    const inv = { items: [half], subtotal: 179, totalDeposit: 0, total: 179 };
    expect(invoiceBreakdown(inv)).toEqual({ subtotal: 179, depositsCharged: 50, returnsCredit: 50, total: 179 });
  });
  it("shows no credit when nothing was returned", () => {
    const inv = { items: [half], subtotal: 179, totalDeposit: 50, total: 229 };
    expect(invoiceBreakdown(inv).returnsCredit).toBe(0);
  });
});

describe("no-charge pricing", () => {
  const items = [{ productId: "p", productName: "Kolsch", size: "1/2bbl", quantity: 4, unitPrice: 150, deposit: 50 }];

  it("noChargeItems zeroes price and deposit but keeps quantity", () => {
    expect(noChargeItems(items)).toEqual([{ ...items[0], unitPrice: 0, deposit: 0 }]);
    expect(items[0].unitPrice).toBe(150); // input untouched
  });

  it("computeOrderTotals with noCharge is all zeros, keg returns included", () => {
    expect(computeOrderTotals(items, [{ size: "1/2bbl", quantity: 2 }], { noCharge: true })).toEqual({
      subtotal: 0, depositsOut: 0, returnsCredit: 0, totalDeposit: 0, total: 0,
    });
  });

  it("without noCharge prices normally", () => {
    expect(computeOrderTotals(items, [], { noCharge: false }).total).toBe(800);
  });
});
