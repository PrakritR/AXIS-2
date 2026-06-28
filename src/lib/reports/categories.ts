import type { HouseholdChargeKind } from "@/lib/household-charges";

export type ChartAccount = {
  code: string;
  name: string;
  accountType: "income" | "expense";
  scheduleELine?: number;
  scheduleERef?: string;
  scheduleELabel?: string;
};

export const SYSTEM_CHART_ACCOUNTS: ChartAccount[] = [
  { code: "rent_income", name: "Rent Income", accountType: "income", scheduleELine: 3, scheduleERef: "Sch. E, Line 3", scheduleELabel: "Rents Received" },
  { code: "late_fees", name: "Late Fees", accountType: "income", scheduleELine: 3, scheduleERef: "Sch. E, Line 3", scheduleELabel: "Rents Received" },
  { code: "pet_rent", name: "Pet Rent", accountType: "income", scheduleELine: 3, scheduleERef: "Sch. E, Line 3", scheduleELabel: "Rents Received" },
  { code: "application_fee", name: "Application Fee", accountType: "income", scheduleELine: 3, scheduleERef: "Sch. E, Line 3", scheduleELabel: "Rents Received" },
  { code: "other_income", name: "Other Income", accountType: "income", scheduleELine: 3, scheduleERef: "Sch. E, Line 3", scheduleELabel: "Rents Received" },
  { code: "maintenance", name: "Maintenance", accountType: "expense", scheduleELine: 14, scheduleERef: "Sch. E, Line 14", scheduleELabel: "Repairs" },
  { code: "cleaning", name: "Cleaning", accountType: "expense", scheduleELine: 7, scheduleERef: "Sch. E, Line 7", scheduleELabel: "Cleaning and Maintenance" },
  { code: "plumbing", name: "Plumbing", accountType: "expense", scheduleELine: 14, scheduleERef: "Sch. E, Line 14", scheduleELabel: "Repairs" },
  { code: "mold_remediation", name: "Mold Remediation", accountType: "expense", scheduleELine: 14, scheduleERef: "Sch. E, Line 14", scheduleELabel: "Repairs" },
  { code: "materials", name: "Materials / Equipment", accountType: "expense", scheduleELine: 15, scheduleERef: "Sch. E, Line 15", scheduleELabel: "Supplies" },
  { code: "mortgage", name: "Mortgage", accountType: "expense", scheduleELine: 12, scheduleERef: "Sch. E, Line 12", scheduleELabel: "Mortgage Interest" },
  { code: "utilities", name: "Utilities", accountType: "expense", scheduleELine: 17, scheduleERef: "Sch. E, Line 17", scheduleELabel: "Utilities" },
  { code: "electricity", name: "Electricity", accountType: "expense", scheduleELine: 17, scheduleERef: "Sch. E, Line 17", scheduleELabel: "Utilities" },
  { code: "heating", name: "Heating / HVAC", accountType: "expense", scheduleELine: 17, scheduleERef: "Sch. E, Line 17", scheduleELabel: "Utilities" },
  { code: "wifi", name: "Wi‑Fi / Internet", accountType: "expense", scheduleELine: 17, scheduleERef: "Sch. E, Line 17", scheduleELabel: "Utilities" },
  { code: "property_tax", name: "Property Tax", accountType: "expense", scheduleELine: 16, scheduleERef: "Sch. E, Line 16", scheduleELabel: "Taxes" },
  { code: "taxes", name: "Taxes", accountType: "expense", scheduleELine: 16, scheduleERef: "Sch. E, Line 16", scheduleELabel: "Taxes" },
  { code: "insurance", name: "Insurance", accountType: "expense", scheduleELine: 9, scheduleERef: "Sch. E, Line 9", scheduleELabel: "Insurance" },
  { code: "management", name: "Management", accountType: "expense", scheduleELine: 11, scheduleERef: "Sch. E, Line 11", scheduleELabel: "Management Fees" },
  { code: "service_fees", name: "Service Fees", accountType: "expense", scheduleELine: 10, scheduleERef: "Sch. E, Line 10", scheduleELabel: "Legal and Professional Fees" },
  { code: "other_expense", name: "Other Expense", accountType: "expense", scheduleELine: 19, scheduleERef: "Sch. E, Line 19", scheduleELabel: "Other" },
];

export type WorkOrderCategory = "cleaning" | "plumbing" | "mold" | "electrical" | "hvac" | "general";

export const WORK_ORDER_CATEGORY_TO_EXPENSE: Record<WorkOrderCategory, string> = {
  cleaning: "cleaning",
  plumbing: "plumbing",
  mold: "mold_remediation",
  electrical: "maintenance",
  hvac: "heating",
  general: "maintenance",
};

const KIND_TO_CATEGORY: Record<HouseholdChargeKind, string> = {
  rent: "rent_income",
  first_month_rent: "rent_income",
  prorated_rent: "rent_income",
  prorated_last_month_rent: "rent_income",
  late_fee: "late_fees",
  application_fee: "application_fee",
  utilities: "other_income",
  prorated_utilities: "other_income",
  prorated_last_month_utilities: "other_income",
  security_deposit: "other_income",
  move_in_fee: "other_income",
  other_cost: "other_income",
  payment_at_signing: "other_income",
  work_order_charge: "other_income",
};

export function categoryCodeForChargeKind(kind: string | null | undefined): string {
  if (!kind) return "other_income";
  return KIND_TO_CATEGORY[kind as HouseholdChargeKind] ?? "other_income";
}

export function chartAccountLabel(code: string): string {
  return SYSTEM_CHART_ACCOUNTS.find((a) => a.code === code)?.name ?? code;
}

export function chartAccountScheduleE(code: string): { ref: string; label: string } | null {
  const acct = SYSTEM_CHART_ACCOUNTS.find((a) => a.code === code);
  if (!acct?.scheduleERef) return null;
  return { ref: acct.scheduleERef, label: acct.scheduleELabel ?? acct.name };
}
