import { describe, it, expect } from "vitest";
import { computeKegBalance, countsTowardBalance } from "@/lib/data";
import type { KegLedgerEntry } from "@/lib/types";

function entry(partial: Partial<KegLedgerEntry>): KegLedgerEntry {
  return {
    id: partial.id ?? "kl_1",
    customerId: partial.customerId ?? "cust_1",
    orderId: partial.orderId ?? "",
    type: partial.type ?? "deposit",
    size: partial.size ?? "1/2bbl",
    quantity: partial.quantity ?? 1,
    depositAmount: partial.depositAmount ?? 50,
    totalAmount: partial.totalAmount ?? 50,
    date: partial.date ?? new Date().toISOString(),
    notes: partial.notes ?? "",
    status: partial.status,
  };
}

describe("countsTowardBalance", () => {
  it("treats missing status as approved (back-compat with legacy rows)", () => {
    expect(countsTowardBalance(entry({}))).toBe(true);
  });

  it("counts explicit approved entries", () => {
    expect(countsTowardBalance(entry({ status: "approved" }))).toBe(true);
  });

  it("does not count pending entries", () => {
    expect(countsTowardBalance(entry({ status: "pending" }))).toBe(false);
  });

  it("does not count rejected entries", () => {
    expect(countsTowardBalance(entry({ status: "rejected" }))).toBe(false);
  });
});

describe("computeKegBalance (regression: pending returns do not decrement)", () => {
  it("adds approved deposits to the balance", () => {
    const bal = computeKegBalance([
      entry({ type: "deposit", size: "1/2bbl", quantity: 3, status: "approved" }),
      entry({ type: "deposit", size: "1/4bbl", quantity: 2, status: "approved" }),
    ]);
    expect(bal["1/2bbl"]).toBe(3);
    expect(bal["1/4bbl"]).toBe(2);
    expect(bal["1/6bbl"]).toBe(0);
  });

  it("subtracts approved returns from the balance", () => {
    const bal = computeKegBalance([
      entry({ id: "a", type: "deposit", size: "1/2bbl", quantity: 5, status: "approved" }),
      entry({ id: "b", type: "return", size: "1/2bbl", quantity: 2, status: "approved" }),
    ]);
    expect(bal["1/2bbl"]).toBe(3);
  });

  it("does NOT subtract pending returns — the kegs are still at the customer's location", () => {
    // This is the core of Bug 3: customer submits a return request, kegs
    // are still physically at their site, balance should NOT drop until
    // admin confirms the pickup.
    const bal = computeKegBalance([
      entry({ id: "a", type: "deposit", size: "1/2bbl", quantity: 5, status: "approved" }),
      entry({ id: "b", type: "return", size: "1/2bbl", quantity: 2, status: "pending" }),
    ]);
    expect(bal["1/2bbl"]).toBe(5);
  });

  it("subtracts once the pending return is flipped to approved", () => {
    const bal = computeKegBalance([
      entry({ id: "a", type: "deposit", size: "1/2bbl", quantity: 5, status: "approved" }),
      entry({ id: "b", type: "return", size: "1/2bbl", quantity: 2, status: "approved" }),
    ]);
    expect(bal["1/2bbl"]).toBe(3);
  });

  it("never subtracts rejected returns", () => {
    const bal = computeKegBalance([
      entry({ id: "a", type: "deposit", size: "1/2bbl", quantity: 5, status: "approved" }),
      entry({ id: "b", type: "return", size: "1/2bbl", quantity: 2, status: "rejected" }),
    ]);
    expect(bal["1/2bbl"]).toBe(5);
  });

  it("treats legacy undefined-status entries as approved (back-compat)", () => {
    const bal = computeKegBalance([
      entry({ id: "a", type: "deposit", size: "1/2bbl", quantity: 4 }),
      entry({ id: "b", type: "return", size: "1/2bbl", quantity: 1 }),
    ]);
    expect(bal["1/2bbl"]).toBe(3);
  });

  it("supports admin-defined custom sizes beyond the three legacy sizes", () => {
    const bal = computeKegBalance([
      entry({ type: "deposit", size: "50L-slim", quantity: 4, status: "approved" }),
      entry({ type: "return", size: "50L-slim", quantity: 1, status: "pending" }),
    ]);
    expect(bal["50L-slim"]).toBe(4);
  });
});
