import { describe, it, expect } from "vitest";
import {
  buildCrmList,
  quietAccounts,
  lastOrderByCustomer,
  orderCountByCustomer,
  lastActivityBySubject,
  relativeDay,
  daysAgo,
  ORDER_ACTIVITY_LABEL,
} from "@/lib/crm";
import type { Customer, Order, CrmContact, CrmActivity } from "@/lib/types";

const NOW = new Date("2026-08-10T12:00:00Z");

function customer(id: string, businessName: string, extra: Partial<Customer> = {}): Customer {
  return {
    id,
    businessName,
    contactName: "Pat",
    email: `${id}@x.test`,
    phone: "8285551234",
    streetAddress: "", city: "", state: "", zip: "",
    abcPermitNumber: "", customerIdentification: "",
    preferredPaymentMethod: "no_preference",
    notes: "", tags: [], autoSendInvoices: false,
    archivedAt: null, createdAt: "2026-01-01T00:00:00Z",
    ...extra,
  } as unknown as Customer;
}

function order(id: string, customerId: string, createdAt: string, status = "completed"): Order {
  return { id, customerId, createdAt, status, items: [], kegReturns: [], subtotal: 0, totalDeposit: 0, total: 0, notes: "" } as unknown as Order;
}

function contact(id: string, businessName: string, extra: Partial<CrmContact> = {}): CrmContact {
  return {
    id, businessName, contactName: "", email: "", phone: "",
    streetAddress: "", city: "", state: "", zip: "",
    status: "lead", notes: "", tags: [],
    nextFollowupDate: null, nextFollowupNotes: "",
    convertedCustomerId: null, convertedAt: null, archivedAt: null,
    createdAt: "2026-06-01T00:00:00Z",
    ...extra,
  };
}

function activity(subject: { customerId?: string; contactId?: string }, type: CrmActivity["type"], occurredAt: string): CrmActivity {
  return {
    id: `act-${occurredAt}-${subject.customerId || subject.contactId}`,
    customerId: subject.customerId ?? null,
    contactId: subject.contactId ?? null,
    type, occurredAt, notes: "", source: "admin",
    createdAt: occurredAt,
  };
}

describe("lastOrderByCustomer / orderCountByCustomer", () => {
  const orders = [
    order("o1", "c1", "2026-07-01T00:00:00Z"),
    order("o2", "c1", "2026-08-01T00:00:00Z"),
    order("o3", "c2", "2026-05-01T00:00:00Z"),
  ];

  it("keeps the most recent order per customer", () => {
    expect(lastOrderByCustomer(orders).get("c1")).toBe("2026-08-01T00:00:00Z");
  });

  it("ignores cancelled orders — a cancellation is not a live relationship", () => {
    const withCancel = [...orders, order("o4", "c2", "2026-08-09T00:00:00Z", "cancelled")];
    expect(lastOrderByCustomer(withCancel).get("c2")).toBe("2026-05-01T00:00:00Z");
    expect(orderCountByCustomer(withCancel).get("c2")).toBe(1);
  });

  it("counts orders per customer", () => {
    expect(orderCountByCustomer(orders).get("c1")).toBe(2);
  });
});

describe("lastActivityBySubject", () => {
  it("keeps the most recent activity and its label", () => {
    const m = lastActivityBySubject([
      activity({ customerId: "c1" }, "cold_call", "2026-07-01T00:00:00Z"),
      activity({ customerId: "c1" }, "dropped_samples", "2026-08-05T00:00:00Z"),
    ]);
    expect(m.get("c1")).toEqual({ at: "2026-08-05T00:00:00Z", label: "Dropped off samples" });
  });

  it("keys contacts and customers in the same map", () => {
    const m = lastActivityBySubject([
      activity({ contactId: "lead-1" }, "spoke_phone", "2026-08-01T00:00:00Z"),
    ]);
    expect(m.get("lead-1")?.label).toBe("Spoke on phone");
  });

  it("skips an activity with no subject at all", () => {
    expect(lastActivityBySubject([activity({}, "cold_call", "2026-08-01T00:00:00Z")].map(a => ({ ...a, customerId: null, contactId: null }))).size).toBe(0);
  });
});

describe("buildCrmList — recent activity is the later of order and logged touch", () => {
  it("uses the order date when it is newer than the logged activity", () => {
    const rows = buildCrmList(
      [],
      [customer("c1", "Salty Landing")],
      [order("o1", "c1", "2026-08-05T00:00:00Z")],
      [activity({ customerId: "c1" }, "cold_call", "2026-07-01T00:00:00Z")],
    );
    expect(rows[0].recentActivityAt).toBe("2026-08-05T00:00:00Z");
    expect(rows[0].recentActivitySource).toBe(ORDER_ACTIVITY_LABEL);
  });

  it("uses the logged activity when it is newer than the order", () => {
    const rows = buildCrmList(
      [],
      [customer("c1", "Salty Landing")],
      [order("o1", "c1", "2026-07-01T00:00:00Z")],
      [activity({ customerId: "c1" }, "dropped_samples", "2026-08-05T00:00:00Z")],
    );
    expect(rows[0].recentActivityAt).toBe("2026-08-05T00:00:00Z");
    expect(rows[0].recentActivitySource).toBe("Dropped off samples");
  });

  it("works with orders only — the common case, since nobody logs by hand", () => {
    const rows = buildCrmList([], [customer("c1", "A")], [order("o1", "c1", "2026-08-01T00:00:00Z")], []);
    expect(rows[0].recentActivitySource).toBe(ORDER_ACTIVITY_LABEL);
  });

  it("works with logged activity only", () => {
    const rows = buildCrmList([], [customer("c1", "A")], [], [activity({ customerId: "c1" }, "cold_call", "2026-08-01T00:00:00Z")]);
    expect(rows[0].recentActivitySource).toBe("Cold call");
  });

  it("is null, not epoch, when there is neither", () => {
    const rows = buildCrmList([], [customer("c1", "A")], [], []);
    expect(rows[0].recentActivityAt).toBeNull();
    expect(rows[0].recentActivitySource).toBeNull();
  });
});

describe("buildCrmList — unioning contacts and customers", () => {
  const contacts = [
    contact("lead-1", "New Bar", { status: "lead" }),
    contact("lead-2", "Warm Bar", { status: "prospect" }),
  ];
  const customers = [customer("c1", "Salty Landing")];
  const orders = [order("o1", "c1", "2026-08-01T00:00:00Z")];

  it("returns leads, prospects and customers in one list", () => {
    const rows = buildCrmList(contacts, customers, orders, []);
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.status).sort()).toEqual(["customer", "lead", "prospect"]);
  });

  it("excludes a converted contact so it is not double-counted with its customer row", () => {
    const converted = [...contacts, contact("lead-3", "Promoted", { convertedAt: "2026-07-01T00:00:00Z", convertedCustomerId: "c1" })];
    const rows = buildCrmList(converted, customers, orders, []);
    expect(rows.find((r) => r.id === "lead-3")).toBeUndefined();
    expect(rows).toHaveLength(3);
  });

  it("excludes archived contacts and archived customers", () => {
    const rows = buildCrmList(
      [contact("lead-9", "Gone", { archivedAt: "2026-07-01T00:00:00Z" })],
      [customer("c9", "Also gone", { archivedAt: "2026-07-01T00:00:00Z" })],
      [], [],
    );
    expect(rows).toHaveLength(0);
  });

  it("carries order count and last order date for customers only", () => {
    const rows = buildCrmList(contacts, customers, orders, []);
    const cust = rows.find((r) => r.id === "c1")!;
    const lead = rows.find((r) => r.id === "lead-1")!;
    expect(cust.orderCount).toBe(1);
    expect(cust.lastOrderAt).toBe("2026-08-01T00:00:00Z");
    expect(lead.orderCount).toBe(0);
    expect(lead.lastOrderAt).toBeNull();
  });

  it("sorts coldest first, with never-touched at the very top", () => {
    const rows = buildCrmList(
      [contact("lead-never", "Never Called")],
      [customer("c-old", "Old"), customer("c-recent", "Recent")],
      [order("o1", "c-old", "2026-06-01T00:00:00Z"), order("o2", "c-recent", "2026-08-09T00:00:00Z")],
      [],
    );
    expect(rows.map((r) => r.id)).toEqual(["lead-never", "c-old", "c-recent"]);
  });
});

describe("quietAccounts", () => {
  const customers = [
    customer("c-quiet", "Gone Quiet"),
    customer("c-active", "Still Ordering"),
    customer("c-new", "Never Ordered"),
  ];
  const orders = [
    order("o1", "c-quiet", "2026-06-01T00:00:00Z"), // ~70 days before NOW
    order("o2", "c-active", "2026-08-08T00:00:00Z"), // 2 days
  ];

  it("lists customers past the threshold", () => {
    const q = quietAccounts(customers, orders, 45, NOW);
    expect(q.map((x) => x.id)).toEqual(["c-quiet"]);
    expect(q[0].daysSince).toBe(70);
  });

  it("excludes customers who ordered recently", () => {
    expect(quietAccounts(customers, orders, 45, NOW).find((x) => x.id === "c-active")).toBeUndefined();
  });

  it("excludes customers who never ordered — they are new, not quiet", () => {
    // Mixing never-ordered accounts into this list is what makes it ignorable.
    expect(quietAccounts(customers, orders, 45, NOW).find((x) => x.id === "c-new")).toBeUndefined();
  });

  it("excludes archived customers", () => {
    const q = quietAccounts(
      [customer("c-arch", "Archived", { archivedAt: "2026-07-01T00:00:00Z" })],
      [order("o", "c-arch", "2026-01-01T00:00:00Z")],
      45, NOW,
    );
    expect(q).toHaveLength(0);
  });

  it("honours a custom threshold in both directions", () => {
    expect(quietAccounts(customers, orders, 1, NOW).map((x) => x.id)).toEqual(["c-quiet", "c-active"]);
    expect(quietAccounts(customers, orders, 365, NOW)).toHaveLength(0);
  });

  it("sorts quietest first", () => {
    const q = quietAccounts(
      [customer("a", "A"), customer("b", "B")],
      [order("o1", "a", "2026-07-01T00:00:00Z"), order("o2", "b", "2026-05-01T00:00:00Z")],
      30, NOW,
    );
    expect(q.map((x) => x.id)).toEqual(["b", "a"]);
  });

  it("a cancelled last order does not make an account look active", () => {
    const q = quietAccounts(
      [customer("c", "C")],
      [order("o1", "c", "2026-05-01T00:00:00Z"), order("o2", "c", "2026-08-09T00:00:00Z", "cancelled")],
      45, NOW,
    );
    expect(q).toHaveLength(1);
    expect(q[0].lastOrderAt).toBe("2026-05-01T00:00:00Z");
  });
});

describe("relativeDay / daysAgo", () => {
  it("reads as elapsed time, not a date to subtract", () => {
    expect(relativeDay("2026-08-10T00:00:00Z", NOW)).toBe("today");
    expect(relativeDay("2026-08-09T00:00:00Z", NOW)).toBe("yesterday");
    expect(relativeDay("2026-07-18T12:00:00Z", NOW)).toBe("23d ago");
  });

  it("says never rather than showing a fake date", () => {
    expect(relativeDay(null, NOW)).toBe("never");
  });

  it("clamps a future timestamp to 0 instead of going negative", () => {
    expect(daysAgo("2026-09-01T00:00:00Z", NOW)).toBe(0);
  });
});
