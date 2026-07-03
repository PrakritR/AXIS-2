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

describe("reconcileDuplicateHouseholdChargeRecords", () => {
  it("removes duplicate application-fee ledger rows and charge records", async () => {
    const fallback = {
      id: "hc_app_fee_res@test.com_prop1",
      kind: "application_fee",
      residentEmail: "res@test.com",
      propertyId: "prop-1",
      managerUserId: "mgr-1",
      status: "paid",
      amountLabel: "$50.00",
      balanceLabel: "$0.00",
      title: "Application fee",
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    const canonical = {
      ...fallback,
      id: "hc_app_fee_app123",
      applicationId: "app123",
    };

    const ledgerDeleteIn = vi.fn().mockResolvedValue({ error: null });
    const chargeDeleteIn = vi.fn().mockResolvedValue({ error: null });
    const eqManager = vi.fn().mockResolvedValue({
      data: [
        { id: fallback.id, row_data: fallback },
        { id: canonical.id, row_data: canonical },
      ],
      error: null,
    });
    const order = vi.fn().mockReturnValue({ eq: eqManager, limit: vi.fn().mockReturnValue({ eq: eqManager }) });
    const select = vi.fn().mockReturnValue({ order, eq: eqManager });
    const from = vi.fn((table: string) => {
      if (table === "portal_household_charge_records") {
        return {
          select,
          order,
          eq: vi.fn().mockReturnValue({ order, limit: vi.fn().mockReturnValue({ eq: eqManager }) }),
          delete: vi.fn().mockReturnValue({ in: chargeDeleteIn }),
        };
      }
      if (table === "ledger_entries") return { delete: vi.fn().mockReturnValue({ in: ledgerDeleteIn }) };
      return { delete: vi.fn().mockReturnValue({ in: chargeDeleteIn }) };
    });

    const { reconcileDuplicateHouseholdChargeRecords } = await import("@/lib/reports/ledger-sync");
    const db = { from } as never;
    const result = await reconcileDuplicateHouseholdChargeRecords(db, "mgr-1");
    expect(result.removedChargeIds).toEqual([fallback.id]);
    expect(ledgerDeleteIn).toHaveBeenCalledWith("source_charge_id", [fallback.id]);
    expect(chargeDeleteIn).toHaveBeenCalledWith("id", [fallback.id]);
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
      managerUserId: "3b9c2c65-6f0f-4d3a-9a3e-0b7f6f8a1c2d",
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

  it("skips demo/placeholder charges whose manager id is not a uuid", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn().mockReturnValue({ insert });

    const db = { from } as unknown as Parameters<typeof syncLedgerChargeEntry>[0];
    const charge = {
      id: "demo-hc-1",
      managerUserId: "demo-manager",
      residentUserId: "demo-resident",
      residentEmail: "demo@example.com",
      propertyId: "prop-1",
      propertyLabel: "Unit 1",
      kind: "rent",
      status: "open",
      amountLabel: "$100.00",
      balanceLabel: "$100.00",
      title: "Rent",
      createdAt: "2026-01-01T00:00:00.000Z",
    } as HouseholdCharge;

    await expect(syncLedgerChargeEntry(db, charge)).resolves.toBeUndefined();
    expect(insert).not.toHaveBeenCalled();
  });
});
