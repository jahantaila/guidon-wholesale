import { describe, it, expect, beforeEach, vi } from "vitest";

// Stub out the data + email side-effects so the test only exercises the
// validation logic in the route. Without these stubs the route would try to
// hit Supabase / Resend and the test would either error or send mail.
// vi.hoisted because vi.mock factories run before module-level code; without
// hoisting, the spy reference inside the factory is undefined.
const { createApplicationSpy } = vi.hoisted(() => ({
  createApplicationSpy: vi.fn(async (app: unknown) => app),
}));
vi.mock("@/lib/data", () => ({
  getApplications: vi.fn(async () => []),
  createApplication: createApplicationSpy,
  updateApplication: vi.fn(async () => true),
  createCustomer: vi.fn(async (c: unknown) => c),
  getCustomers: vi.fn(async () => []),
}));
vi.mock("@/lib/email", () => ({
  notifyApplicationSubmitted: vi.fn(async () => undefined),
  notifyApplicationDecision: vi.fn(async () => undefined),
  portalUrl: () => "https://example.test/portal",
}));
vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => false,
  createAdminClient: () => {
    throw new Error("not configured in test");
  },
}));
vi.mock("@/lib/auth-check", () => ({
  isAdminRequest: () => false,
}));

import { POST } from "@/app/api/applications/route";

function makeRequest(body: Record<string, unknown>): Request {
  return new Request("https://example.test/api/applications", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const VALID_BODY = {
  businessName: "Test Tavern",
  contactName: "Jane Doe",
  email: "jane@test.example",
  phone: "(828) 555-0100",
  abcPermitNumber: "NC-12345",
  streetAddress: "1 Test Way",
  city: "Asheville",
  state: "NC",
  zip: "28801",
  businessType: "bar",
};

describe("POST /api/applications — required-field gate", () => {
  beforeEach(() => {
    createApplicationSpy.mockClear();
  });

  it("rejects a submission missing the ABC permit number with HTTP 400", async () => {
    const { abcPermitNumber, ...withoutPermit } = VALID_BODY;
    void abcPermitNumber;
    // Sanity: stripping the permit really did remove it from the payload.
    expect("abcPermitNumber" in withoutPermit).toBe(false);
    const res = await POST(makeRequest(withoutPermit) as never);
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toContain("ABC Permit Number");
    expect(createApplicationSpy).not.toHaveBeenCalled();
  });

  it.each([
    "businessName",
    "contactName",
    "email",
    "phone",
    "streetAddress",
    "city",
    "state",
    "zip",
  ])("rejects a submission missing %s with HTTP 400", async (field) => {
    const body = { ...VALID_BODY, [field]: "" };
    const res = await POST(makeRequest(body) as never);
    expect(res.status).toBe(400);
    expect(createApplicationSpy).not.toHaveBeenCalled();
  });

  it("rejects a non-US-state code with HTTP 400", async () => {
    const res = await POST(makeRequest({ ...VALID_BODY, state: "ZZ" }) as never);
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error.toLowerCase()).toContain("state");
    expect(createApplicationSpy).not.toHaveBeenCalled();
  });

  it("normalizes lowercase state input to uppercase before persisting", async () => {
    const res = await POST(makeRequest({ ...VALID_BODY, state: "nc" }) as never);
    expect(res.status).toBe(201);
    expect(createApplicationSpy).toHaveBeenCalledOnce();
    const persisted = createApplicationSpy.mock.calls[0][0] as { state: string };
    expect(persisted.state).toBe("NC");
  });

  it("accepts a fully-valid payload and returns the persisted application", async () => {
    const res = await POST(makeRequest(VALID_BODY) as never);
    expect(res.status).toBe(201);
    expect(createApplicationSpy).toHaveBeenCalledOnce();
    const persisted = createApplicationSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(persisted.abcPermitNumber).toBe("NC-12345");
    expect(persisted.streetAddress).toBe("1 Test Way");
    expect(persisted.city).toBe("Asheville");
    expect(persisted.state).toBe("NC");
    expect(persisted.zip).toBe("28801");
  });
});
