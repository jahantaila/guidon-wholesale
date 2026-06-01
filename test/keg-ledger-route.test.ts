import { describe, it, expect, vi, beforeEach } from "vitest";

// Behavior (2026-05): POST /api/keg-ledger is admin-only. Customer-initiated
// returns were retired, so the portal no longer posts here. Every recorded
// entry counts toward the balance immediately (status:'approved') — there is
// no longer a 'pending'/approve-reject flow, and the PATCH handler is gone.

const { addKegLedgerEntrySpy, isAdminRequestSpy } = vi.hoisted(() => ({
  addKegLedgerEntrySpy: vi.fn(async (entry: unknown) => entry),
  isAdminRequestSpy: vi.fn(() => true),
}));

vi.mock("@/lib/data", () => ({
  getKegLedger: vi.fn(async () => []),
  getKegLedgerByCustomer: vi.fn(async () => []),
  getAllKegBalances: vi.fn(async () => ({})),
  addKegLedgerEntry: addKegLedgerEntrySpy,
}));
vi.mock("@/lib/auth-check", () => ({
  isAdminRequest: isAdminRequestSpy,
}));

import * as route from "@/app/api/keg-ledger/route";

function makeRequest(body: Record<string, unknown>): Request {
  return new Request("https://example.test/api/keg-ledger", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/keg-ledger", () => {
  beforeEach(() => {
    addKegLedgerEntrySpy.mockClear();
    isAdminRequestSpy.mockReturnValue(true);
  });

  it("rejects non-admin callers with 403 (customer return paths retired)", async () => {
    isAdminRequestSpy.mockReturnValue(false);
    const res = await route.POST(
      makeRequest({ customerId: "cust-1", type: "return", size: "1/2bbl", quantity: 1 }) as never,
    );
    expect(res.status).toBe(403);
    expect(addKegLedgerEntrySpy).not.toHaveBeenCalled();
  });

  it("records an admin return as approved with a negative total", async () => {
    const res = await route.POST(
      makeRequest({ customerId: "cust-1", type: "return", size: "1/2bbl", quantity: 2 }) as never,
    );
    expect(res.status).toBe(201);
    const entry = addKegLedgerEntrySpy.mock.calls[0][0] as Record<string, unknown>;
    expect(entry.type).toBe("return");
    expect(entry.status).toBe("approved");
    expect(entry.totalAmount).toBe(-(50 * 2)); // KEG_DEPOSITS['1/2bbl'] = 50
  });

  it("records an admin deposit as approved with a positive total", async () => {
    const res = await route.POST(
      makeRequest({ customerId: "cust-1", type: "deposit", size: "1/4bbl", quantity: 3 }) as never,
    );
    expect(res.status).toBe(201);
    const entry = addKegLedgerEntrySpy.mock.calls[0][0] as Record<string, unknown>;
    expect(entry.status).toBe("approved");
    expect(entry.totalAmount).toBe(40 * 3); // KEG_DEPOSITS['1/4bbl'] = 40
  });

  it("400s when required fields are missing", async () => {
    const res = await route.POST(makeRequest({ customerId: "cust-1", type: "return" }) as never);
    expect(res.status).toBe(400);
  });

  it("no longer exposes a PATCH (approve/reject) handler", () => {
    expect((route as Record<string, unknown>).PATCH).toBeUndefined();
  });
});
