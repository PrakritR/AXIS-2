import type { HouseholdChargeKind } from "@/lib/household-charges";

export type ChartAccount = {
  code: string;
  name: string;
  accountType: "income" | "expense";
};

export const SYSTEM_CHART_ACCOUNTS: ChartAccount[] = [
  { code: "rent_income", name: "Rent Income", accountType: "income" },
  { code: "late_fees", name: "Late Fees", accountType: "income" },
  { code: "pet_rent", name: "Pet Rent", accountType: "income" },
  { code: "application_fee", name: "Application Fee", accountType: "income" },
  { code: "other_income", name: "Other Income", accountType: "income" },
  { code: "maintenance", name: "Maintenance", accountType: "expense" },
  { code: "cleaning", name: "Cleaning", accountType: "expense" },
  { code: "plumbing", name: "Plumbing", accountType: "expense" },
  { code: "mold_remediation", name: "Mold Remediation", accountType: "expense" },
  { code: "materials", name: "Materials / Equipment", accountType: "expense" },
  { code: "mortgage", name: "Mortgage", accountType: "expense" },
  { code: "utilities", name: "Utilities", accountType: "expense" },
  { code: "electricity", name: "Electricity", accountType: "expense" },
  { code: "heating", name: "Heating / HVAC", accountType: "expense" },
  { code: "wifi", name: "Wi‑Fi / Internet", accountType: "expense" },
  { code: "property_tax", name: "Property Tax", accountType: "expense" },
  { code: "taxes", name: "Taxes", accountType: "expense" },
  { code: "insurance", name: "Insurance", accountType: "expense" },
  { code: "management", name: "Management", accountType: "expense" },
  { code: "service_fees", name: "Service Fees", accountType: "expense" },
  { code: "other_expense", name: "Other Expense", accountType: "expense" },
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
