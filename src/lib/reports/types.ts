export type ReportColumn = {
  key: string;
  label: string;
  align?: "left" | "right";
  format?: "text" | "money" | "date" | "number";
};

export type ReportRow = Record<string, string | number | boolean | null>;

export type ReportResult = {
  id: string;
  title: string;
  columns: ReportColumn[];
  rows: ReportRow[];
  totals?: ReportRow;
  meta?: Record<string, string | number | boolean | null>;
};

export type ReportDateRange = {
  from: string;
  to: string;
};

export type ManagerReportFilters = {
  propertyId?: string;
  from?: string;
  to?: string;
  daysAhead?: number;
  taxYear?: number;
  vendorId?: string;
};

export type ResidentReportFilters = {
  from?: string;
  to?: string;
};

export const MANAGER_REPORT_IDS = [
  "tax-summary",
  "rent-receipts",
  "rental-days",
  "rent-roll",
  "delinquency",
  "income-statement",
  "expenses",
  "lease-expiration",
  "vendor-spend",
  "1099-candidates",
] as const;

export const RESIDENT_REPORT_IDS = ["resident-balance", "resident-ledger"] as const;

export type ManagerReportId = (typeof MANAGER_REPORT_IDS)[number];
export type ResidentReportId = (typeof RESIDENT_REPORT_IDS)[number];
