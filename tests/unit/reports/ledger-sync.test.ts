import { describe, expect, it, vi } from "vitest";
import { syncLedgerChargeEntry } from "@/lib/reports/ledger-sync";
import type { HouseholdCharge } from "@/lib/household-charges";

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

    const ledgerDeleteEq = vi.fn().mockResolvedValue({ error: null });
    const chargeDeleteEq = vi.fn().mockResolvedValue({ error: null });
    const ledgerDeleteIn = vi.fn().mockReturnValue({ eq: ledgerDeleteEq });
    const chargeDeleteIn = vi.fn().mockReturnValue({ eq: chargeDeleteEq });
    const eqManager = vi.fn().mockResolvedValue({
      data: [
        { id: fallback.id, manager_user_id: "mgr-1", row_data: fallback },
        { id: canonical.id, manager_user_id: "mgr-1", row_data: canonical },
      ],
      error: null,
    });
    const chargeQuery: Record<string, unknown> = { eq: eqManager };
    chargeQuery.order = vi.fn().mockReturnValue(chargeQuery);
    chargeQuery.range = vi.fn().mockReturnValue(chargeQuery);
    const select = vi.fn().mockReturnValue(chargeQuery);
    const from = vi.fn((table: string) => {
      if (table === "portal_household_charge_records") {
        return {
          select,
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
    expect(ledgerDeleteEq).toHaveBeenCalledWith("manager_user_id", "mgr-1");
    expect(chargeDeleteIn).toHaveBeenCalledWith("id", [fallback.id]);
    expect(chargeDeleteEq).toHaveBeenCalledWith("manager_user_id", "mgr-1");
  });

  it("never deletes ids that are not record ids in the swept scope (crafted row_data)", async () => {
    const craftedLoser = {
      id: "hc_app_fee_app999",
      kind: "application_fee",
      residentEmail: "res@test.com",
      propertyId: "prop-1",
      managerUserId: "mgr-1",
      status: "pending",
      amountLabel: "$50.00",
      balanceLabel: "$50.00",
      title: "Application fee",
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    const craftedWinner = {
      ...craftedLoser,
      id: "hc_app_fee_app555",
      applicationId: "app555",
      status: "paid",
      balanceLabel: "$0.00",
      createdAt: "2026-01-02T00:00:00.000Z",
    };

    const ledgerDeleteIn = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
    const chargeDeleteIn = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
    const eqManager = vi.fn().mockResolvedValue({
      // Record ids deliberately differ from the attacker-influenced row_data.id.
      data: [
        { id: "own-record-1", manager_user_id: "mgr-1", row_data: craftedLoser },
        { id: "own-record-2", manager_user_id: "mgr-1", row_data: craftedWinner },
      ],
      error: null,
    });
    const chargeQuery: Record<string, unknown> = { eq: eqManager };
    chargeQuery.order = vi.fn().mockReturnValue(chargeQuery);
    chargeQuery.range = vi.fn().mockReturnValue(chargeQuery);
    const select = vi.fn().mockReturnValue(chargeQuery);
    const from = vi.fn((table: string) => {
      if (table === "portal_household_charge_records") {
        return { select, delete: vi.fn().mockReturnValue({ in: chargeDeleteIn }) };
      }
      if (table === "ledger_entries") return { delete: vi.fn().mockReturnValue({ in: ledgerDeleteIn }) };
      return { delete: vi.fn().mockReturnValue({ in: chargeDeleteIn }) };
    });

    const { reconcileDuplicateHouseholdChargeRecords } = await import("@/lib/reports/ledger-sync");
    const db = { from } as never;
    const result = await reconcileDuplicateHouseholdChargeRecords(db, "mgr-1");
    expect(result.removedChargeIds).toEqual([]);
    expect(ledgerDeleteIn).not.toHaveBeenCalled();
    expect(chargeDeleteIn).not.toHaveBeenCalled();
  });
});

describe("syncLedgerChargeEntry", () => {
  it("throws when ledger insert fails", async () => {
    const insert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: null, error: { message: "insert denied" } }),
      }),
    });
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

  it("keeps an already-stored Stripe checkout session id when re-syncing a charge", async () => {
    const updateEq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn().mockReturnValue({ eq: updateEq });
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { id: "ledger-1", stripe_checkout_session_id: "cs_test_123" },
      error: null,
    });
    const ledgerChain: Record<string, unknown> = { maybeSingle };
    ledgerChain.eq = vi.fn().mockReturnValue(ledgerChain);
    const select = vi.fn().mockReturnValue(ledgerChain);

    // Everything downstream (the GL mirror) just needs to no-op quietly.
    const glChain: Record<string, unknown> = {
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      single: vi.fn().mockResolvedValue({ data: { id: "je-1" }, error: null }),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    };
    glChain.eq = vi.fn().mockReturnValue(glChain);
    glChain.in = vi.fn().mockReturnValue(glChain);
    glChain.order = vi.fn().mockReturnValue(glChain);
    glChain.select = vi.fn().mockReturnValue(glChain);
    const from = vi.fn((table: string) =>
      table === "ledger_entries"
        ? { select, update, insert: vi.fn().mockResolvedValue({ error: null }) }
        : {
            select: glChain.select,
            insert: vi.fn().mockReturnValue(glChain),
            update: vi.fn().mockReturnValue(glChain),
            upsert: vi.fn().mockResolvedValue({ error: null }),
          },
    );

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

    await syncLedgerChargeEntry(db, charge);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ stripe_checkout_session_id: "cs_test_123" }),
    );
  });
});
