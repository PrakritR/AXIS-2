/** Checkr report lifecycle. `complete` carries a `result`; everything else is in-flight or exceptional. */
export type CheckrReportStatus =
  | "pending"
  | "complete"
  | "suspended"
  | "dispute"
  | "canceled";

/** Checkr adjudication of a completed report. `null` while pending. */
export type CheckrResult = "clear" | "consider" | null;

/**
 * Persisted background-check state stored on the application record
 * (`DemoApplicantRow.backgroundCheck`). All figures are Checkr-grounded — the
 * model/UI never invents a status.
 */
export type ApplicationBackgroundCheck = {
  provider: "checkr";
  candidateId: string;
  reportId: string;
  packageSlug: string;
  status: CheckrReportStatus;
  result: CheckrResult;
  /** Checkr Assess verdict when enabled: eligible | review | escalated. */
  assessment?: string | null;
  orderedAt: string;
  completedAt?: string;
  /** True when produced by the deterministic simulate fallback (no live call). */
  simulated?: boolean;
};

/** Result of creating a candidate + report with Checkr. */
export type CheckrCreateResult = {
  candidateId: string;
  reportId: string;
  packageSlug: string;
  status: CheckrReportStatus;
  result: CheckrResult;
  assessment?: string | null;
  simulated: boolean;
};

/** Normalized view of a fetched Checkr report. */
export type CheckrReport = {
  reportId: string;
  status: CheckrReportStatus;
  result: CheckrResult;
  assessment?: string | null;
  simulated?: boolean;
};

/** Minimal applicant PII the Checkr candidate needs. Assembled server-side only. */
export type CheckrCandidateInput = {
  firstName: string;
  lastName: string;
  middleName?: string;
  email: string;
  dob: string | null;
  ssn: string;
  zipcode: string;
  phone?: string;
};
