import { describe, it, expect, beforeEach, vi } from "vitest";

// "Account approved" email carries the setup-walkthrough link once one is set
// (Mike, Sept 24 2026). No link set → no dangling "watch the video" copy.

const h = vi.hoisted(() => ({
  sendSpy: vi.fn(async (_p: { html: string; to: string }) => ({ data: { id: "t" }, error: null })),
  url: "" as unknown,
  settingThrows: false,
}));

vi.mock("resend", () => ({ Resend: class { emails = { send: h.sendSpy }; } }));
vi.mock("@/lib/data", () => ({
  getNotificationEmails: vi.fn(async () => ["admin@test.example"]),
  getSetting: vi.fn(async () => {
    if (h.settingThrows) throw new Error("db down");
    return h.url;
  }),
}));

process.env.RESEND_API_KEY = "test-key";
process.env.EMAIL_DISABLED = "";

import { notifyApplicationDecision } from "@/lib/email";

const approve = () =>
  notifyApplicationDecision({
    applicationId: "app-1",
    applicantEmail: "owner@bar.test",
    applicantName: "Sam",
    businessName: "New Bar",
    decision: "approved",
    portalUrl: "https://guidonbrewing.com/wholesale",
    tempPassword: "guidon",
  });

const html = () => (h.sendSpy.mock.calls.at(-1)![0] as { html: string }).html;

beforeEach(() => {
  h.sendSpy.mockClear();
  h.url = "";
  h.settingThrows = false;
  delete process.env.ONBOARDING_VIDEO_URL;
});

describe("welcome email walkthrough link", () => {
  it("includes the walkthrough link when one is set", async () => {
    h.url = "https://www.youtube.com/watch?v=abc123";
    await approve();
    expect(html()).toContain('href="https://www.youtube.com/watch?v=abc123"');
    expect(html()).toMatch(/setup walkthrough/);
  });

  it("leaves it out when none is set", async () => {
    await approve();
    expect(html()).not.toMatch(/walkthrough/);
    expect(html()).toContain("guidon"); // the rest of the email is intact
  });

  it("ignores a non-https link", async () => {
    h.url = "javascript:alert(1)";
    await approve();
    expect(html()).not.toMatch(/walkthrough/);
  });

  it("falls back to ONBOARDING_VIDEO_URL", async () => {
    process.env.ONBOARDING_VIDEO_URL = "https://drive.google.com/file/d/x/view";
    await approve();
    expect(html()).toContain("https://drive.google.com/file/d/x/view");
  });

  it("still sends the welcome if the settings read fails", async () => {
    h.settingThrows = true;
    await approve();
    expect(h.sendSpy).toHaveBeenCalledTimes(1);
  });
});
