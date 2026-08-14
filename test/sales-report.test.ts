import { describe, it, expect } from "vitest";
import {
  buildSalesReport,
  salesReportToCsv,
  salesReportFilename,
  breweryLocalDate,
} from "@/lib/sales-report";
import type { Order, Product, Customer } from "@/lib/types";

// Sales-by-style report. Covers both paths of every conditional per CLAUDE.md.

const products = [
  { id: "prod-kolsch", name: "Kolsch", style: "German Kolsch", sizes: [] },
  { id: "prod-pils", name: "Pilsner", style: "German Pilsner", sizes: [] },
] as unknown as Product[];

const customers = [
  { id: "cust-1", businessName: "Salty Landing" },
  { id: "cust-2", businessName: "Ecusta Market" },
] as unknown as Customer[];

function order(
  id: string,
  createdAt: string,
  items: { productId: string; size: string; quantity: number; unitPrice?: number }[],
  status = "completed",
  customerId = "cust-1",
): Order {
  return {
    id,
    customerId,
    status,
    createdAt,
    items: items.map((i) => ({
      productId: i.productId,
      productName: "x",
      size: i.size,
      quantity: i.quantity,
      unitPrice: i.unitPrice ?? 100,
      deposit: 50,
    })),
    kegReturns: [],
    subtotal: 0,
    totalDeposit: 0,
    total: 0,
    notes: "",
  } as unknown as Order;
}

describe("breweryLocalDate", () => {
  it("buckets a late-evening Eastern order into that same local day", () => {
    // 8pm Eastern on Aug 7 is 00:00 UTC Aug 8. Slicing the ISO string would
    // file it under Aug 8 and drop it out of an Aug 1-7 report.
    expect(breweryLocalDate("2026-08-08T00:30:00.000Z")).toBe("2026-08-07");
  });

  it("handles a normal midday timestamp", () => {
    expect(breweryLocalDate("2026-08-07T15:00:00.000Z")).toBe("2026-08-07");
  });

  it("returns empty string for an unparseable timestamp", () => {
    expect(breweryLocalDate("not-a-date")).toBe("");
  });
});

describe("buildSalesReport — grouping", () => {
  it("groups by style and package type, summing quantities", () => {
    const r = buildSalesReport(
      [
        order("o1", "2026-08-01T15:00:00Z", [
          { productId: "prod-kolsch", size: "1/6bbl", quantity: 2 },
        ]),
        order("o2", "2026-08-02T15:00:00Z", [
          { productId: "prod-kolsch", size: "1/6bbl", quantity: 3 },
        ]),
      ],
      products,
    );
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({
      style: "German Kolsch",
      packageType: "1/6bbl",
      quantity: 5,
      orderCount: 2,
    });
    expect(r.totalQuantity).toBe(5);
  });

  it("keeps the same style in different packages as separate rows", () => {
    const r = buildSalesReport(
      [
        order("o1", "2026-08-01T15:00:00Z", [
          { productId: "prod-kolsch", size: "1/6bbl", quantity: 2 },
          { productId: "prod-kolsch", size: "Case of Cans, 16oz", quantity: 9 },
        ]),
      ],
      products,
    );
    expect(r.rows).toHaveLength(2);
    // Sorted by quantity descending — biggest seller first.
    expect(r.rows[0].packageType).toBe("Case of Cans, 16oz");
    expect(r.rows[0].quantity).toBe(9);
  });

  it("counts one order once even when it has several matching line items", () => {
    const r = buildSalesReport(
      [
        order("o1", "2026-08-01T15:00:00Z", [
          { productId: "prod-kolsch", size: "1/6bbl", quantity: 2 },
          { productId: "prod-kolsch", size: "1/6bbl", quantity: 1 },
        ]),
      ],
      products,
    );
    expect(r.rows[0].quantity).toBe(3);
    expect(r.rows[0].orderCount).toBe(1);
    expect(r.orderCount).toBe(1);
  });

  it("computes revenue from unit price only, excluding refundable deposits", () => {
    const r = buildSalesReport(
      [
        order("o1", "2026-08-01T15:00:00Z", [
          { productId: "prod-pils", size: "1/2bbl", quantity: 2, unitPrice: 180 },
        ]),
      ],
      products,
    );
    expect(r.rows[0].revenue).toBe(360);
    expect(r.totalRevenue).toBe(360);
  });
});

describe("buildSalesReport — date range", () => {
  const orders = [
    order("before", "2026-07-31T15:00:00Z", [{ productId: "prod-pils", size: "1/2bbl", quantity: 1 }]),
    order("inside", "2026-08-03T15:00:00Z", [{ productId: "prod-pils", size: "1/2bbl", quantity: 5 }]),
    order("after", "2026-08-20T15:00:00Z", [{ productId: "prod-pils", size: "1/2bbl", quantity: 9 }]),
  ];

  it("includes only orders within the range", () => {
    const r = buildSalesReport(orders, products, [], { from: "2026-08-01", to: "2026-08-07" });
    expect(r.totalQuantity).toBe(5);
  });

  it("treats both bounds as inclusive", () => {
    const r = buildSalesReport(orders, products, [], { from: "2026-08-03", to: "2026-08-03" });
    expect(r.totalQuantity).toBe(5);
  });

  it("includes a late-evening order on the final day of the range", () => {
    // The regression this guards: 8pm Eastern Aug 7 stored as Aug 8 UTC.
    const late = order("late", "2026-08-08T01:00:00Z", [
      { productId: "prod-pils", size: "1/2bbl", quantity: 4 },
    ]);
    const r = buildSalesReport([late], products, [], { from: "2026-08-01", to: "2026-08-07" });
    expect(r.totalQuantity).toBe(4);
  });

  it("an open-ended range applies only the bound that was given", () => {
    expect(buildSalesReport(orders, products, [], { from: "2026-08-01" }).totalQuantity).toBe(14);
    expect(buildSalesReport(orders, products, [], { to: "2026-08-07" }).totalQuantity).toBe(6);
    expect(buildSalesReport(orders, products, [], {}).totalQuantity).toBe(15);
  });
});

describe("buildSalesReport — status filtering", () => {
  const orders = [
    order("done", "2026-08-01T15:00:00Z", [{ productId: "prod-pils", size: "1/2bbl", quantity: 3 }], "completed"),
    order("void", "2026-08-01T15:00:00Z", [{ productId: "prod-pils", size: "1/2bbl", quantity: 7 }], "cancelled"),
    order("new", "2026-08-01T15:00:00Z", [{ productId: "prod-pils", size: "1/2bbl", quantity: 1 }], "pending"),
  ];

  it("excludes cancelled orders by default", () => {
    expect(buildSalesReport(orders, products).totalQuantity).toBe(4);
  });

  it("includes cancelled when asked", () => {
    expect(buildSalesReport(orders, products, [], { includeCancelled: true }).totalQuantity).toBe(11);
  });

  it("counts pending and confirmed as ordered demand", () => {
    const r = buildSalesReport(
      [order("c", "2026-08-01T15:00:00Z", [{ productId: "prod-pils", size: "1/2bbl", quantity: 2 }], "confirmed")],
      products,
    );
    expect(r.totalQuantity).toBe(2);
  });
});

describe("buildSalesReport — optional customer dimension", () => {
  const orders = [
    order("o1", "2026-08-01T15:00:00Z", [{ productId: "prod-pils", size: "1/2bbl", quantity: 2 }], "completed", "cust-1"),
    order("o2", "2026-08-01T15:00:00Z", [{ productId: "prod-pils", size: "1/2bbl", quantity: 3 }], "completed", "cust-2"),
  ];

  it("merges customers together when the option is off", () => {
    const r = buildSalesReport(orders, products, customers);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].quantity).toBe(5);
    expect(r.rows[0].customer).toBeUndefined();
  });

  it("splits per customer when the option is on", () => {
    const r = buildSalesReport(orders, products, customers, { includeCustomer: true });
    expect(r.rows).toHaveLength(2);
    expect(r.rows.map((x) => x.customer).sort()).toEqual(["Ecusta Market", "Salty Landing"]);
    expect(r.totalQuantity).toBe(5);
  });

  it("falls back to the customer id when the business name is unknown", () => {
    const r = buildSalesReport(
      [order("o", "2026-08-01T15:00:00Z", [{ productId: "prod-pils", size: "1/2bbl", quantity: 1 }], "completed", "cust-ghost")],
      products,
      customers,
      { includeCustomer: true },
    );
    expect(r.rows[0].customer).toBe("cust-ghost");
  });
});

describe("buildSalesReport — messy real-world data", () => {
  it("labels an item whose product was deleted instead of dropping it", () => {
    // Silently omitting rows would make the totals quietly wrong.
    const r = buildSalesReport(
      [order("o", "2026-08-01T15:00:00Z", [{ productId: "prod-deleted", size: "1/6bbl", quantity: 4 }])],
      products,
    );
    expect(r.rows[0].style).toBe("Unknown style");
    expect(r.totalQuantity).toBe(4);
  });

  it("labels a blank package type rather than producing an empty cell", () => {
    const r = buildSalesReport(
      [order("o", "2026-08-01T15:00:00Z", [{ productId: "prod-pils", size: "   ", quantity: 2 }])],
      products,
    );
    expect(r.rows[0].packageType).toBe("Unspecified");
  });

  it("keeps catalog typos as distinct rows rather than guessing they are the same", () => {
    // Production really does contain "Case of Cans, 16oz", "Case of Cane,
    // 16oz" and "Cas of Cans, 16oz". Merging by fuzzy match would be a
    // guess; showing them separately makes the data-entry problem visible.
    const r = buildSalesReport(
      [
        order("o1", "2026-08-01T15:00:00Z", [{ productId: "prod-kolsch", size: "Case of Cans, 16oz", quantity: 5 }]),
        order("o2", "2026-08-01T15:00:00Z", [{ productId: "prod-kolsch", size: "Cas of Cans, 16oz", quantity: 1 }]),
      ],
      products,
    );
    expect(r.rows).toHaveLength(2);
  });

  it("ignores zero, negative and non-numeric quantities", () => {
    const r = buildSalesReport(
      [
        order("o", "2026-08-01T15:00:00Z", [
          { productId: "prod-pils", size: "1/2bbl", quantity: 0 },
          { productId: "prod-pils", size: "1/2bbl", quantity: -3 },
          { productId: "prod-pils", size: "1/2bbl", quantity: NaN },
        ]),
      ],
      products,
    );
    expect(r.rows).toHaveLength(0);
    expect(r.totalQuantity).toBe(0);
  });

  it("survives an order with no items at all", () => {
    const r = buildSalesReport([order("empty", "2026-08-01T15:00:00Z", [])], products);
    expect(r.rows).toHaveLength(0);
    expect(r.orderCount).toBe(0);
  });

  it("returns an empty report for no orders", () => {
    const r = buildSalesReport([], products);
    expect(r.rows).toEqual([]);
    expect(r.totalQuantity).toBe(0);
    expect(r.totalRevenue).toBe(0);
  });
});

describe("salesReportToCsv", () => {
  const base = buildSalesReport(
    [order("o1", "2026-08-01T15:00:00Z", [{ productId: "prod-pils", size: "1/2bbl", quantity: 2, unitPrice: 180 }])],
    products,
    customers,
    { from: "2026-08-01", to: "2026-08-07" },
  );

  it("emits a header, a data row and a total row", () => {
    const lines = salesReportToCsv(base).split("\n");
    // 2 × 1/2bbl = 31.0 gallons = 1.00 barrel.
    expect(lines[0]).toBe('"Beer Style","Package Type","Quantity Ordered","Gallons","Barrels","Revenue","Orders"');
    expect(lines[1]).toBe('"German Pilsner","1/2bbl","2","31.0","1.00","360.00","1"');
    expect(lines[2]).toBe('"TOTAL","","2","31.0","1.00","360.00","1"');
  });

  it("adds the customer column only when the report is grouped that way", () => {
    const withCust = buildSalesReport(
      [order("o1", "2026-08-01T15:00:00Z", [{ productId: "prod-pils", size: "1/2bbl", quantity: 2 }])],
      products,
      customers,
      { includeCustomer: true },
    );
    expect(salesReportToCsv(withCust).split("\n")[0]).toContain('"Customer"');
    expect(salesReportToCsv(base).split("\n")[0]).not.toContain('"Customer"');
  });

  it("escapes embedded quotes and commas so the columns don't shift", () => {
    const csv = salesReportToCsv(
      buildSalesReport(
        [order("o", "2026-08-01T15:00:00Z", [{ productId: "prod-kolsch", size: 'Case of Cans, 16oz "tallboy"', quantity: 1 }])],
        products,
      ),
    );
    expect(csv).toContain('"Case of Cans, 16oz ""tallboy"""');
    // Header + 1 row + total. A broken escape would add lines.
    expect(csv.split("\n")).toHaveLength(3);
  });
});

describe("salesReportFilename", () => {
  it("encodes the range so downloads don't collide", () => {
    const r = buildSalesReport([], products, [], { from: "2026-08-01", to: "2026-08-07" });
    expect(salesReportFilename(r)).toBe("guidon-sales-by-style-2026-08-01_2026-08-07.csv");
  });

  it("says all-time when no range was given", () => {
    expect(salesReportFilename(buildSalesReport([], products))).toBe(
      "guidon-sales-by-style-all-time.csv",
    );
  });
});
