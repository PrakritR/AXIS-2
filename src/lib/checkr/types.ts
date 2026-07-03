import type { CheckrPackage } from "@/lib/checkr/config";

/** Checkr Tenant API order lifecycle. `complete` carries an aggregate `result`. */
export type CheckrReportStatus = "pending" | "complete" | "canceled";

/** Aggregate adjudication across the order's report products. `null` while pending. */
export type CheckrResult = "clear" | "consider" | null;

/**
 * Persisted background-check state stored on the application record
 * (`DemoApplicantRow.backgroundCheck`). All figures are Checkr-grounded — the
 * model/UI never invents a status.
 */
export type ApplicationBackgroundCheck = {
  provider: "checkr";
  /** Checkr Tenant API applicant id (`ap_test_…` / `ap_…`). */
  candidateId: string;
  /** Checkr Tenant API order id (`ord_test_…` / `ord_…`) — used for polling and webhook lookup. */
  reportId: string;
  packageSlug: CheckrPackage;
  status: CheckrReportStatus;
  result: CheckrResult;
  orderedAt: string;
  completedAt?: string;
  /** True when produced by the deterministic simulate fallback (no live call). */
  simulated?: boolean;
  /** Flat fee charged to the manager for this run, and the resulting Stripe PaymentIntent. */
  costCents?: number;
  stripePaymentIntentId?: string;
};

/** Result of creating an applicant + property + order with Checkr. */
export type CheckrCreateResult = {
  applicantId: string;
  orderId: string;
  packageSlug: CheckrPackage;
  status: CheckrReportStatus;
  result: CheckrResult;
  simulated: boolean;
};

/** Normalized view of a fetched Checkr order + report. */
export type CheckrReport = {
  orderId: string;
  status: CheckrReportStatus;
  result: CheckrResult;
  simulated?: boolean;
};

/** Minimal applicant PII the Checkr applicant needs. Assembled server-side only. */
export type CheckrApplicantInput = {
  firstName: string;
  lastName: string;
  email: string;
  dob: string | null;
  ssn: string;
  phone?: string;
};

/** The rental property being screened for — required by the Tenant API `property` resource. */
export type CheckrPropertyInput = {
  name: string;
  street: string;
  unit?: string;
  city: string;
  state: string;
  zipcode: string;
};
