import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// REGRESSION — 2026-08-07.
//
// Four /api/admin/* routes had no auth check of their own and leaned entirely
// on src/middleware.ts. That looked fine until middleware started doing crypto:
// middleware runs on the Edge runtime, which did not resolve the signing secret
// that Node route handlers could see. Production ended up split-brained — a
// legitimately logged-in admin got 401 from /api/admin/stats while the same
// token worked on /api/customers.
//
// Middleware is now defence in depth and every handler checks for itself.
// These tests pin the handler-level check, which is also the only layer a
// vitest route test can reach: importing a handler directly never runs
// middleware, so a middleware-only route would appear "protected" while being
// wide open in any context where middleware is bypassed or degraded.

const { isAdminRequestSpy } = vi.hoisted(() => ({
  isAdminRequestSpy: vi.fn(async () => false),
}));

vi.mock("@/lib/auth-check", () => ({ isAdminRequest: isAdminRequestSpy }));
vi.mock("@/lib/data", () => ({
  getOrders: vi.fn(async () => []),
  getCustomers: vi.fn(async () => []),
  getAllKegBalances: vi.fn(async () => ({})),
  getApplications: vi.fn(async () => []),
  getNotificationEmails: vi.fn(async () => []),
  getSetting: vi.fn(async () => null),
  setSetting: vi.fn(async () => undefined),
  adjustProductInventory: vi.fn(async () => 0),
  setProductInventory: vi.fn(async () => 0),
  getOrder: vi.fn(async () => undefined),
}));
vi.mock("@/lib/email", () => ({
  notifyKegReminder: vi.fn(async () => undefined),
  portalUrl: () => "https://example.test/portal",
}));

import { GET as statsGET } from "@/app/api/admin/stats/route";
import { GET as settingsGET, PUT as settingsPUT } from "@/app/api/admin/settings/route";
import { PATCH as inventoryPATCH } from "@/app/api/admin/inventory/route";
import { POST as remindPOST } from "@/app/api/admin/remind-kegs/route";

function req(body?: unknown, method = "GET"): NextRequest {
  return new NextRequest("https://x.test/api/admin/thing", {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe("every /api/admin/* handler enforces admin auth itself", () => {
  beforeEach(() => isAdminRequestSpy.mockResolvedValue(false));

  it("stats GET rejects a non-admin", async () => {
    expect((await statsGET(req())).status).toBe(403);
  });

  it("settings GET rejects a non-admin", async () => {
    expect((await settingsGET(req())).status).toBe(403);
  });

  it("settings PUT rejects a non-admin", async () => {
    expect((await settingsPUT(req({ deliveryLeadDays: 2 }, "PUT"))).status).toBe(403);
  });

  it("inventory PATCH rejects a non-admin", async () => {
    const res = await inventoryPATCH(
      req({ productId: "prod-1", size: "1/2bbl", delta: -99 }, "PATCH"),
    );
    expect(res.status).toBe(403);
  });

  it("remind-kegs POST rejects a non-admin", async () => {
    expect((await remindPOST(req({ orderId: "ord-1" }, "POST"))).status).toBe(403);
  });

  it("admin still gets through", async () => {
    isAdminRequestSpy.mockResolvedValue(true);
    expect((await statsGET(req())).status).toBe(200);
  });
});
