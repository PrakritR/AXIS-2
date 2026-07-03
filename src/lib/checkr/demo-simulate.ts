/**
 * Client-side simulated Checkr screening for the `/demo` sandbox — no network
 * call to Checkr, no Stripe charge. Uses the same deterministic rule as the
 * server-side simulate fallback (`checkr/simulate.ts`) so the result is stable
 * across reloads for a given applicant and consistent with what the real
 * simulate path would produce for the same SSN.
 */
import { simulatedResult, stableHash } from "@/lib/checkr/simulate";
import type { ApplicationBackgroundCheck } from "@/lib/checkr/types";
import type { DemoApplicantRow } from "@/data/demo-portal";

/** Build a completed, simulated background check for a demo applicant. */
export function buildDemoBackgroundCheck(row: DemoApplicantRow): ApplicationBackgroundCheck {
  const ssn = row.application?.ssn || row.id;
  const seed = stableHash(`${row.email ?? row.id}:${ssn}`);
  const now = new Date().toISOString();
  return {
    provider: "checkr",
    candidateId: `demo_applicant_${seed}`,
    reportId: `demo_order_${seed}`,
    packageSlug: "essential",
    status: "complete",
    result: simulatedResult(ssn),
    orderedAt: now,
    completedAt: now,
    simulated: true,
    costCents: 0,
  };
}
