import { describe, it, expect } from "vitest";
import { buildCrmList } from "@/lib/crm";
import type { Customer, CrmContact } from "@/lib/types";

// The CRM search matches on city / street / zip, so buildCrmList must carry the
// address onto every row — for both leads/prospects and customers.

const contact = {
  id: "lead-1", businessName: "Drive-By Tavern", contactName: "Sam", email: "",
  phone: "", streetAddress: "12 Bardstown Rd", city: "Louisville", state: "KY", zip: "40204",
  status: "lead", notes: "", tags: [], nextFollowupDate: null, nextFollowupNotes: "",
  convertedCustomerId: null, convertedAt: null, archivedAt: null, createdAt: "2026-06-01T00:00:00Z",
} as unknown as CrmContact;

const customer = {
  id: "cust-1", businessName: "Salty Landing", contactName: "Pat", email: "p@x.test",
  phone: "", streetAddress: "8 Market St", city: "Lexington", state: "KY", zip: "40507",
  abcPermitNumber: "", customerIdentification: "", preferredPaymentMethod: "no_preference",
  notes: "", tags: [], autoSendInvoices: false, archivedAt: null, createdAt: "2026-01-01T00:00:00Z",
} as unknown as Customer;

describe("buildCrmList carries address for search", () => {
  const rows = buildCrmList([contact], [customer], [], []);
  const leadRow = rows.find((r) => r.id === "lead-1")!;
  const custRow = rows.find((r) => r.id === "cust-1")!;

  it("carries street/city/state/zip for leads & prospects", () => {
    expect(leadRow.streetAddress).toBe("12 Bardstown Rd");
    expect(leadRow.city).toBe("Louisville");
    expect(leadRow.state).toBe("KY");
    expect(leadRow.zip).toBe("40204");
  });

  it("carries street/city/state/zip for customers", () => {
    expect(custRow.city).toBe("Lexington");
    expect(custRow.zip).toBe("40507");
    expect(custRow.streetAddress).toBe("8 Market St");
  });
});
