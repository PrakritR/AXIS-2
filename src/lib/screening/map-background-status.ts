import type { ApplicationBackgroundCheckStatus } from "@/lib/application-background-check";
import type { ApplicationScreeningReport } from "@/lib/screening/types";

export function backgroundCheckStatusFromScreening(
  screening: ApplicationScreeningReport | null | undefined,
): ApplicationBackgroundCheckStatus {
  if (!screening) return "pending_review";
  if (screening.status === "failed" || screening.status === "canceled") return "flagged";
  if (screening.status !== "complete") return "pending_review";
  if (screening.recommendation === "strong_yes") return "passed";
  if (screening.recommendation === "concerns") return "flagged";
  return "pending_review";
}
