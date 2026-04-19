import { describe, it, expect } from "vitest";
import {
  formatCurrency,
  formatDate,
  cn,
  generateId,
  getStatusColor,
} from "@/lib/utils";

describe("formatCurrency", () => {
  it("formats whole dollar amounts", () => {
    expect(formatCurrency(50)).toBe("$50.00");
  });

  it("formats fractional amounts with 2 decimal places", () => {
    expect(formatCurrency(1234.5)).toBe("$1,234.50");
  });

  it("handles zero", () => {
    expect(formatCurrency(0)).toBe("$0.00");
  });

  it("handles negative amounts as credits", () => {
    expect(formatCurrency(-30)).toBe("-$30.00");
  });
});

describe("cn", () => {
  it("joins truthy strings with spaces", () => {
    expect(cn("foo", "bar", "baz")).toBe("foo bar baz");
  });

  it("filters out falsy values", () => {
    expect(cn("foo", false, null, undefined, "bar")).toBe("foo bar");
  });

  it("returns empty string when all inputs are falsy", () => {
    expect(cn(false, null, undefined)).toBe("");
  });
});

describe("generateId", () => {
  it("prefixes the id with the given string", () => {
    const id = generateId("ORD");
    expect(id).toMatch(/^ORD-\d{6}$/);
  });

  it("produces 6-digit numeric suffix", () => {
    const id = generateId("INV");
    const num = parseInt(id.split("-")[1], 10);
    expect(num).toBeGreaterThanOrEqual(100000);
    expect(num).toBeLessThan(1000000);
  });
});

describe("getStatusColor", () => {
  it("returns amber/gold for pending", () => {
    expect(getStatusColor("pending")).toContain("gold");
  });

  it("returns emerald for delivered", () => {
    expect(getStatusColor("delivered")).toContain("emerald");
  });

  it("returns red for unpaid", () => {
    expect(getStatusColor("unpaid")).toContain("red");
  });

  it("returns default cream/white classes for unknown status", () => {
    const result = getStatusColor("bogus-status");
    expect(result).toContain("cream");
    expect(result).toContain("white");
  });
});

describe("formatDate", () => {
  it("formats an ISO date string to human-readable", () => {
    expect(formatDate("2026-01-15T00:00:00Z")).toMatch(/Jan \d{1,2}, 2026/);
  });
});
