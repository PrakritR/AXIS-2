/**
 * Pure tour slot-math shared by the public availability route and the
 * approval-first tour-proposal engine. A slotKey is `"YYYY-MM-DD:slotIndex"`
 * where slotIndex is 0-47 (48 half-hours per day, each 30 minutes). Keeping
 * this math in ONE place means the "first open slot" a proposal picks is
 * computed identically to what the public availability grid publishes.
 */

export type TourBlock = {
  start: string;
  end: string;
  slotKey?: string;
};

export function safePropertyId(propertyId: string): string {
  return propertyId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);
}

export function payloadSlots(rowData: unknown): string[] {
  if (!rowData || typeof rowData !== "object" || Array.isArray(rowData)) return [];
  const payload = (rowData as Record<string, unknown>).payload;
  return Array.isArray(payload) ? payload.filter((item): item is string => typeof item === "string") : [];
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function textField(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  return typeof value === "string" ? value.trim() : "";
}

/** Unwrap a schedule record's `row_data` to the inquiry payload it carries. */
export function rowPayload(rowData: unknown): Record<string, unknown> | null {
  const row = asObject(rowData);
  if (!row) return null;
  return asObject(row.payload) ?? row;
}

/** Requested tour windows from an inquiry payload (array form or single proposed*). */
export function windowsFromPayload(payload: Record<string, unknown>): TourBlock[] {
  const requested = Array.isArray(payload.requestedWindows) ? payload.requestedWindows : [];
  const windows = requested
    .map(asObject)
    .filter((window): window is Record<string, unknown> => Boolean(window))
    .map((window) => ({
      start: textField(window, "start"),
      end: textField(window, "end"),
      slotKey: textField(window, "slotKey") || undefined,
    }))
    .filter((window) => window.start && window.end);
  if (windows.length > 0) return windows;
  const start = textField(payload, "proposedStart") || textField(payload, "start");
  const end = textField(payload, "proposedEnd") || textField(payload, "end");
  if (!start || !end) return [];
  return [{ start, end, slotKey: textField(payload, "slotKey") || undefined }];
}

export function slotStartMs(slot: string): number | null {
  const [dateStr, rawSlotIndex] = slot.split(":");
  const slotIndex = Number.parseInt(rawSlotIndex ?? "", 10);
  if (!dateStr || !Number.isFinite(slotIndex) || slotIndex < 0 || slotIndex >= 48) return null;
  const [year, month, day] = dateStr.split("-").map(Number);
  if (!year || !month || !day) return null;
  const start = new Date(year, month - 1, day, 0, 0, 0, 0);
  start.setMinutes(slotIndex * 30);
  return start.getTime();
}

export function overlaps(slot: string, block: TourBlock): boolean {
  const startMs = slotStartMs(slot);
  if (startMs === null) return false;
  const endMs = startMs + 30 * 60 * 1000;
  const blockStartMs = new Date(block.start).getTime();
  const blockEndMs = new Date(block.end).getTime();
  if (![blockStartMs, blockEndMs].every(Number.isFinite)) return false;
  return startMs < blockEndMs && blockStartMs < endMs;
}

export function slotBlocked(slot: string, blocks: TourBlock[]): boolean {
  return blocks.some((block) => block.slotKey === slot || overlaps(slot, block));
}

/** Now-relative gate: a slot in the past can never be booked. */
export function slotIsBookable(slot: string, now: number = Date.now()): boolean {
  const startMs = slotStartMs(slot);
  if (startMs === null) return false;
  return startMs >= now;
}
