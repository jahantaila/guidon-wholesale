import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  isAdminRequestSpy: vi.fn(async () => true),
  // Args and result are typed explicitly so mock.calls[0][0] is inspectable
  // and mockResolvedValue can express the failure shape.
  sendSpy: vi.fn(
    async (_args: { to: string; subject: string; html: string; text?: string; replyTo?: string }) =>
      ({ ok: true, id: "re_123" }) as { ok: boolean; id?: string; error?: string },
  ),
  isEmailConfiguredSpy: vi.fn(() => true),
  createCrmActivitySpy: vi.fn(async (a: Record<string, unknown>) => a),
}));

vi.mock("@/lib/auth-check", () => ({ isAdminRequest: h.isAdminRequestSpy }));
vi.mock("@/lib/data", () => ({
  getCustomer: vi.fn(async (id: string) =>
    id === "cust-1"
      ? { id: "cust-1", businessName: "Salty Landing", email: "orders@salty.test" }
      : id === "cust-noemail"
        ? { id: "cust-noemail", businessName: "No Address Bar", email: "" }
        : undefined),
  getCrmContact: vi.fn(async (id: string) =>
    id === "lead-1" ? { id: "lead-1", businessName: "New Bar", email: "hi@newbar.test" } : undefined),
  createCrmActivity: h.createCrmActivitySpy,
}));
vi.mock("@/lib/email", async () => {
  const actual = await vi.importActual<typeof import("@/lib/email")>("@/lib/email");
  return {
    send: h.sendSpy,
    isEmailConfigured: h.isEmailConfiguredSpy,
    emailShell: actual.emailShell,
    plainTextToHtml: actual.plainTextToHtml,
    escapeHtml: actual.escapeHtml,
  };
});

import { POST } from "@/app/api/admin/crm/email/route";
import { plainTextToHtml, escapeHtml } from "@/lib/email";

function req(body: unknown) {
  return new Request("https://x.test/api/admin/crm/email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as never;
}

const VALID = { subjectId: "cust-1", subject: "Fall seasonal", body: "Hi Pat,\n\nNew lager is ready." };

beforeEach(() => {
  h.isAdminRequestSpy.mockResolvedValue(true);
  h.isEmailConfiguredSpy.mockReturnValue(true);
  h.sendSpy.mockResolvedValue({ ok: true, id: "re_123" });
  h.sendSpy.mockClear();
  h.createCrmActivitySpy.mockClear();
});

describe("POST /api/admin/crm/email", () => {
  it("rejects a non-admin without sending", async () => {
    h.isAdminRequestSpy.mockResolvedValue(false);
    expect((await POST(req(VALID))).status).toBe(403);
    expect(h.sendSpy).not.toHaveBeenCalled();
  });

  it("sends to a customer and reports the address", async () => {
    const res = await POST(req(VALID));
    expect(res.status).toBe(200);
    expect((await res.json())).toMatchObject({ sent: true, to: "orders@salty.test" });
    expect(h.sendSpy).toHaveBeenCalledTimes(1);
  });

  it("sends to a lead as well as a customer", async () => {
    await POST(req({ ...VALID, subjectId: "lead-1" }));
    expect(h.sendSpy.mock.calls[0][0].to).toBe("hi@newbar.test");
  });

  it("sets Reply-To via the shared sender config, not a per-call override", async () => {
    // send() applies defaultReplyTo() (EMAIL_REPLY_TO = sales@guidonbrewing.com)
    // so a reply reaches Mike's real inbox. The route must not override it.
    await POST(req(VALID));
    expect(h.sendSpy.mock.calls[0][0]).not.toHaveProperty("replyTo");
  });

  it("logs a sent_email activity so history stays current with no typing", async () => {
    await POST(req(VALID));
    expect(h.createCrmActivitySpy).toHaveBeenCalledTimes(1);
    const a = h.createCrmActivitySpy.mock.calls[0][0] as Record<string, unknown>;
    expect(a).toMatchObject({ type: "sent_email", customerId: "cust-1", contactId: null, source: "system" });
    expect(a.notes).toBe("Fall seasonal");
  });

  it("attributes the activity to the contact when emailing a lead", async () => {
    await POST(req({ ...VALID, subjectId: "lead-1" }));
    const a = h.createCrmActivitySpy.mock.calls[0][0] as Record<string, unknown>;
    expect(a.contactId).toBe("lead-1");
    expect(a.customerId).toBeNull();
  });

  it("still reports success if logging fails — the email really did go out", async () => {
    h.createCrmActivitySpy.mockRejectedValueOnce(new Error("crm tables missing"));
    const res = await POST(req(VALID));
    expect(res.status).toBe(200);
    expect((await res.json()).logged).toBe(false);
  });
});

describe("refuses rather than pretending", () => {
  it("503s when email is not configured, and logs nothing", async () => {
    // send() returns {ok:true,id:'stub'} with no API key. Trusting that would
    // report a successful send and write an activity claiming one, while the
    // recipient received nothing.
    h.isEmailConfiguredSpy.mockReturnValue(false);
    const res = await POST(req(VALID));
    expect(res.status).toBe(503);
    expect(h.sendSpy).not.toHaveBeenCalled();
    expect(h.createCrmActivitySpy).not.toHaveBeenCalled();
  });

  it("502s and logs nothing when the provider rejects the send", async () => {
    h.sendSpy.mockResolvedValue({ ok: false, error: "domain not verified" });
    const res = await POST(req(VALID));
    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/domain not verified/);
    expect(h.createCrmActivitySpy).not.toHaveBeenCalled();
  });

  it("400s a recipient with no email address, naming them", async () => {
    const res = await POST(req({ ...VALID, subjectId: "cust-noemail" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/No Address Bar/);
    expect(h.sendSpy).not.toHaveBeenCalled();
  });

  it("404s an unknown recipient", async () => {
    expect((await POST(req({ ...VALID, subjectId: "ghost" }))).status).toBe(404);
  });

  it("rejects a missing subject, empty body, or missing id", async () => {
    expect((await POST(req({ ...VALID, subject: "  " }))).status).toBe(400);
    expect((await POST(req({ ...VALID, body: "" }))).status).toBe(400);
    expect((await POST(req({ ...VALID, subjectId: "" }))).status).toBe(400);
    expect(h.sendSpy).not.toHaveBeenCalled();
  });

  it("rejects an absurdly long message rather than handing it to the provider", async () => {
    expect((await POST(req({ ...VALID, body: "x".repeat(20_001) }))).status).toBe(400);
  });
});

describe("HTML safety", () => {
  it("escapes admin-authored text so it cannot render as markup in the inbox", async () => {
    // emailShell interpolates the body RAW, so escaping is the caller's job.
    await POST(req({ ...VALID, body: '<script>alert(1)</script> & "quotes" and \'apostrophes\'' }));
    const html = h.sendSpy.mock.calls[0][0].html as string;
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&#39;");
  });

  it("keeps the plain-text alternative unescaped and human-readable", async () => {
    await POST(req({ ...VALID, body: "5 > 3 & rising" }));
    expect(h.sendSpy.mock.calls[0][0].text).toBe("5 > 3 & rising");
  });

  it("turns blank lines into paragraphs and single newlines into breaks", async () => {
    await POST(req(VALID));
    const html = h.sendSpy.mock.calls[0][0].html as string;
    expect(html).toContain("Hi Pat,");
    expect(html).toContain("New lager is ready.");
    expect((html.match(/<p style/g) || []).length).toBe(2);
  });
});

describe("plainTextToHtml / escapeHtml", () => {
  it("escapes the five characters that matter", () => {
    expect(escapeHtml(`<&>"'`)).toBe("&lt;&amp;&gt;&quot;&#39;");
  });

  it("escapes ampersands before other entities, not after", () => {
    // Getting this order wrong double-encodes and shows &amp;lt; to the reader.
    expect(escapeHtml("<")).toBe("&lt;");
  });

  it("renders a single newline as a line break inside one paragraph", () => {
    const html = plainTextToHtml("line one\nline two");
    expect((html.match(/<p style/g) || []).length).toBe(1);
    expect(html).toContain("<br />");
  });
});
