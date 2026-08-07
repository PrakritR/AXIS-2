import type { DemoApplicantRow } from "@/data/demo-portal";
import { isInProgressApplicationRow } from "@/lib/rental-application/in-progress-application";

export type ApplicationLinkBlockCode = "not_submitted";

export type ApplicationLinkRow = Pick<
  DemoApplicantRow,
  "bucket" | "stage" | "withdrawnAt" | "application" | "propertyId" | "property"
>;

export function applicationLinkBlock(
  row: ApplicationLinkRow | null | undefined,
): { code: ApplicationLinkBlockCode; message: string } | null {
  if (!row) return null;
  if (isInProgressApplicationRow(row as DemoApplicantRow)) {
    return {
      code: "not_submitted",
      message:
        "That application has not been submitted yet. The applicant must finish and submit before you can use this link.",
    };
  }
  return null;
}
