import { describe, it, expect, beforeAll } from "vitest";
import { NextRequest } from "next/server";
import { authContext, isAdminRequest, canAccessCustomer } from "@/lib/auth-check";
import {
  signSession,
  resetSigningKeyCache,
  PORTAL_SESSION_MAX_AGE,
  ADMIN_SESSION_MAX_AGE,
} from "@/lib/session-token";

// Locks the cookie/header -> auth wiring that order placement depends on.
//
// Two incidents are pinned here:
//   1. "Authentication required to place an order" (Salty Landing / Green
//      River Brew Depot / Ecusta Market). The portal is iframed on the
//      brewery's WordPress site, so the portal_session cookie is third-party
//      and the browser drops it. Auth must therefore also accept a Bearer
//      header.
//   2. The 2026-08-07 auth bypass: cookie and header both accepted the bare
//      literal 'authenticated', so `curl -H "Authorization: Bearer
//      authenticated"` was full admin. Marker values must never authenticate
//      again, in EITHER position.

beforeAll(() => {
  process.env.SESSION_SECRET = "test-secret-value-for-auth-check-suite";
  resetSigningKeyCache();
});

function req(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("https://x.test/api/orders", { method: "POST", headers });
}

const portalToken = (id: string) => signSession("portal", id, PORTAL_SESSION_MAX_AGE);
const adminToken = () => signSession("admin", "admin", ADMIN_SESSION_MAX_AGE);

describe("authContext — portal session wiring", () => {
  it("reads portalCustomerId from a signed portal_session cookie", async () => {
    const ctx = await authContext(req({ cookie: `portal_session=${await portalToken("cust-906767")}` }));
    expect(ctx.portalCustomerId).toBe("cust-906767");
    expect(ctx.admin).toBe(false);
  });

  it("reads portalCustomerId from a Bearer header (the iframe case)", async () => {
    // This is the fix for the reported bug: in the WordPress iframe the cookie
    // never arrives, so the header has to carry the session.
    const ctx = await authContext(req({ authorization: `Bearer ${await portalToken("cust-906767")}` }));
    expect(ctx.portalCustomerId).toBe("cust-906767");
  });

  it("returns empty portalCustomerId when nothing is presented", async () => {
    const ctx = await authContext(req());
    expect(ctx.portalCustomerId).toBe("");
    expect(ctx.admin).toBe(false);
  });

  it("REGRESSION: a raw customer id in the cookie does not authenticate", async () => {
    // Cookies are just headers when the caller is curl, so a bare id was a
    // password-free read of that customer's orders and invoices.
    const ctx = await authContext(req({ cookie: "portal_session=cust-906767" }));
    expect(ctx.portalCustomerId).toBe("");
  });

  it("REGRESSION: a raw customer id in the Bearer header does not authenticate", async () => {
    const ctx = await authContext(req({ authorization: "Bearer cust-906767" }));
    expect(ctx.portalCustomerId).toBe("");
  });

  it("rejects a portal token whose signature was tampered with", async () => {
    const token = await portalToken("cust-906767");
    const forged = token.slice(0, -4) + "AAAA";
    const ctx = await authContext(req({ authorization: `Bearer ${forged}` }));
    expect(ctx.portalCustomerId).toBe("");
  });

  it("does not accept an admin token as a portal session", async () => {
    const ctx = await authContext(req({ authorization: `Bearer ${await adminToken()}` }));
    expect(ctx.portalCustomerId).toBe("");
    expect(ctx.admin).toBe(true);
  });
});

describe("isAdminRequest", () => {
  it("accepts a signed admin_session cookie", async () => {
    expect(await isAdminRequest(req({ cookie: `admin_session=${await adminToken()}` }))).toBe(true);
  });

  it("accepts a signed Bearer token", async () => {
    expect(await isAdminRequest(req({ authorization: `Bearer ${await adminToken()}` }))).toBe(true);
  });

  it("rejects when nothing is presented", async () => {
    expect(await isAdminRequest(req())).toBe(false);
  });

  it("REGRESSION: 'Bearer authenticated' is not admin", async () => {
    // The exact production exploit, confirmed live on 2026-08-07:
    //   curl -H "Authorization: Bearer authenticated" .../api/admin/stats
    //   -> HTTP 200 with real customer data.
    expect(await isAdminRequest(req({ authorization: "Bearer authenticated" }))).toBe(false);
  });

  it("REGRESSION: admin_session=authenticated is not admin", async () => {
    expect(await isAdminRequest(req({ cookie: "admin_session=authenticated" }))).toBe(false);
  });

  it("does not accept a portal token as admin (privilege escalation)", async () => {
    const token = await portalToken("cust-906767");
    expect(await isAdminRequest(req({ authorization: `Bearer ${token}` }))).toBe(false);
  });
});

describe("canAccessCustomer", () => {
  it("lets a portal customer access only their own id", async () => {
    const r = req({ cookie: `portal_session=${await portalToken("cust-906767")}` });
    expect(await canAccessCustomer(r, "cust-906767")).toBe(true);
    expect(await canAccessCustomer(r, "cust-other")).toBe(false);
  });

  it("lets admin access any customer", async () => {
    const r = req({ authorization: `Bearer ${await adminToken()}` });
    expect(await canAccessCustomer(r, "cust-anyone")).toBe(true);
  });
});
