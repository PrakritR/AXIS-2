import { describe, expect, it, vi } from "vitest";
import { backfillLedgerForResident } from "@/lib/reports/ledger-sync";

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
