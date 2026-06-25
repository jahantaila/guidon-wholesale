import { describe, it, expect, vi } from "vitest";

// Regression: portal customers (Salty Landing, Green River Brew Depot) hit
// "Authentication required to place an order." at checkout because the
// portal_session cookie expired after 24h while the dashboard still showed
// them logged in. Fix: 30-day rolling session — the cookie is set on login and
// re-set (slid forward) on every authenticated portal hit.
//
// Found by /investigate on 2026-06.

const THIRTY_DAYS = 60 * 60 * 24 * 30; // 2592000

const customer = {
  id: "cust-906767",
  businessName: "Salty Landing",
  contactName: "Nikki",
  email: "nikki@astahospitality.com",
  phone: "",
  streetAddress: "", city: "", state: "", zip: "",
  abcPermitNumber: "", preferredPaymentMethod: "no_preference" as const,
  password: "secret",
  createdAt: new Date().toISOString(),
};

vi.mock("@/lib/data", () => ({
  getCustomers: vi.fn(async () => [customer]),
  getCustomer: vi.fn(async () => customer),
}));
vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => false,
  createServerClient: () => { throw new Error("not used"); },
}));

import { POST as loginPOST, GET as loginGET } from "@/app/api/portal/login/route";
import { GET as meGET } from "@/app/api/portal/me/route";
import { NextRequest } from "next/server";

function maxAgeOf(res: Response): number | null {
  const sc = res.headers.get("set-cookie") || "";
  const m = sc.match(/portal_session=[^;]*;[^]*?Max-Age=(\d+)/i);
  return m ? parseInt(m[1], 10) : null;
}

describe("portal session cookie — 30-day rolling lifetime", () => {
  it("login sets portal_session for 30 days (not 24h)", async () => {
    const req = new NextRequest("https://x.test/api/portal/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: customer.email, password: "secret" }),
    });
    const res = await loginPOST(req);
    expect(res.status).toBe(200);
    expect(maxAgeOf(res)).toBe(THIRTY_DAYS);
  });

  it("session bootstrap (GET login) slides the cookie forward 30 days", async () => {
    const req = new NextRequest("https://x.test/api/portal/login", {
      method: "GET",
      headers: { cookie: `portal_session=${customer.id}` },
    });
    const res = await loginGET(req);
    expect(res.status).toBe(200);
    expect(maxAgeOf(res)).toBe(THIRTY_DAYS);
  });

  it("/api/portal/me slides the cookie forward on focus refetch", async () => {
    const req = new NextRequest("https://x.test/api/portal/me", {
      method: "GET",
      headers: { cookie: `portal_session=${customer.id}` },
    });
    const res = await meGET(req);
    expect(res.status).toBe(200);
    expect(maxAgeOf(res)).toBe(THIRTY_DAYS);
  });

  it("no cookie on /api/portal/me still returns 401 (the signal the portal now surfaces)", async () => {
    const req = new NextRequest("https://x.test/api/portal/me", { method: "GET" });
    const res = await meGET(req);
    expect(res.status).toBe(401);
  });
});
