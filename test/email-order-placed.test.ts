import { describe, it, expect, beforeEach, vi } from "vitest";

// Force the Resend SDK through a spy so we can capture every outgoing email
// payload. notifyOrderPlaced issues two sends (customer + admin) and we
// assert neither contains the delivery date.
const sendSpy = vi.fn(async () => ({ data: { id: "test" }, error: null }));

vi.mock("resend", () => ({
  Resend: class MockResend {
    emails = { send: sendSpy };
  },
}));

vi.mock("@/lib/data", () => ({
  getNotificationEmails: vi.fn(async () => ["admin@test.example"]),
}));

process.env.RESEND_API_KEY = "test-key";
process.env.EMAIL_DISABLED = "";

import { notifyOrderPlaced } from "@/lib/email";

describe("notifyOrderPlaced — customer + admin emails", () => {
  beforeEach(() => {
    sendSpy.mockClear();
  });

  it("does NOT mention the delivery date anywhere in the confirmation emails (regression: Bug 2)", async () => {
    await notifyOrderPlaced({
      orderId: "ord_abc",
      customerEmail: "customer@test.example",
      customerName: "Jane",
      businessName: "Test Tavern",
      items: [{ productName: "Amber Ale", size: "1/2bbl", quantity: 2, unitPrice: 180 }],
      subtotal: 360,
      totalDeposit: 100,
      total: 460,
      deliveryDate: "2026-05-01",
      notes: "leave at back door",
    });

    expect(sendSpy).toHaveBeenCalled();
    const calls = sendSpy.mock.calls.map((args) => args[0] as { subject: string; html: string });
    expect(calls.length).toBeGreaterThanOrEqual(2);

    for (const msg of calls) {
      expect(msg.subject).not.toContain("2026-05-01");
      expect(msg.html).not.toContain("2026-05-01");
      expect(msg.html.toLowerCase()).not.toMatch(/delivery:\s*<strong/i);
    }
  });

  it("still mentions the business name + order id so admin can act on the message", async () => {
    await notifyOrderPlaced({
      orderId: "ord_xyz",
      customerEmail: "customer@test.example",
      customerName: "Mike",
      businessName: "Riverside Pub",
      items: [{ productName: "IPA", size: "1/6bbl", quantity: 1, unitPrice: 80 }],
      subtotal: 80,
      totalDeposit: 30,
      total: 110,
      deliveryDate: "2026-05-10",
    });

    const calls = sendSpy.mock.calls.map((args) => args[0] as { to: string | string[]; html: string });
    const adminMessage = calls.find((m) => (Array.isArray(m.to) ? m.to.includes("admin@test.example") : m.to === "admin@test.example"));
    expect(adminMessage).toBeTruthy();
    expect(adminMessage!.html).toContain("Riverside Pub");
    expect(adminMessage!.html).toContain("ord_xyz");
  });
});
