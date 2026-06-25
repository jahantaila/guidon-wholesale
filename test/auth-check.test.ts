import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { authContext, isAdminRequest, canAccessCustomer } from "@/lib/auth-check";

// Locks the cookie -> auth wiring that the order-placement flow depends on.
// The "Authentication required to place an order" incident (Salty Landing /
// Green River Brew Depot, 2026-06) happened when the portal_session cookie
// lapsed and portalCustomerId came back empty. The orders-POST suite mocks
// authContext, so this test pins the real thing: a present portal_session
// cookie must yield that customer id; an absent one must yield ''.

function req(cookie?: string): NextRequest {
  return new NextRequest("https://x.test/api/orders", {
    method: "POST",
    headers: cookie ? { cookie } : {},
  });
}

describe("authContext — portal session wiring", () => {
  it("reads portalCustomerId from the portal_session cookie", () => {
    const ctx = authContext(req("portal_session=cust-906767"));
    expect(ctx.portalCustomerId).toBe("cust-906767");
    expect(ctx.admin).toBe(false);
  });

  it("returns empty portalCustomerId when the cookie is absent (the lapsed-session case)", () => {
    const ctx = authContext(req());
    expect(ctx.portalCustomerId).toBe("");
    expect(ctx.admin).toBe(false);
  });
});

describe("isAdminRequest", () => {
  it("accepts the admin_session cookie", () => {
    expect(isAdminRequest(req("admin_session=authenticated"))).toBe(true);
  });
  it("rejects when no admin cookie/header is present", () => {
    expect(isAdminRequest(req())).toBe(false);
  });
});

describe("canAccessCustomer", () => {
  it("lets a portal customer access only their own id", () => {
    const r = req("portal_session=cust-906767");
    expect(canAccessCustomer(r, "cust-906767")).toBe(true);
    expect(canAccessCustomer(r, "cust-other")).toBe(false);
  });
});
