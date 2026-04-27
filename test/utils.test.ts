import { describe, it, expect } from "vitest";
import {
  formatCurrency,
  formatDate,
  cn,
  generateId,
  getStatusColor,
  formatAddress,
  isValidUsStateCode,
  US_STATES,
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
  it("returns the pending status class for pending", () => {
    expect(getStatusColor("pending")).toBe("badge-status-pending");
  });

  it("returns the completed status class for completed", () => {
    expect(getStatusColor("completed")).toBe("badge-status-completed");
  });

  it("returns the unpaid status class for unpaid", () => {
    expect(getStatusColor("unpaid")).toBe("badge-status-unpaid");
  });

  it("returns the default badge class for unknown status", () => {
    expect(getStatusColor("bogus-status")).toBe("badge-status-default");
  });
});

describe("formatDate", () => {
  it("formats an ISO date string to human-readable", () => {
    expect(formatDate("2026-01-15T00:00:00Z")).toMatch(/Jan \d{1,2}, 2026/);
  });
});

describe("formatAddress", () => {
  it("joins all four parts with commas in postal order", () => {
    expect(
      formatAddress({
        streetAddress: "142 Main St",
        city: "Hendersonville",
        state: "NC",
        zip: "28792",
      }),
    ).toBe("142 Main St, Hendersonville, NC 28792");
  });

  it("skips empty parts so legacy rows with only a street don't render dangling commas", () => {
    expect(formatAddress({ streetAddress: "142 Main St" })).toBe("142 Main St");
  });

  it("handles partial city/state when zip is missing", () => {
    expect(
      formatAddress({ streetAddress: "1 X", city: "Asheville", state: "NC" }),
    ).toBe("1 X, Asheville, NC");
  });

  it("returns empty string when all parts are missing", () => {
    expect(formatAddress({})).toBe("");
  });

  it("trims whitespace from each part", () => {
    expect(
      formatAddress({
        streetAddress: "  1 X  ",
        city: " Asheville ",
        state: "NC",
        zip: " 28801 ",
      }),
    ).toBe("1 X, Asheville, NC 28801");
  });
});

describe("isValidUsStateCode", () => {
  it("accepts valid 2-letter codes", () => {
    expect(isValidUsStateCode("NC")).toBe(true);
    expect(isValidUsStateCode("CA")).toBe(true);
    expect(isValidUsStateCode("DC")).toBe(true);
  });

  it("normalizes lowercase input", () => {
    expect(isValidUsStateCode("nc")).toBe(true);
  });

  it("rejects unknown codes", () => {
    expect(isValidUsStateCode("ZZ")).toBe(false);
    expect(isValidUsStateCode("")).toBe(false);
    expect(isValidUsStateCode("California")).toBe(false);
  });
});

describe("US_STATES constant", () => {
  it("includes 51 entries (50 states + DC)", () => {
    expect(US_STATES).toHaveLength(51);
  });

  it("uses uppercase 2-letter codes throughout", () => {
    for (const s of US_STATES) {
      expect(s.code).toMatch(/^[A-Z]{2}$/);
    }
  });
});
