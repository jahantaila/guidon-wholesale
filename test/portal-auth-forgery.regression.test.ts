import { describe, it, expect, beforeAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { signSession, resetSigningKeyCache, PORTAL_SESSION_MAX_AGE } from "@/lib/session-token";

// REGRESSION — 2026-08-07. This suite exists because the whole test suite was
// green (137/137) while portal auth was completely broken in BOTH directions.
//
// When portal_session changed from a raw customer id to a signed token, nine
// route handlers kept reading the cookie directly and comparing it to a
// customer id, bypassing verifySession entirely. Consequences:
//
//   - Forged: `Cookie: portal_session=cust-906767` authenticated as that
//     customer on routes that still did a raw compare. Cookies are just
//     headers when the caller is curl.
//   - Broken: a REAL signed session no longer equalled a customer id, so
//     invoices, keg balances, templates and recurring orders silently
//     returned [], and the forced-password-change flow 403'd — meaning a
//     newly approved customer could never finish onboarding.
//
// auth-check.test.ts pins the helper in isolation. It could not catch this,
// because the bug was in the routes that skipped the helper. So this suite
// drives the real route handlers end to end.

vi.mock("@/lib/data", () => ({
  getInvoices: vi.fn(async () => [
    { id: "inv-1", customerId: "cust-906767", total: 420, orderId: "ord-1", items: [] },
  ]),
  createInvoice: vi.fn(),
  updateInvoice: vi.fn(),
  getOrder: vi.fn(async () => ({ id: "ord-1", customerId: "cust-906767", status: "pending" })),
  updateOrder: vi.fn(async (id: string) => ({ id, status: "cancelled" })),
  adjustProductInventory: vi.fn(),
  getCustomers: vi.fn(async () => [
    { id: "cust-906767", email: "victim@x.test", businessName: "Salty Landing", password: "x" },
  ]),
  createCustomer: vi.fn(),
  updateCustomer: vi.fn(async (id: string, updates: Record<string, unknown>) => ({
    id,
    email: (updates.email as string) ?? "victim@x.test",
    businessName: "Salty Landing",
    ...updates,
  })),
  deleteCustomer: vi.fn(),
  getOrders: vi.fn(async () => []),
  getKegLedger: vi.fn(async () => []),
  getKegLedgerByCustomer: vi.fn(async () => [{ id: "kl-1", customerId: "cust-906767" }]),
  getAllKegBalances: vi.fn(async () => []),
  addKegLedgerEntry: vi.fn(),
  // Mirrors the real src/lib/data.ts contract: '' must match NOTHING.
  // Before the fix a falsy customerId skipped the filter and returned every
  // row, which let an anonymous caller pass an ownership check.
  getRecurringOrders: vi.fn(async (customerId?: string) => {
    if (customerId === "") return [];
    const all = [{ id: "rec-1", customerId: "cust-906767", name: "Weekly", items: [], active: true }];
    return customerId ? all.filter((r) => r.customerId === customerId) : all;
  }),
  createRecurringOrder: vi.fn(),
  updateRecurringOrder: vi.fn(async (id: string) => ({ id, active: false })),
  deleteRecurringOrder: vi.fn(),
  getOrderTemplates: vi.fn(async (customerId: string) =>
    [{ id: "tpl-1", customerId: "cust-906767" }].filter((t) => t.customerId === customerId)),
  createOrderTemplate: vi.fn(),
  deleteOrderTemplate: vi.fn(async () => true),
}));
vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => false,
  createAdminClient: () => {
    throw new Error("not configured in test");
  },
}));
vi.mock("@/lib/email", () => ({
  send: vi.fn(),
  formatCurrencyForEmail: (n: number) => String(n),
}));

import { GET as invoicesGET } from "@/app/api/invoices/route";
import { PUT as customersPUT } from "@/app/api/customers/route";
import { GET as recurringGET, PUT as recurringPUT } from "@/app/api/recurring-orders/route";
import { GET as kegGET } from "@/app/api/keg-ledger/route";
import { GET as tplGET, DELETE as tplDELETE } from "@/app/api/order-templates/route";
import { POST as cancelPOST } from "@/app/api/portal/cancel-order/route";

beforeAll(() => {
  process.env.SESSION_SECRET = "forgery-suite-secret-1234567890abcdef";
  resetSigningKeyCache();
});

const VICTIM = "cust-906767";
const forgedCookie = { cookie: `portal_session=${VICTIM}` };
const json = { "content-type": "application/json" };
const token = () => signSession("portal", VICTIM, PORTAL_SESSION_MAX_AGE);

describe("a forged raw customer id must NOT authenticate", () => {
  it("invoices GET returns nothing", async () => {
    const res = await invoicesGET(
      new NextRequest(`https://x.test/api/invoices?customerId=${VICTIM}`, { headers: forgedCookie }),
    );
    expect((await res.json()).length).toBe(0);
  });

  it("keg-ledger GET returns nothing", async () => {
    const res = await kegGET(
      new NextRequest(`https://x.test/api/keg-ledger?customerId=${VICTIM}`, { headers: forgedCookie }),
    );
    expect((await res.json()).length).toBe(0);
  });

  it("order-templates GET returns nothing", async () => {
    const res = await tplGET(
      new NextRequest(`https://x.test/api/order-templates?customerId=${VICTIM}`, { headers: forgedCookie }),
    );
    expect((await res.json()).length).toBe(0);
  });

  it("order-templates DELETE is refused", async () => {
    const res = await tplDELETE(
      new NextRequest("https://x.test/api/order-templates", {
        method: "DELETE",
        headers: { ...forgedCookie, ...json },
        body: JSON.stringify({ id: "tpl-1" }),
      }),
    );
    expect(res.status).toBe(403);
  });

  it("recurring-orders GET returns nothing", async () => {
    const res = await recurringGET(
      new NextRequest(`https://x.test/api/recurring-orders?customerId=${VICTIM}`, { headers: forgedCookie }),
    );
    expect((await res.json()).length).toBe(0);
  });

  it("customers PUT cannot take over the account", async () => {
    const res = await customersPUT(
      new NextRequest("https://x.test/api/customers", {
        method: "PUT",
        headers: { ...forgedCookie, ...json },
        body: JSON.stringify({ id: VICTIM, password: "pwned", email: "mal@evil.test" }),
      }) as never,
    );
    expect(res.status).toBe(403);
  });

  it("cancel-order is refused", async () => {
    const res = await cancelPOST(
      new NextRequest("https://x.test/api/portal/cancel-order", {
        method: "POST",
        headers: { ...forgedCookie, ...json },
        body: JSON.stringify({ orderId: "ord-1" }),
      }),
    );
    expect(res.status).toBe(401);
  });
});

describe("an ANONYMOUS caller must not reach owned resources", () => {
  it("recurring-orders PUT cannot pause a standing order", async () => {
    // The empty-string-means-no-filter hole: authContext returns '' for an
    // anonymous caller, and getRecurringOrders('') used to return EVERY row,
    // so the ownership check passed for any guessable id and the write landed.
    // Pausing a standing order silently stops a bar's weekly beer delivery.
    const res = await recurringPUT(
      new NextRequest("https://x.test/api/recurring-orders", {
        method: "PUT",
        headers: json,
        body: JSON.stringify({ id: "rec-1", active: false }),
      }),
    );
    expect(res.status).toBe(403);
  });
});

describe("a REAL signed session must work, over cookie AND bearer", () => {
  it("invoices via signed cookie", async () => {
    const res = await invoicesGET(
      new NextRequest(`https://x.test/api/invoices?customerId=${VICTIM}`, {
        headers: { cookie: `portal_session=${await token()}` },
      }),
    );
    expect((await res.json()).length).toBe(1);
  });

  it("invoices via bearer header (the iframe case)", async () => {
    const res = await invoicesGET(
      new NextRequest(`https://x.test/api/invoices?customerId=${VICTIM}`, {
        headers: { authorization: `Bearer ${await token()}` },
      }),
    );
    expect((await res.json()).length).toBe(1);
  });

  it("keg balances via bearer", async () => {
    const res = await kegGET(
      new NextRequest(`https://x.test/api/keg-ledger?customerId=${VICTIM}`, {
        headers: { authorization: `Bearer ${await token()}` },
      }),
    );
    expect((await res.json()).length).toBe(1);
  });

  it("password change via bearer — the forced-change onboarding flow", async () => {
    const res = await customersPUT(
      new NextRequest("https://x.test/api/customers", {
        method: "PUT",
        headers: { authorization: `Bearer ${await token()}`, ...json },
        body: JSON.stringify({ id: VICTIM, password: "my-new-password" }),
      }) as never,
    );
    expect(res.status).toBe(200);
  });

  it("cancel-order via bearer", async () => {
    const res = await cancelPOST(
      new NextRequest("https://x.test/api/portal/cancel-order", {
        method: "POST",
        headers: { authorization: `Bearer ${await token()}`, ...json },
        body: JSON.stringify({ orderId: "ord-1" }),
      }),
    );
    expect(res.status).toBe(200);
  });

  it("still cannot read another customer's data", async () => {
    const other = await signSession("portal", "cust-111111", PORTAL_SESSION_MAX_AGE);
    const res = await invoicesGET(
      new NextRequest(`https://x.test/api/invoices?customerId=${VICTIM}`, {
        headers: { authorization: `Bearer ${other}` },
      }),
    );
    expect((await res.json()).length).toBe(0);
  });
});
