import { describe, expect, it } from "vitest";
import type { HouseholdCharge } from "@/lib/household-charges";
import type { ReportRow } from "@/lib/reports/types";
import { buildReceiptRows } from "@/lib/rent-receipts";
import {
  receiptRowLabel,
  recordedPaymentTitle,
  recordedPaymentsMissingFromCharges,
  residentLedgerReceiptRange,
} from "@/lib/resident-recorded-payments";

/**
 * Resident audit F6 (Payments "Paid 0" vs eleven receipts in Documents) and U9
 * (utilities payments labelled "Rent receipt").
 */

const ledgerRows: ReportRow[] = [
  { date: "2026-06-14", description: "Payment — Application fee", charge: "", payment: "$45.00", balance: "$0.00", sourceChargeId: "hc_fee_1", property: "The Pioneer" },
  { date: "2026-07-02", description: "Payment — Utilities — July 2026", charge: "", payment: "$85.00", balance: "$0.00", sourceChargeId: "hc_util_1", property: "The Pioneer" },
  { date: "2026-07-02", description: "Rent — July 2026", charge: "$2400.00", payment: "", balance: "$2400.00", sourceChargeId: "hc_rent_1", property: "The Pioneer" },
];

function paidCharge(id: string): HouseholdCharge {
  return {
    id,
    createdAt: "2026-07-01",
    residentEmail: "r@example.com",
    residentName: "R",
    residentUserId: null,
    propertyId: "p",
    propertyLabel: "The Pioneer",
    managerUserId: "m",
    kind: "utilities",
    title: "Utilities",
    amountLabel: "$85.00",
    balanceLabel: "$0.00",
    status: "paid",
    blocksLeaseUntilPaid: false,
  } as HouseholdCharge;
}

describe("recordedPaymentTitle / receiptRowLabel (U9)", () => {
  it("names what was actually paid instead of assuming rent", () => {
    expect(recordedPaymentTitle("Payment — Utilities — July 2026")).toBe("Utilities — July 2026");
    expect(recordedPaymentTitle("Payment — Security deposit")).toBe("Security deposit");
    expect(receiptRowLabel("Payment — Utilities — July 2026")).toBe("Receipt · Utilities — July 2026");
    expect(receiptRowLabel("Payment — Move-in fee")).toBe("Receipt · Move-in fee");
  });

  it("never falls back to a rent label when the description is empty", () => {
    expect(recordedPaymentTitle("")).toBe("Payment");
    expect(receiptRowLabel(null)).toBe("Receipt · Payment");
    const rows = buildReceiptRows([{ date: "2026-07-02", description: "", payment: "$85.00" }]);
    expect(rows[0]!.description).toBe("Payment");
    expect(receiptRowLabel(rows[0]!.description)).not.toContain("Rent");
  });
});

describe("recordedPaymentsMissingFromCharges (F6)", () => {
  it("surfaces a recorded payment whose charge row no longer exists", () => {
    const out = recordedPaymentsMissingFromCharges(ledgerRows, []);
    expect(out.map((c) => c.title)).toEqual(["Application fee", "Utilities — July 2026"]);
    expect(out.every((c) => c.status === "paid")).toBe(true);
    expect(out[0]!.amountLabel).toBe("$45.00");
    expect(out[0]!.paidAt).toBe("2026-06-14");
  });

  it("never duplicates a payment whose charge is still in the store", () => {
    const out = recordedPaymentsMissingFromCharges(ledgerRows, [paidCharge("hc_util_1")]);
    expect(out.map((c) => c.title)).toEqual(["Application fee"]);
  });

  it("ignores charge entries — only payments become receipts", () => {
    const chargesOnly = ledgerRows.filter((r) => !r.payment);
    expect(recordedPaymentsMissingFromCharges(chargesOnly, [])).toEqual([]);
  });

  it("keeps two genuinely identical payments distinct when neither carries a source id", () => {
    const twins: ReportRow[] = [
      { date: "2026-06-14", description: "Payment — Application fee", payment: "$45.00" },
      { date: "2026-06-14", description: "Payment — Application fee", payment: "$45.00" },
    ];
    expect(recordedPaymentsMissingFromCharges(twins, [])).toHaveLength(2);
  });

  it("Documents and Payments read the same ledger window", () => {
    const range = residentLedgerReceiptRange(new Date("2026-08-03T12:00:00Z"));
    expect(range).toEqual({ from: "2025-08-03", to: "2026-08-03" });
  });
});
