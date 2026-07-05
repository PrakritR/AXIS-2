/**
 * Vendor availability: recurring weekly windows + one-off blocked dates, and
 * the pure slot-resolution algorithm managers use to auto-schedule a visit
 * into a vendor's next open slot. Wall-clock math is done in the vendor's
 * operating timezone (Pacific, matching the rest of the portal's scheduling
 * UI) rather than the server process's local timezone, so a "9am-5pm" window
 * means 9am-5pm Pacific regardless of where the Node process runs.
 */

export type VendorAvailabilityRule =
  | { id: string; kind: "weekly"; weekday: number; startMinute: number; endMinute: number; note?: string | null }
  | { id: string; kind: "block"; specificDate: string; startMinute: number; endMinute: number; note?: string | null }
  | { id: string; kind: "open"; specificDate: string; startMinute: number; endMinute: number; note?: string | null };

export const DEFAULT_VISIT_DURATION_MINUTES = 60;
export const SLOT_STEP_MINUTES = 30;
export const MINUTES_PER_DAY = 1440;

const TIME_ZONE = "America/Los_Angeles";
const WEEKDAY_FROM_SHORT: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Display order (Mon..Sun) of the JS Date#getDay() weekday values this module stores. */
export const WEEKDAY_DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
export const WEEKDAY_LABELS: Record<number, string> = {
  0: "Sun",
  1: "Mon",
  2: "Tue",
  3: "Wed",
  4: "Thu",
  5: "Fri",
  6: "Sat",
};

function pacificPartsAt(date: Date) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short",
  });
  const map: Record<string, string> = {};
  for (const part of fmt.formatToParts(date)) map[part.type] = part.value;
  const hour = map.hour === "24" ? 0 : Number(map.hour);
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour,
    minute: Number(map.minute),
    weekday: WEEKDAY_FROM_SHORT[map.weekday] ?? 0,
  };
}

/** Pacific wall-clock (year, month 1-12, day, minuteOfDay) -> the UTC instant it corresponds to. */
function pacificWallClockToUtc(year: number, month: number, day: number, minuteOfDay: number): Date {
  const hour = Math.floor(minuteOfDay / 60);
  const minute = minuteOfDay % 60;
  let guess = new Date(Date.UTC(year, month - 1, day, hour, minute));
  // Two correction passes converge reliably since the Pacific/UTC offset is a
  // stable integer number of hours except across the DST-transition instant itself.
  for (let i = 0; i < 2; i += 1) {
    const parts = pacificPartsAt(guess);
    const dayDiffMs = Date.UTC(year, month - 1, day) - Date.UTC(parts.year, parts.month - 1, parts.day);
    const minuteDiffMs = (minuteOfDay - (parts.hour * 60 + parts.minute)) * 60_000;
    guess = new Date(guess.getTime() + dayDiffMs + minuteDiffMs);
  }
  return guess;
}

function dateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function minuteOfDayToTimeInputValue(minute: number): string {
  const h = Math.floor(minute / 60);
  const m = minute % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function timeInputValueToMinuteOfDay(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
}

export function formatMinuteOfDayLabel(minute: number): string {
  const h24 = Math.floor(minute / 60) % 24;
  const m = minute % 60;
  const period = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

type BusyWindow = { startIso: string; endIso: string };

/**
 * Walk forward day-by-day from `from`, returning the ISO start of the first
 * slot of `durationMinutes` that falls inside a weekly window, isn't covered
 * by a block rule for that date, and doesn't overlap any busy window
 * (existing scheduled visits). Returns null if nothing opens up within
 * `daysToSearch` days.
 */
export function resolveNextAvailableSlot(options: {
  rules: VendorAvailabilityRule[];
  busy: BusyWindow[];
  durationMinutes?: number;
  from?: Date;
  daysToSearch?: number;
}): string | null {
  const { rules, busy, durationMinutes = DEFAULT_VISIT_DURATION_MINUTES, from = new Date(), daysToSearch = 60 } = options;

  const weeklyByWeekday = new Map<number, Array<{ start: number; end: number }>>();
  const blocksByDate = new Map<string, Array<{ start: number; end: number }>>();
  const opensByDate = new Map<string, Array<{ start: number; end: number }>>();
  for (const rule of rules) {
    if (rule.kind === "weekly") {
      const list = weeklyByWeekday.get(rule.weekday) ?? [];
      list.push({ start: rule.startMinute, end: rule.endMinute });
      weeklyByWeekday.set(rule.weekday, list);
    } else if (rule.kind === "block") {
      const list = blocksByDate.get(rule.specificDate) ?? [];
      list.push({ start: rule.startMinute, end: rule.endMinute });
      blocksByDate.set(rule.specificDate, list);
    } else {
      const list = opensByDate.get(rule.specificDate) ?? [];
      list.push({ start: rule.startMinute, end: rule.endMinute });
      opensByDate.set(rule.specificDate, list);
    }
  }

  const busyByDate = new Map<string, Array<{ start: number; end: number }>>();
  for (const window of busy) {
    const start = pacificPartsAt(new Date(window.startIso));
    const end = pacificPartsAt(new Date(window.endIso));
    const key = dateKey(start.year, start.month, start.day);
    const startMinute = start.hour * 60 + start.minute;
    const sameDay = dateKey(end.year, end.month, end.day) === key;
    const endMinute = sameDay ? end.hour * 60 + end.minute : MINUTES_PER_DAY;
    const list = busyByDate.get(key) ?? [];
    list.push({ start: startMinute, end: endMinute });
    busyByDate.set(key, list);
  }

  const fromParts = pacificPartsAt(from);
  const fromMinuteFloor = fromParts.hour * 60 + fromParts.minute;
  const fromUtcMidnight = Date.UTC(fromParts.year, fromParts.month - 1, fromParts.day);

  for (let dayOffset = 0; dayOffset < daysToSearch; dayOffset += 1) {
    const candidate = new Date(fromUtcMidnight + dayOffset * 86_400_000);
    const y = candidate.getUTCFullYear();
    const m = candidate.getUTCMonth() + 1;
    const d = candidate.getUTCDate();
    const weekday = candidate.getUTCDay();
    const key = dateKey(y, m, d);

    const windows = [...(weeklyByWeekday.get(weekday) ?? []), ...(opensByDate.get(key) ?? [])];
    if (windows.length === 0) continue;

    const exclusions = [...(blocksByDate.get(key) ?? []), ...(busyByDate.get(key) ?? [])].sort((a, b) => a.start - b.start);
    const dayFloor = dayOffset === 0 ? fromMinuteFloor : 0;

    for (const window of [...windows].sort((a, b) => a.start - b.start)) {
      let cursor = Math.ceil(Math.max(window.start, dayFloor) / SLOT_STEP_MINUTES) * SLOT_STEP_MINUTES;
      while (cursor + durationMinutes <= window.end) {
        const blocking = exclusions.find((ex) => cursor < ex.end && cursor + durationMinutes > ex.start);
        if (!blocking) return pacificWallClockToUtc(y, m, d, cursor).toISOString();
        cursor = Math.ceil(blocking.end / SLOT_STEP_MINUTES) * SLOT_STEP_MINUTES;
      }
    }
  }
  return null;
}

export async function fetchVendorAvailability(vendorId?: string): Promise<VendorAvailabilityRule[]> {
  const url = vendorId ? `/api/vendor/availability?vendorId=${encodeURIComponent(vendorId)}` : "/api/vendor/availability";
  try {
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.rules) ? (data.rules as VendorAvailabilityRule[]) : [];
  } catch {
    return [];
  }
}

async function postAvailability(body: Record<string, unknown>): Promise<{ ok: boolean; rule?: VendorAvailabilityRule; error?: string }> {
  try {
    const res = await fetch("/api/vendor/availability", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data.error ?? "Request failed." };
    return { ok: true, rule: data.rule };
  } catch {
    return { ok: false, error: "Network error." };
  }
}

export function saveVendorWeeklyRule(input: { id?: string; weekday: number; startMinute: number; endMinute: number }) {
  return postAvailability({ action: "upsert-weekly", ...input });
}

export function saveVendorBlockRule(input: { id?: string; specificDate: string; startMinute?: number; endMinute?: number; note?: string }) {
  return postAvailability({ action: "upsert-block", ...input });
}

export function saveVendorDateRule(input: { id?: string; specificDate: string; startMinute?: number; endMinute?: number; note?: string }) {
  return postAvailability({ action: "upsert-open", ...input });
}

export function deleteVendorAvailabilityRule(id: string) {
  return postAvailability({ action: "delete", id });
}
