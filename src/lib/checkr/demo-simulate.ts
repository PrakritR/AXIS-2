/**
 * Client-side simulated Checkr screening for the `/demo` sandbox.
 */
import { buildSimulatedReportSnapshot } from "@/lib/checkr/report-snapshot";
import { aggregateResultFromSnapshot } from "@/lib/checkr/report-snapshot";
import { stableHash } from "@/lib/checkr/simulate";
import type { CheckrPackage } from "@/lib/checkr/config";
import type { CheckrAddOnSlug } from "@/lib/checkr/packages";
import type { ApplicationBackgroundCheck } from "@/lib/checkr/types";
import type { DemoApplicantRow } from "@/data/demo-portal";

function applicantParts(row: DemoApplicantRow): { firstName: string; lastName: string; dob: string | null; ssn: string } {
  const full = row.application?.fullLegalName?.trim() || row.name.trim();
  const parts = full.split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] ?? "Applicant",
    lastName: parts.length > 1 ? parts[parts.length - 1]! : "Unknown",
    dob: row.application?.dateOfBirth ?? null,
    ssn: row.application?.ssn || row.id,
  };
}

/** Build a completed, simulated background check for a demo applicant. */
export function buildDemoBackgroundCheck(
  row: DemoApplicantRow,
  opts?: { packageSlug?: CheckrPackage; addOnProducts?: CheckrAddOnSlug[] },
): ApplicationBackgroundCheck {
  const packageSlug = opts?.packageSlug ?? "essential";
  const addOnProducts = opts?.addOnProducts ?? [];
  const { firstName, lastName, dob, ssn } = applicantParts(row);
  const seed = stableHash(`${row.email ?? row.id}:${ssn}`);
  const reportSnapshot = buildSimulatedReportSnapshot({
    firstName,
    lastName,
    dob,
    ssn,
    packageSlug,
    addOnProducts,
  });
  const now = new Date().toISOString();
  return {
    provider: "checkr",
    candidateId: `demo_applicant_${seed}`,
    reportId: `demo_order_${seed}`,
    packageSlug,
    addOnProducts: addOnProducts.length > 0 ? addOnProducts : undefined,
    status: "complete",
    result: aggregateResultFromSnapshot(reportSnapshot),
    reportSnapshot,
    orderedAt: now,
    completedAt: now,
    simulated: true,
    costCents: 0,
  };
}
