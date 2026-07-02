import { afterEach, describe, expect, it, vi } from "vitest";
import {
  chargeDueLabel,
  chargeVisibleToManager,
  dedupeHouseholdCharges,
  duplicateHouseholdChargeIds,
  householdChargeToLedgerRow,
  isHouseholdChargeOverdue,
  mergeHouseholdChargesWithServer,
} from "@/lib/household-charges";
import type { HouseholdCharge } from "@/lib/household-charges";

function makeCharge(overrides: Partial<HouseholdCharge> = {}): HouseholdCharge {
  return {
    id: "chg-1",
    kind: "rent",
    status: "pending",
    amountLabel: "$100.00",
    balanceLabel: "$100.00",
    dueDateLabel: "Mar 1, 2026",
    residentEmail: "r@test.com",
    residentName: "Resident",
    propertyId: "prop-1",
    propertyLabel: "Test Property",
    managerUserId: "mgr-1",
    rentMonth: "2026-03",
    createdAt: "2026-01-01T00:00:00.000Z",
    title: "Rent — March 2026",
    ...overrides,
  } as HouseholdCharge;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("household-charges pure helpers", () => {
  it("detects overdue charges", () => {
    const overdue = makeCharge({ dueDateLabel: "Jan 1, 2020" });
    expect(isHouseholdChargeOverdue(overdue, new Date("2026-06-01"))).toBe(true);
    expect(isHouseholdChargeOverdue(makeCharge({ status: "paid" }), new Date("2026-06-01"))).toBe(false);
  });

  it("returns due label", () => {
    expect(chargeDueLabel(makeCharge({ dueDateLabel: "Due tomorrow" }))).toBe("Due tomorrow");
  });

  it("filters charges visible to manager", () => {
    expect(chargeVisibleToManager(makeCharge({ managerUserId: "mgr-1" }), "mgr-1")).toBe(true);
    expect(chargeVisibleToManager(makeCharge({ managerUserId: "mgr-2" }), "mgr-1")).toBe(false);
  });

  it("maps paid charges to the paid bucket even when due date is in the past", () => {
    const paid = makeCharge({
      status: "paid",
      paidAt: "2026-06-01T12:00:00.000Z",
      balanceLabel: "$0.00",
      dueDateLabel: "Jan 1, 2020",
    });
    expect(householdChargeToLedgerRow(paid).bucket).toBe("paid");
    expect(householdChargeToLedgerRow(paid).statusLabel).toBe("Paid");
  });

  it("dedupes charges hydrated with a missing residentEmail without crashing", () => {
    // Regression: rows hydrated from localStorage/server JSON are cast as
    // HouseholdCharge without validation, so residentEmail/residentName can be
    // undefined. chargeBusinessKey() calls .trim() on residentEmail, which
    // previously threw "undefined is not an object (evaluating 't.trim')" and
    // took down the whole manager Payments tab via the error boundary.
    const missingEmail = makeCharge({
      id: "chg-missing-email",
      residentEmail: undefined as unknown as string,
      residentName: undefined as unknown as string,
    });
    let result: ReturnType<typeof dedupeHouseholdCharges> = [];
    expect(() => {
      result = dedupeHouseholdCharges([missingEmail]);
    }).not.toThrow();
    expect(result).toHaveLength(1);
    // Coerced to "" so every downstream .trim() consumer is safe.
    expect(result[0]!.residentEmail).toBe("");
    expect(result[0]!.residentName).toBe("");
  });
});

describe("syncHouseholdChargesFromServer", () => {
  it("starts a new request for forced syncs while another sync is in flight", async () => {
    vi.resetModules();

    const session = new Map<string, string>();
    vi.stubGlobal("window", {
      sessionStorage: {
        getItem: vi.fn((key: string) => session.get(key) ?? null),
        setItem: vi.fn((key: string, value: string) => {
          session.set(key, value);
        }),
      },
      dispatchEvent: vi.fn(),
    });

    let resolveFirst: (value: { ok: true; json: () => Promise<{ charges: HouseholdCharge[]; rentProfiles: [] }> }) => void;
    const firstResponse = new Promise<{ ok: true; json: () => Promise<{ charges: HouseholdCharge[]; rentProfiles: [] }> }>(
      (resolve) => {
        resolveFirst = resolve;
      },
    );
    const fetchMock = vi.fn()
      .mockReturnValueOnce(firstResponse)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ charges: [makeCharge({ id: "mgr-b-charge", managerUserId: "mgr-b" })], rentProfiles: [] }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const { syncHouseholdChargesFromServer } = await import("@/lib/household-charges");

    const firstSync = syncHouseholdChargesFromServer(false);
    const forcedSync = syncHouseholdChargesFromServer(true);

    expect(fetchMock).toHaveBeenCalledTimes(2);

    resolveFirst!({
      ok: true,
      json: async () => ({ charges: [makeCharge({ id: "mgr-a-charge", managerUserId: "mgr-a" })], rentProfiles: [] }),
    });

    await expect(forcedSync).resolves.toEqual(
      expect.objectContaining({
        charges: expect.arrayContaining([expect.objectContaining({ managerUserId: "mgr-b" })]),
      }),
    );
    await firstSync;
  });
});

describe("mergeHouseholdChargesWithServer", () => {
  it("keeps local paid status when server still has pending for the same charge id", () => {
    const server = makeCharge({ id: "chg-1", status: "pending" });
    const local = makeCharge({
      id: "chg-1",
      status: "paid",
      paidAt: "2026-06-10T12:00:00.000Z",
      balanceLabel: "$0.00",
    });

    const { merged, hasUpdated } = mergeHouseholdChargesWithServer([server], [local]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.status).toBe("paid");
    expect(hasUpdated).toBe(true);
  });

  it("keeps local paid status when server pending row uses a different id for the same bill", () => {
    const server = makeCharge({ id: "server-rent-row", status: "pending" });
    const local = makeCharge({
      id: "local-rent-row",
      status: "paid",
      paidAt: "2026-06-10T12:00:00.000Z",
      balanceLabel: "$0.00",
    });

    const { merged, hasUpdated } = mergeHouseholdChargesWithServer([server], [local]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.status).toBe("paid");
    expect(merged[0]?.id).toBe("local-rent-row");
    expect(hasUpdated).toBe(true);
  });

  it("inherits server paid status when local is still pending", () => {
    const server = makeCharge({
      id: "chg-1",
      status: "paid",
      paidAt: "2026-06-10T12:00:00.000Z",
      balanceLabel: "$0.00",
    });
    const local = makeCharge({ id: "chg-1", status: "pending" });

    const { merged } = mergeHouseholdChargesWithServer([server], [local]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.status).toBe("paid");
  });

  it("dedupes duplicate pending/paid rows to a single paid charge", () => {
    const serverPending = makeCharge({ id: "server-row", status: "pending" });
    const serverPaid = makeCharge({
      id: "paid-row",
      status: "paid",
      paidAt: "2026-06-10T12:00:00.000Z",
      balanceLabel: "$0.00",
    });
    const localPaid = makeCharge({
      id: "local-row",
      status: "paid",
      paidAt: "2026-06-11T12:00:00.000Z",
      balanceLabel: "$0.00",
    });

    const { merged } = mergeHouseholdChargesWithServer([serverPending, serverPaid], [localPaid]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.status).toBe("paid");
  });

  it("dedupes duplicate application-fee rows to one canonical charge id", () => {
    const fallback = makeCharge({
      id: "hc_app_fee_res@test.com_prop1",
      kind: "application_fee",
      residentEmail: "res@test.com",
      propertyId: "prop-1",
      status: "paid",
      paidAt: "2026-06-10T12:00:00.000Z",
      balanceLabel: "$0.00",
      amountLabel: "$50.00",
    });
    const canonical = makeCharge({
      id: "hc_app_fee_app123",
      kind: "application_fee",
      applicationId: "app123",
      residentEmail: "res@test.com",
      propertyId: "prop-1",
      status: "paid",
      paidAt: "2026-06-10T12:00:00.000Z",
      balanceLabel: "$0.00",
      amountLabel: "$50.00",
    });

    const merged = dedupeHouseholdCharges([fallback, canonical]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.id).toBe("hc_app_fee_app123");
    expect(duplicateHouseholdChargeIds([fallback, canonical])).toEqual(["hc_app_fee_res@test.com_prop1"]);
  });
});
