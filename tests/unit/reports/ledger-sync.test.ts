import { describe, expect, it, vi } from "vitest";
import { backfillLedgerForResident, syncLedgerChargeEntry } from "@/lib/reports/ledger-sync";
import type { HouseholdCharge } from "@/lib/household-charges";

describe("backfillLedgerForResident", () => {
  it("queries charges scoped to resident user id and email", async () => {
    const or = vi.fn().mockReturnThis();
    const order = vi.fn().mockReturnThis();
    const limit = vi.fn().mockResolvedValue({ data: [], error: null });
    const select = vi.fn().mockReturnValue({ or, order, limit });
    const from = vi.fn().mockReturnValue({ select });

    const db = { from } as unknown as Parameters<typeof backfillLedgerForResident>[0];

    await backfillLedgerForResident(db, "resident-uuid", "Resident@Example.com");

    expect(from).toHaveBeenCalledWith("portal_household_charge_records");
    expect(or).toHaveBeenCalledWith("resident_user_id.eq.resident-uuid,resident_email.eq.resident@example.com");
  });
});

describe("syncLedgerChargeEntry", () => {
  it("throws when ledger insert fails", async () => {
    const insert = vi.fn().mockResolvedValue({ error: { message: "insert denied" } });
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const eq2 = vi.fn().mockReturnValue({ maybeSingle });
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 });
    const select = vi.fn().mockReturnValue({ eq: eq1 });
    const from = vi.fn().mockReturnValue({ select, insert });

    const db = { from } as unknown as Parameters<typeof syncLedgerChargeEntry>[0];
    const charge = {
      id: "charge-1",
      managerUserId: "mgr-1",
      residentUserId: "res-1",
      residentEmail: "r@example.com",
      propertyId: "prop-1",
      propertyLabel: "Unit 1",
      kind: "rent",
      status: "open",
      amountLabel: "$100.00",
      balanceLabel: "$100.00",
      title: "Rent",
      createdAt: "2026-01-01T00:00:00.000Z",
    } as HouseholdCharge;

    await expect(syncLedgerChargeEntry(db, charge)).rejects.toThrow("Ledger sync failed: insert denied");
  });
});
