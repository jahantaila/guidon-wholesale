import { describe, it, expect, vi, beforeEach } from "vitest";

// PUT/GET /api/admin/orders/reporting-date — validation, reset-to-placed,
// read-back, and the admin gate.

const { getOrderSpy, setSpy, historySpy, adminSpy } = vi.hoisted(() => ({
  getOrderSpy: vi.fn(),
  setSpy: vi.fn(),
  historySpy: vi.fn(async () => [] as unknown[]),
  adminSpy: vi.fn(async () => true),
}));

vi.mock("@/lib/data", () => ({
  getOrder: getOrderSpy,
  setOrderReportingDate: setSpy,
  getOrderReportingDateChanges: historySpy,
}));
vi.mock("@/lib/auth-check", () => ({ isAdminRequest: adminSpy }));

import { GET, PUT } from "@/app/api/admin/orders/reporting-date/route";
import type { NextRequest } from "next/server";

const ORDER = { id: "o1", createdAt: "2026-09-02T14:00:00Z", reportingDate: null };

function put(body: unknown) {
  return PUT(
    new Request("https://x.test/api/admin/orders/reporting-date", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }) as unknown as NextRequest,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  adminSpy.mockResolvedValue(true);
  getOrderSpy.mockResolvedValue(ORDER);
  setSpy.mockImplementation(async (_id: string, d: string | null) => ({ ...ORDER, reportingDate: d }));
});

describe("PUT reporting-date", () => {
  it("rejects non-admins", async () => {
    adminSpy.mockResolvedValue(false);
    expect((await put({ orderId: "o1", reportingDate: "2026-08-31" })).status).toBe(403);
    expect(setSpy).not.toHaveBeenCalled();
  });

  it("requires an orderId", async () => {
    expect((await put({ reportingDate: "2026-08-31" })).status).toBe(400);
  });

  it("rejects malformed and impossible dates", async () => {
    expect((await put({ orderId: "o1", reportingDate: "08/31/2026" })).status).toBe(400);
    expect((await put({ orderId: "o1", reportingDate: "2026-02-30" })).status).toBe(400);
    expect((await put({ orderId: "o1", reportingDate: 20260831 })).status).toBe(400);
    expect(setSpy).not.toHaveBeenCalled();
  });

  it("rejects a future date", async () => {
    const res = await put({ orderId: "o1", reportingDate: "2999-01-01" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/future/);
  });

  it("404s for an unknown order", async () => {
    getOrderSpy.mockResolvedValue(undefined);
    expect((await put({ orderId: "nope", reportingDate: "2026-08-31" })).status).toBe(404);
  });

  it("sets the date and returns placed + reporting dates", async () => {
    const res = await put({ orderId: "o1", reportingDate: "2026-08-31" });
    expect(res.status).toBe(200);
    expect(setSpy).toHaveBeenCalledWith("o1", "2026-08-31");
    const body = await res.json();
    expect(body).toMatchObject({ placedDate: "2026-09-02", reportingDate: "2026-08-31" });
  });

  it("choosing the placed day stores null (not back-dated)", async () => {
    await put({ orderId: "o1", reportingDate: "2026-09-02" });
    expect(setSpy).toHaveBeenCalledWith("o1", null);
  });

  it("null and empty string both reset", async () => {
    await put({ orderId: "o1", reportingDate: null });
    await put({ orderId: "o1", reportingDate: "" });
    expect(setSpy.mock.calls).toEqual([["o1", null], ["o1", null]]);
  });

  it("fails loudly when the read-back does not match", async () => {
    setSpy.mockResolvedValue({ ...ORDER, reportingDate: null });
    const res = await put({ orderId: "o1", reportingDate: "2026-08-31" });
    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/did not save/);
  });

  it("explains a missing migration instead of a raw DB error", async () => {
    setSpy.mockRejectedValue({ message: 'relation "order_reporting_date_changes" does not exist' });
    const res = await put({ orderId: "o1", reportingDate: "2026-08-31" });
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/migration 003/);
  });
});

describe("GET reporting-date", () => {
  it("returns the dates and history", async () => {
    historySpy.mockResolvedValue([{ id: "h1", orderId: "o1", previousDate: null, newDate: "2026-08-31", changedAt: "x" }]);
    const res = await GET(
      new Request("https://x.test/api/admin/orders/reporting-date?orderId=o1") as unknown as NextRequest,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.placedDate).toBe("2026-09-02");
    expect(body.history).toHaveLength(1);
  });

  it("requires orderId and admin", async () => {
    expect((await GET(new Request("https://x.test/r") as unknown as NextRequest)).status).toBe(400);
    adminSpy.mockResolvedValue(false);
    expect((await GET(new Request("https://x.test/r?orderId=o1") as unknown as NextRequest)).status).toBe(403);
  });
});
