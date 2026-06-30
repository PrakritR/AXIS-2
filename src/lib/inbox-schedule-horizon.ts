export const INBOX_SCHEDULE_HORIZON_OPTIONS = [
  { id: "3", label: "Next 3 days", days: 3 },
  { id: "7", label: "Next 7 days", days: 7 },
  { id: "14", label: "Next 14 days", days: 14 },
  { id: "30", label: "Next 30 days", days: 30 },
  { id: "all", label: "Show all upcoming", days: null },
] as const;

export type InboxScheduleHorizonId = (typeof INBOX_SCHEDULE_HORIZON_OPTIONS)[number]["id"];

export function inboxScheduleHorizonDays(horizonId: InboxScheduleHorizonId): number | null {
  return INBOX_SCHEDULE_HORIZON_OPTIONS.find((opt) => opt.id === horizonId)?.days ?? 14;
}

/** True when sendAt is in the future (or today) and within the selected day window. */
export function sendAtWithinScheduleHorizon(sendAt: string, horizonDays: number | null, now = new Date()): boolean {
  const send = new Date(sendAt);
  if (Number.isNaN(send.getTime())) return false;
  if (send.getTime() < now.getTime() - 60_000) return false;
  if (horizonDays === null) return true;
  const limit = new Date(now);
  limit.setDate(limit.getDate() + horizonDays);
  limit.setHours(23, 59, 59, 999);
  return send.getTime() <= limit.getTime();
}
