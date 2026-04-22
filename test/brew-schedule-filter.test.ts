import { describe, it, expect } from "vitest";
import { buildBrewScheduleFilter, filterBrewsByRange } from "@/lib/brew-schedule-filter";

// Fixed date for deterministic tests: Wednesday, 2026-04-22.
const NOW = new Date(2026, 3, 22); // month is 0-indexed

describe("buildBrewScheduleFilter", () => {
  it("returns null for 'all'", () => {
    expect(buildBrewScheduleFilter("all", { now: NOW })).toBeNull();
  });

  it("treats 'upcoming' as from-today, open-ended", () => {
    const range = buildBrewScheduleFilter("upcoming", { now: NOW });
    expect(range).toEqual({ from: "2026-04-22" });
  });

  it("resolves 'this_week' to Mon-Sun around now (Wed -> Mon 20 through Sun 26)", () => {
    const range = buildBrewScheduleFilter("this_week", { now: NOW });
    expect(range).toEqual({ from: "2026-04-20", to: "2026-04-26" });
  });

  it("resolves 'next_week' to the following Mon-Sun", () => {
    const range = buildBrewScheduleFilter("next_week", { now: NOW });
    expect(range).toEqual({ from: "2026-04-27", to: "2026-05-03" });
  });

  it("resolves 'this_month' to the first-last of the current month", () => {
    const range = buildBrewScheduleFilter("this_month", { now: NOW });
    expect(range).toEqual({ from: "2026-04-01", to: "2026-04-30" });
  });

  it("resolves 'last_month' to the first-last of the previous month", () => {
    const range = buildBrewScheduleFilter("last_month", { now: NOW });
    expect(range).toEqual({ from: "2026-03-01", to: "2026-03-31" });
  });

  it("handles year rollover in last_month for January", () => {
    const jan = new Date(2026, 0, 15);
    expect(buildBrewScheduleFilter("last_month", { now: jan })).toEqual({
      from: "2025-12-01",
      to: "2025-12-31",
    });
  });

  it("passes through custom inputs as-is", () => {
    const range = buildBrewScheduleFilter("custom", {
      now: NOW,
      from: "2026-06-01",
      to: "2026-06-15",
    });
    expect(range).toEqual({ from: "2026-06-01", to: "2026-06-15" });
  });

  it("returns null for custom with no inputs so the UI shows everything", () => {
    expect(buildBrewScheduleFilter("custom", { now: NOW })).toBeNull();
  });

  it("handles 'this_week' when today is Sunday (rolls back to previous Mon)", () => {
    const sunday = new Date(2026, 3, 26);
    expect(buildBrewScheduleFilter("this_week", { now: sunday })).toEqual({
      from: "2026-04-20",
      to: "2026-04-26",
    });
  });

  it("handles 'this_week' when today is Monday (today IS the start)", () => {
    const monday = new Date(2026, 3, 20);
    expect(buildBrewScheduleFilter("this_week", { now: monday })).toEqual({
      from: "2026-04-20",
      to: "2026-04-26",
    });
  });
});

describe("filterBrewsByRange", () => {
  const brews = [
    { brewDate: "2026-04-15" },
    { brewDate: "2026-04-22" },
    { brewDate: "2026-05-01" },
    { brewDate: "2026-05-15" },
  ];

  it("returns everything when range is null", () => {
    expect(filterBrewsByRange(brews, null)).toHaveLength(4);
  });

  it("filters by inclusive from-date", () => {
    expect(filterBrewsByRange(brews, { from: "2026-04-22" })).toEqual([
      { brewDate: "2026-04-22" },
      { brewDate: "2026-05-01" },
      { brewDate: "2026-05-15" },
    ]);
  });

  it("filters by inclusive to-date", () => {
    expect(filterBrewsByRange(brews, { to: "2026-04-22" })).toEqual([
      { brewDate: "2026-04-15" },
      { brewDate: "2026-04-22" },
    ]);
  });

  it("filters by both bounds inclusively", () => {
    expect(filterBrewsByRange(brews, { from: "2026-04-22", to: "2026-05-01" })).toEqual([
      { brewDate: "2026-04-22" },
      { brewDate: "2026-05-01" },
    ]);
  });

  it("returns empty when nothing is in range", () => {
    expect(filterBrewsByRange(brews, { from: "2027-01-01" })).toEqual([]);
  });
});
