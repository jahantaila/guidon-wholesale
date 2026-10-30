import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

// Mike, 2026-10: (1) Guidon Brewing Co. (his own taproom) must always get a
// $0 invoice so taproom beer doesn't inflate the month's revenue, and
// (2) duplicate customer accounts need merging. Both run against the file
// store here: a temp data/ dir, so the real data/ is never touched.

vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => false,
  createAdminClient: () => {
    throw new Error("not used in file mode");
  },
}));

let tmp: string;
let data: typeof import("@/lib/data");

const write = (file: string, rows: unknown) =>
  fs.writeFileSync(path.join(tmp, "data", file), JSON.stringify(rows, null, 2));
const read = (file: string) => JSON.parse(fs.readFileSync(path.join(tmp, "data", file), "utf-8"));

const customer = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  businessName: id === "keep" ? "Taproom Bar" : "Taproom Bar (dup)",
  contactName: "",
  email: `${id}@test.co`,
  phone: "",
  streetAddress: "",
  city: "",
  state: "",
  zip: "",
  abcPermitNumber: "",
  preferredPaymentMethod: "no_preference",
  tags: [],
  notes: "",
  createdAt: "2026-01-01T00:00:00.000Z",
  ...extra,
});

beforeEach(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "guidon-merge-"));
  fs.mkdirSync(path.join(tmp, "data"));
  vi.spyOn(process, "cwd").mockReturnValue(tmp);
  vi.resetModules();
  data = await import("@/lib/data");
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("no-charge accounts", () => {
  it("toggles on and off and shows on the customer", async () => {
    write("customers.json", [customer("keep")]);
    expect((await data.getCustomer("keep"))?.noCharge).toBe(false);

    const updated = await data.updateCustomer("keep", { noCharge: true, notes: "taproom" });
    expect(updated?.noCharge).toBe(true);
    expect(updated?.notes).toBe("taproom");
    expect(await data.getNoChargeCustomerIds()).toEqual(["keep"]);
    expect((await data.getCustomers()).find((c) => c.id === "keep")?.noCharge).toBe(true);

    await data.updateCustomer("keep", { noCharge: false });
    expect(await data.getNoChargeCustomerIds()).toEqual([]);
  });

  it("does not flag an unknown customer", async () => {
    write("customers.json", []);
    expect(await data.updateCustomer("ghost", { noCharge: true })).toBeUndefined();
    expect(await data.getNoChargeCustomerIds()).toEqual([]);
  });
});

describe("mergeCustomers", () => {
  beforeEach(() => {
    write("customers.json", [
      customer("keep", { notes: "Main account", tags: ["priority"] }),
      customer("dup", { phone: "5025550100", city: "Louisville", streetAddress: "1 Main", state: "KY", zip: "40202", tags: ["net-30"], nextFollowupDate: "2026-11-05", nextFollowupNotes: "Call re: fall order" }),
    ]);
    write("orders.json", [{ id: "o1", customerId: "dup" }, { id: "o2", customerId: "keep" }, { id: "o3", customerId: "other" }]);
    write("invoices.json", [{ id: "i1", customerId: "dup" }]);
    write("keg-ledger.json", [{ id: "k1", customerId: "dup" }, { id: "k2", customerId: "dup" }]);
    write("crm-activities.json", [{ id: "a1", customerId: "dup", contactId: null }]);
    write("crm-contacts.json", [{ id: "c1", convertedCustomerId: "dup" }]);
  });

  it("previews what will move", async () => {
    const counts = await data.countCustomerRecords("dup");
    expect(counts).toMatchObject({ orders: 1, invoices: 1, kegLedger: 2, crmActivities: 1, crmContacts: 1, orderTemplates: 0, recurringOrders: 0 });
  });

  it("moves every record to the kept account and archives the duplicate", async () => {
    const moved = await data.mergeCustomers("dup", "keep");
    expect(moved.orders).toBe(1);

    expect(read("orders.json").map((o: { customerId: string }) => o.customerId)).toEqual(["keep", "keep", "other"]);
    expect(read("invoices.json")[0].customerId).toBe("keep");
    expect(read("keg-ledger.json").every((k: { customerId: string }) => k.customerId === "keep")).toBe(true);
    expect(read("crm-activities.json")[0].customerId).toBe("keep");
    expect(read("crm-contacts.json")[0].convertedCustomerId).toBe("keep");

    const [keep, dup] = read("customers.json");
    // Kept account keeps its identity, gains what it was missing.
    expect(keep.email).toBe("keep@test.co");
    expect(keep.phone).toBe("5025550100");
    expect(keep.city).toBe("Louisville");
    expect(keep.tags).toEqual(["priority", "net-30"]);
    expect(keep.nextFollowupDate).toBe("2026-11-05");
    expect(keep.notes).toContain("Main account");
    // Duplicate is archived with a note, not deleted.
    expect(dup.archivedAt).toBeTruthy();
    expect(dup.notes).toContain("Merged into Taproom Bar (keep)");
    expect(dup.nextFollowupDate).toBeNull();
  });

  it("carries the no-charge flag over to the kept account", async () => {
    await data.updateCustomer("dup", { noCharge: true });
    await data.mergeCustomers("dup", "keep");
    expect(await data.getNoChargeCustomerIds()).toEqual(["keep"]);
  });

  it("refuses to merge an account into itself, a missing one, or an archived one", async () => {
    await expect(data.mergeCustomers("keep", "keep")).rejects.toThrow(/different/);
    await expect(data.mergeCustomers("nope", "keep")).rejects.toThrow(/not found/);
    await data.updateCustomer("keep", { archivedAt: "2026-10-01T00:00:00.000Z" });
    await expect(data.mergeCustomers("dup", "keep")).rejects.toThrow(/archived/);
    expect(read("orders.json")[0].customerId).toBe("dup");
  });
});
