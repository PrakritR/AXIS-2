/**
 * Client-built `ReportResult`s for the manager Finances tab in the `/demo`
 * sandbox. The real tab fetches `/api/reports/*` (Supabase `ledger_entries` /
 * `manager_expense_entries`), which requires auth the demo doesn't have — so
 * the demo derives the same shapes locally: income from the seeded household
 * charges (it stays live if a visitor marks a charge paid), expenses from the
 * static demo register. Date-range filters are ignored on purpose: the demo
 * dataset is relative to "now" and should always render populated.
 */
import type { ReportResult } from "@/lib/reports/types";
import type { OccupancyReport, PropertyRentReceiptDocument } from "@/lib/reports/formal-documents/spec";
import { readChargesForManager } from "@/lib/household-charges";
import { readManagerOutgoingExpenses } from "@/lib/manager-outgoing-payments";
import { centsToUsd } from "@/lib/reports/money";
import { DEMO_MANAGER_USER_ID } from "@/lib/demo/demo-session";
import { demoApplications, demoExpenseRows, demoProperties, PROP_LABEL } from "@/lib/demo/demo-data";

function amountToCents(label: string): number {
  const n = Number.parseFloat(label.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function chargeCategoryLabel(kind: string): string {
  if (kind === "utilities" || kind === "prorated_utilities") return "Utilities";
  if (kind === "late_fee") return "Late fee";
  return "Rent";
}

function demoIncomeReport(propertyId?: string): ReportResult {
  const rows = readChargesForManager(DEMO_MANAGER_USER_ID)
    .filter((charge) => charge.status === "paid" && charge.paidAt)
    .filter((charge) => !propertyId || charge.propertyId === propertyId)
    .sort((a, b) => String(b.paidAt).localeCompare(String(a.paidAt)))
    .map((charge) => ({
      date: String(charge.paidAt).slice(0, 10),
      description: charge.title,
      category: chargeCategoryLabel(charge.kind),
      amount: charge.amountLabel,
      property: charge.propertyLabel,
      resident: charge.residentName,
    }));
  const totalCents = rows.reduce((sum, row) => sum + amountToCents(row.amount), 0);
  return {
    id: "rent-receipts",
    title: "Rent collection summary",
    columns: [
      { key: "date", label: "Date received", format: "date" },
      { key: "description", label: "Description" },
      { key: "category", label: "Type" },
      { key: "amount", label: "Amount", align: "right", format: "money" },
      { key: "property", label: "Property" },
      { key: "resident", label: "Resident" },
    ],
    rows,
    totals: { date: "Total rent collected", description: "", category: "", amount: centsToUsd(totalCents), property: "", resident: "" },
  };
}

function demoExpensesReport(propertyId?: string): ReportResult {
  const propertyLabel = propertyId ? PROP_LABEL[propertyId] : undefined;
  const rows = readManagerOutgoingExpenses()
    .filter((row) => !propertyLabel || row.propertyName === propertyLabel)
    .map((row) => ({
      id: row.id,
      date: row.expenseDate,
      category: row.categoryLabel,
      scheduleERef: "",
      taxStatus: "",
      amount: centsToUsd(row.amountCents),
      vendor: "",
      memo: row.memo ?? "",
      property: row.propertyName ?? "",
    }));
  const totalCents = rows.reduce((sum, row) => sum + amountToCents(row.amount), 0);
  return {
    id: "expenses",
    title: "Property Expense Register (Schedule E)",
    columns: [
      { key: "date", label: "Date", format: "date" },
      { key: "category", label: "Category" },
      { key: "scheduleERef", label: "Sch. E Line" },
      { key: "taxStatus", label: "Tax status" },
      { key: "amount", label: "Amount", align: "right", format: "money" },
      { key: "vendor", label: "Vendor" },
      { key: "memo", label: "Description" },
      { key: "property", label: "Property" },
    ],
    rows,
    totals: { date: "Total expenses", category: "", scheduleERef: "", taxStatus: "", amount: centsToUsd(totalCents), vendor: "", memo: "", property: "" },
  };
}

/** Build the demo stand-in for `/api/reports/<reportId>` (Finances tab only). */
export function buildDemoFinanceReport(reportId: string, propertyId?: string): ReportResult {
  return reportId === "expenses" ? demoExpensesReport(propertyId) : demoIncomeReport(propertyId);
}

// --- manager Documents tab (formal reports) ----------------------------------

type DemoTenancy = {
  propertyId: string;
  propertyLabel: string;
  unit: string;
  resident: string;
  residentEmail: string;
  leaseStart: string;
  leaseEnd: string;
  daysRented: number;
  daysAvailable: number;
  occupied: boolean;
};

const DEMO_LANDLORD_NAME = "Alex Morgan — PropLane Housing Management";
const DEMO_LANDLORD_ADDRESS = "5259 Brooklyn Ave NE, Seattle, WA 98105";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function yearStartIso(): string {
  return `${new Date().getFullYear()}-01-01`;
}

function daysBetween(fromIso: string, toIso: string): number {
  const from = new Date(`${fromIso}T12:00:00`).getTime();
  const to = new Date(`${toIso}T12:00:00`).getTime();
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return 0;
  return Math.round((to - from) / 86_400_000) + 1;
}

/**
 * One tenancy row per demo property, derived from the approved demo
 * applications (each demo listing has a single unit). Days rented are the
 * overlap of the tenancy with the year-to-date window.
 */
function demoTenancies(): DemoTenancy[] {
  const apps = new Map(
    demoApplications()
      .filter((a) => a.bucket === "approved" && a.assignedPropertyId)
      .map((a) => [a.assignedPropertyId as string, a]),
  );
  const from = yearStartIso();
  const to = todayIso();
  const daysAvailable = daysBetween(from, to);
  return demoProperties().map((property) => {
    const app = apps.get(property.id);
    const leaseStart = app?.application?.leaseStart ?? "";
    const leaseEnd = app?.application?.leaseEnd ?? "";
    const startDate = leaseStart ? new Date(leaseStart) : null;
    const started = Boolean(startDate && !Number.isNaN(startDate.getTime()) && startDate.getTime() <= Date.now());
    const startIso = started && startDate ? startDate.toISOString().slice(0, 10) : "";
    const daysRented = started && startIso ? Math.min(daysAvailable, daysBetween(startIso < from ? from : startIso, to)) : 0;
    return {
      propertyId: property.id,
      propertyLabel: PROP_LABEL[property.id] ?? property.title,
      unit: property.unitLabel ?? "Unit",
      resident: app?.name ?? "",
      residentEmail: app?.email ?? "",
      leaseStart,
      leaseEnd,
      daysRented,
      daysAvailable,
      occupied: started,
    };
  });
}

function paidCentsByProperty(propertyId?: string): Map<string, { cents: number; count: number }> {
  const byProperty = new Map<string, { cents: number; count: number }>();
  for (const charge of readChargesForManager(DEMO_MANAGER_USER_ID)) {
    if (charge.status !== "paid" || !charge.paidAt) continue;
    if (propertyId && charge.propertyId !== propertyId) continue;
    const entry = byProperty.get(charge.propertyId) ?? { cents: 0, count: 0 };
    entry.cents += amountToCents(charge.amountLabel);
    entry.count += 1;
    byProperty.set(charge.propertyId, entry);
  }
  return byProperty;
}

/** Demo stand-in for `/api/reports/formal-documents/preview?type=property_rent_receipt`. */
export function buildDemoRentReceiptDocuments(propertyId?: string): {
  documents: PropertyRentReceiptDocument[];
  preview: ReportResult;
} {
  const income = paidCentsByProperty(propertyId);
  const documents = demoTenancies()
    .filter((t) => (!propertyId || t.propertyId === propertyId) && (income.get(t.propertyId)?.cents ?? 0) > 0)
    .map((t) => {
      const entry = income.get(t.propertyId)!;
      return {
        id: `demo-rr-${t.propertyId}`,
        propertyId: t.propertyId,
        propertyLabel: t.propertyLabel,
        issueDate: todayIso(),
        periodFrom: yearStartIso(),
        periodTo: todayIso(),
        landlordName: DEMO_LANDLORD_NAME,
        landlordAddress: DEMO_LANDLORD_ADDRESS,
        daysRented: t.daysRented,
        daysAvailable: t.daysAvailable,
        rentCollected: centsToUsd(entry.cents),
        receiptCount: entry.count,
        rentalUsePct: t.daysAvailable > 0 ? Math.round((t.daysRented / t.daysAvailable) * 100) : 0,
        units: [
          {
            unit: t.unit,
            resident: t.resident || "—",
            daysRented: t.daysRented,
            daysAvailable: t.daysAvailable,
            rentCollected: centsToUsd(entry.cents),
            receiptCount: entry.count,
          },
        ],
        grossIncomeCents: entry.cents,
      };
    });
  return { documents, preview: demoIncomeReport(propertyId) };
}

/** Demo stand-in for `/api/reports/occupancy`. */
export function buildDemoOccupancyReport(propertyId?: string): OccupancyReport {
  const groups = demoTenancies()
    .filter((t) => !propertyId || t.propertyId === propertyId)
    .map((t) => ({
      propertyId: t.propertyId,
      propertyLabel: t.propertyLabel,
      totalUnits: 1,
      occupiedUnits: t.occupied ? 1 : 0,
      vacantUnits: t.occupied ? 0 : 1,
      daysRented: t.daysRented,
      daysAvailable: t.daysAvailable,
      occupancyPct: t.daysAvailable > 0 ? Math.round((t.daysRented / t.daysAvailable) * 100) : 0,
      units: [
        {
          unit: t.unit,
          resident: t.resident || "—",
          leaseStart: t.leaseStart,
          leaseEnd: t.leaseEnd,
          daysRented: t.daysRented,
          daysAvailable: t.daysAvailable,
          occupancyPct: t.daysAvailable > 0 ? Math.round((t.daysRented / t.daysAvailable) * 100) : 0,
          status: (t.occupied ? "occupied" : "vacant") as "occupied" | "vacant",
        },
      ],
    }));
  const totalUnits = groups.length;
  const occupiedUnits = groups.reduce((sum, g) => sum + g.occupiedUnits, 0);
  const totalDaysRented = groups.reduce((sum, g) => sum + g.daysRented, 0);
  const totalDaysAvailable = groups.reduce((sum, g) => sum + g.daysAvailable, 0);
  return {
    id: "demo-occupancy",
    issueDate: todayIso(),
    periodFrom: yearStartIso(),
    periodTo: todayIso(),
    landlordName: DEMO_LANDLORD_NAME,
    landlordAddress: DEMO_LANDLORD_ADDRESS,
    properties: groups,
    portfolioOccupancyPct: totalDaysAvailable > 0 ? Math.round((totalDaysRented / totalDaysAvailable) * 100) : 0,
    totalUnits,
    occupiedUnits,
  };
}

/** Demo stand-in for `/api/reports/1099-candidates` — vendor totals from the demo expense register. */
export function buildDemo1099Report(taxYear: string): ReportResult {
  const totals = new Map<string, number>();
  for (const row of [] as Array<{ vendor: string; amount: string }>) {
    totals.set(row.vendor, (totals.get(row.vendor) ?? 0) + amountToCents(row.amount));
  }
  const rows = [...totals.entries()]
    .filter(([, cents]) => cents >= 60_000)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([vendor, cents], i) => ({
      vendorId: `demo-vendor-1099-${i}`,
      vendorName: vendor,
      // First candidate reads as ready-to-file, the second shows the
      // missing-W-9 chase state the feature exists for.
      legalName: i === 0 ? `${vendor} LLC` : "",
      totalPaid: centsToUsd(cents),
      w9Status: i === 0 ? "Complete" : "Missing TIN",
      missingFields: i === 0 ? "" : "tin, legal name",
    }));
  return {
    id: "1099-candidates",
    title: `1099-NEC candidates (${taxYear})`,
    columns: [
      { key: "vendorName", label: "Vendor" },
      { key: "legalName", label: "Legal name" },
      { key: "totalPaid", label: "Total paid", align: "right", format: "money" },
      { key: "w9Status", label: "W-9 status" },
      { key: "missingFields", label: "Missing fields" },
    ],
    rows,
    meta: { taxYear, thresholdCents: 60_000 },
  };
}

/** Demo stand-in for `/api/reports/tax-summary`. */
export function buildDemoTaxSummaryReport(propertyId?: string): ReportResult {
  const income = paidCentsByProperty(propertyId);
  const tenancies = demoTenancies().filter((t) => !propertyId || t.propertyId === propertyId);
  const expenseCentsByLabel = new Map<string, number>();
  let deductibleCents = 0;
  const expenseRows = ([] as Array<{ property: string; amount: string }>).filter(
    (row) => !propertyId || row.property === (PROP_LABEL[propertyId] ?? ""),
  );
  for (const row of expenseRows) {
    const cents = amountToCents(row.amount);
    expenseCentsByLabel.set(row.property, (expenseCentsByLabel.get(row.property) ?? 0) + cents);
    deductibleCents += cents;
  }
  const rows = tenancies.map((t) => {
    const earned = income.get(t.propertyId)?.cents ?? 0;
    const spent = expenseCentsByLabel.get(t.propertyLabel) ?? 0;
    return {
      property: t.propertyLabel,
      daysRented: t.daysRented,
      rentEarned: centsToUsd(earned),
      houseSpent: centsToUsd(spent),
      // Demo expense seed data is all deductible.
      deductibleExpenses: centsToUsd(spent),
      nonDeductibleExpenses: centsToUsd(0),
      netIncome: centsToUsd(earned - spent),
    };
  });
  const totalEarned = [...income.values()].reduce((sum, e) => sum + e.cents, 0);
  const totalSpent = expenseRows.reduce((sum, row) => sum + amountToCents(row.amount), 0);
  const totalDays = tenancies.reduce((sum, t) => sum + t.daysRented, 0);
  return {
    id: "tax-summary",
    title: "Tax summary",
    columns: [
      { key: "property", label: "Property" },
      { key: "daysRented", label: "Days rented", align: "right", format: "number" },
      { key: "rentEarned", label: "Rent earned", align: "right", format: "money" },
      { key: "houseSpent", label: "Repairs & expenses", align: "right", format: "money" },
      { key: "deductibleExpenses", label: "Deductible", align: "right", format: "money" },
      { key: "nonDeductibleExpenses", label: "Non-deductible", align: "right", format: "money" },
      { key: "netIncome", label: "Net", align: "right", format: "money" },
    ],
    rows,
    totals: {
      property: "Portfolio total",
      daysRented: totalDays,
      rentEarned: centsToUsd(totalEarned),
      houseSpent: centsToUsd(totalSpent),
      deductibleExpenses: centsToUsd(deductibleCents),
      nonDeductibleExpenses: centsToUsd(0),
      netIncome: centsToUsd(totalEarned - totalSpent),
    },
    meta: {
      from: yearStartIso(),
      to: todayIso(),
      totalEarned: centsToUsd(totalEarned),
      totalSpent: centsToUsd(totalSpent),
      totalDaysRented: totalDays,
      netIncome: centsToUsd(totalEarned - totalSpent),
      totalDeductibleExpenses: centsToUsd(deductibleCents),
      totalNonDeductibleExpenses: centsToUsd(0),
      expenseCount: expenseRows.length,
    },
  };
}
