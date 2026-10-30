import { describe, it, expect, vi, beforeEach } from "vitest";

// POST /api/admin/customers/merge — admin-only, validates input, maps
// "not found"/"archived" to 400 and anything else to 500.

const { isAdminSpy, mergeSpy, countSpy, getCustomerSpy } = vi.hoisted(() => ({
  isAdminSpy: vi.fn(async () => true),
  mergeSpy: vi.fn(async () => ({ orders: 2, invoices: 2, kegLedger: 0, orderTemplates: 0, recurringOrders: 0, crmActivities: 1, crmContacts: 0 })),
  countSpy: vi.fn(async () => ({ orders: 2 })),
  getCustomerSpy: vi.fn(async (id: string) => (id === "dup" ? { id } : undefined)),
}));

vi.mock("@/lib/auth-check", () => ({ isAdminRequest: isAdminSpy }));
vi.mock("@/lib/data", () => ({
  mergeCustomers: mergeSpy,
  countCustomerRecords: countSpy,
  getCustomer: getCustomerSpy,
}));

import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/admin/customers/merge/route";

const post = (body: unknown) =>
  POST(new NextRequest("https://x.test/api/admin/customers/merge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }));

beforeEach(() => {
  vi.clearAllMocks();
  isAdminSpy.mockResolvedValue(true);
});

describe("merge route", () => {
  it("rejects non-admins", async () => {
    isAdminSpy.mockResolvedValue(false);
    expect((await post({ sourceId: "dup", targetId: "keep" })).status).toBe(403);
    expect((await GET(new NextRequest("https://x.test/api/admin/customers/merge?sourceId=dup"))).status).toBe(403);
    expect(mergeSpy).not.toHaveBeenCalled();
  });

  it("requires two different accounts", async () => {
    expect((await post({ sourceId: "dup" })).status).toBe(400);
    expect((await post({ sourceId: "a", targetId: "a" })).status).toBe(400);
    expect(mergeSpy).not.toHaveBeenCalled();
  });

  it("merges and reports what moved", async () => {
    const res = await post({ sourceId: "dup", targetId: "keep" });
    expect(res.status).toBe(200);
    expect(mergeSpy).toHaveBeenCalledWith("dup", "keep");
    expect((await res.json()).moved.orders).toBe(2);
  });

  it("returns 400 for a missing or archived account, 500 otherwise", async () => {
    mergeSpy.mockRejectedValueOnce(new Error("The account to keep is archived. Restore it first."));
    expect((await post({ sourceId: "dup", targetId: "keep" })).status).toBe(400);
    mergeSpy.mockRejectedValueOnce(new Error("connection reset"));
    expect((await post({ sourceId: "dup", targetId: "keep" })).status).toBe(500);
  });

  it("previews counts, 404 for an unknown account", async () => {
    const ok = await GET(new NextRequest("https://x.test/api/admin/customers/merge?sourceId=dup"));
    expect(ok.status).toBe(200);
    expect((await ok.json()).counts.orders).toBe(2);
    expect((await GET(new NextRequest("https://x.test/api/admin/customers/merge?sourceId=zzz"))).status).toBe(404);
    expect((await GET(new NextRequest("https://x.test/api/admin/customers/merge"))).status).toBe(400);
  });
});
