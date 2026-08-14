import { describe, it, expect } from "vitest";
import { byProductDisplayOrder } from "@/lib/data";
import type { Product } from "@/lib/types";

// Product display order drives BOTH the admin catalog and the customer-facing
// order page. The comparator is sorted in application code (not SQL) so a
// pre-migration instance with no sort_order column degrades to name order
// instead of throwing — these tests lock in that behavior.

function product(name: string, sortOrder?: number | null): Product {
  return {
    id: name,
    name,
    style: "",
    abv: 0,
    description: "",
    category: "Ale",
    available: true,
    sizes: [],
    sortOrder,
  } as unknown as Product;
}

describe("byProductDisplayOrder", () => {
  it("orders by explicit sortOrder ascending", () => {
    const sorted = [product("C", 2), product("A", 0), product("B", 1)]
      .sort(byProductDisplayOrder)
      .map((p) => p.name);
    expect(sorted).toEqual(["A", "B", "C"]);
  });

  it("sorts products with no sortOrder last, alphabetically among themselves", () => {
    const sorted = [product("Zed", null), product("Amber"), product("Placed", 0)]
      .sort(byProductDisplayOrder)
      .map((p) => p.name);
    expect(sorted).toEqual(["Placed", "Amber", "Zed"]);
  });

  it("breaks sortOrder ties by name", () => {
    const sorted = [product("Beta", 5), product("Alpha", 5)]
      .sort(byProductDisplayOrder)
      .map((p) => p.name);
    expect(sorted).toEqual(["Alpha", "Beta"]);
  });

  it("treats sortOrder 0 as ordered, not as a falsy 'unset'", () => {
    // Regression guard against a `sortOrder || Infinity` mistake: the first
    // product Mike drags to the top gets sort_order 0 and must stay first.
    const sorted = [product("Second", 1), product("First", 0)]
      .sort(byProductDisplayOrder)
      .map((p) => p.name);
    expect(sorted).toEqual(["First", "Second"]);
  });
});
