import type { DemoApplicantRow } from "@/data/demo-portal";

export const PREVIOUS_RESIDENT_STAGE_TOKENS = ["moved out", "previous", "past", "former", "inactive"] as const;

export function hasMoveOutDatePassed(moveOutDate: string | undefined, nowMs = Date.now()): boolean {
  const moveOut = moveOutDate?.trim();
  if (!moveOut) return false;
  const parsed = new Date(`${moveOut}T23:59:59`);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.getTime() < nowMs;
}

export function isPreviousResidentStage(stage: string | undefined): boolean {
  const normalized = stage?.trim().toLowerCase() ?? "";
  return PREVIOUS_RESIDENT_STAGE_TOKENS.some((token) => normalized.includes(token));
}

export function isCurrentResidentApplicationRow(row: DemoApplicantRow, nowMs = Date.now()): boolean {
  if (row.bucket !== "approved") return false;
  if (hasMoveOutDatePassed(row.manualResidentDetails?.moveOutDate, nowMs)) return false;
  return !isPreviousResidentStage(row.stage);
}
