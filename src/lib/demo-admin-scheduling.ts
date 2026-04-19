import { emitAdminUi } from "@/lib/demo-admin-ui";

const AVAIL_KEY = "axis_admin_avail_slots_v1";
/** Per calendar date (local `YYYY-MM-DD`) + half-hour slot — supports future weeks. */
const AVAIL_V2_KEY = "axis_admin_avail_slots_v2";
const INQ_KEY = "axis_admin_partner_inquiries_v1";
const PLANNED_KEY = "axis_admin_planned_events_v1";

/** Monday = 0 … Sunday = 6 */
export const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

/** Half-hour slots from 8:00 AM through 8:00 PM (index 0 = 8:00–8:30, last = 7:30–8:00). */
export const SLOTS_PER_DAY = 24;

function isBrowser() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readJson<T>(key: string, fallback: T): T {
  if (!isBrowser()) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    emitAdminUi();
  } catch {
    /* ignore */
  }
}

export function slotKey(dayIndex: number, slotIndex: number) {
  return `${dayIndex}-${slotIndex}`;
}

export function toLocalDateStr(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function dateSlotKey(dateStr: string, slotIndex: number) {
  return `${dateStr}:${slotIndex}`;
}

export function startOfWeekMonday(d: Date) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
  const dow = mondayBasedDayIndex(x);
  x.setDate(x.getDate() - dow);
  return x;
}

function migrateLegacyWeeklyToDateKeys(legacyKeys: string[]): string[] {
  const mon = startOfWeekMonday(new Date());
  const out: string[] = [];
  const seen = new Set<string>();
  for (const key of legacyKeys) {
    const p = parseSlotKey(key);
    if (!p) continue;
    const day = new Date(mon);
    day.setDate(mon.getDate() + p.dayIndex);
    const k = dateSlotKey(toLocalDateStr(day), p.slotIndex);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(k);
    }
  }
  return out;
}

export function parseSlotKey(key: string): { dayIndex: number; slotIndex: number } | null {
  const [a, b] = key.split("-");
  const dayIndex = Number.parseInt(a ?? "", 10);
  const slotIndex = Number.parseInt(b ?? "", 10);
  if (!Number.isFinite(dayIndex) || !Number.isFinite(slotIndex)) return null;
  if (dayIndex < 0 || dayIndex > 6 || slotIndex < 0 || slotIndex >= SLOTS_PER_DAY) return null;
  return { dayIndex, slotIndex };
}

export function readAvailabilitySet(): Set<string> {
  const arr = readJson<string[] | null>(AVAIL_KEY, null);
  if (!Array.isArray(arr)) return new Set();
  return new Set(arr);
}

export function writeAvailabilitySet(next: Set<string>) {
  writeJson(AVAIL_KEY, [...next]);
}

/** Date-specific availability (`YYYY-MM-DD:slotIndex`). Migrates legacy weekly v1 into the current week when v2 is unset. */
export function readAvailabilityDateSet(): Set<string> {
  if (!isBrowser()) return new Set();
  const rawV2 = window.localStorage.getItem(AVAIL_V2_KEY);
  if (rawV2 === null) {
    const legacy = readJson<string[] | null>(AVAIL_KEY, null);
    if (Array.isArray(legacy) && legacy.length > 0) {
      const migrated = migrateLegacyWeeklyToDateKeys(legacy);
      writeJson(AVAIL_V2_KEY, migrated);
      return new Set(migrated);
    }
    writeJson(AVAIL_V2_KEY, []);
    return new Set();
  }
  try {
    const arr = JSON.parse(rawV2) as string[];
    return Array.isArray(arr) ? new Set(arr) : new Set();
  } catch {
    return new Set();
  }
}

export function writeAvailabilityDateSet(next: Set<string>) {
  writeJson(AVAIL_V2_KEY, [...next]);
}

export function dateHasAvailability(d: Date, availability: Set<string>) {
  const ds = toLocalDateStr(d);
  for (let s = 0; s < SLOTS_PER_DAY; s += 1) {
    if (availability.has(dateSlotKey(ds, s))) return true;
  }
  return false;
}

export function dateStrFromCalendar(calYear: number, calMonth: number, day: number) {
  return toLocalDateStr(new Date(calYear, calMonth, day, 12, 0, 0, 0));
}

export function getOpenSlotIndicesForDateStr(dateStr: string) {
  const set = readAvailabilityDateSet();
  const out: number[] = [];
  for (let i = 0; i < SLOTS_PER_DAY; i += 1) {
    if (set.has(dateSlotKey(dateStr, i))) out.push(i);
  }
  return out;
}

export function dateHasOpenSlots(dateStr: string) {
  return getOpenSlotIndicesForDateStr(dateStr).length > 0;
}

export function formatAvailabilitySlotLabel(slotIndex: number) {
  const mins = 8 * 60 + slotIndex * 30;
  const h24 = Math.floor(mins / 60);
  const m = mins % 60;
  const d = new Date(2000, 0, 1, h24, m);
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/** Local start time for a painted half-hour on a calendar date (8:00 + slotIndex×30 min). */
export function localDateAtSlotStart(dateStr: string, slotIndex: number) {
  const [y, mo, day] = dateStr.split("-").map(Number);
  const base = new Date(y!, mo! - 1, day!, 8, 0, 0, 0);
  base.setMinutes(base.getMinutes() + slotIndex * 30);
  return base;
}

export function isCalendarDayBeforeToday(calYear: number, calMonth: number, day: number) {
  const cell = new Date(calYear, calMonth, day, 0, 0, 0, 0);
  const t0 = new Date();
  t0.setHours(0, 0, 0, 0);
  return cell < t0;
}

export function mondayBasedDayIndex(d: Date) {
  return (d.getDay() + 6) % 7;
}

export function slotIndexForDate(d: Date) {
  const h = d.getHours();
  const m = d.getMinutes();
  const base = (h - 8) * 2 + (m >= 30 ? 1 : 0);
  if (base < 0 || base >= SLOTS_PER_DAY) return null;
  return base;
}

/** True when the start time falls in a painted availability half-hour cell (date-specific v2). */
export function isStartInsideAvailability(isoStart: string): boolean {
  const t = new Date(isoStart);
  if (Number.isNaN(t.getTime())) return false;
  const ds = toLocalDateStr(t);
  const slot = slotIndexForDate(t);
  if (slot == null) return false;
  const set = readAvailabilityDateSet();
  return set.has(dateSlotKey(ds, slot));
}

export type PartnerInquiryStatus = "pending" | "accepted" | "declined";

export type PartnerInquiry = {
  id: string;
  name: string;
  email: string;
  phone: string;
  notes: string;
  proposedStart: string;
  proposedEnd: string;
  status: PartnerInquiryStatus;
  createdAt: string;
};

export type PlannedEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  sourceInquiryId?: string;
};

export function readPartnerInquiries(): PartnerInquiry[] {
  const rows = readJson<PartnerInquiry[] | null>(INQ_KEY, null);
  return Array.isArray(rows) ? rows : [];
}

export function appendPartnerInquiry(payload: Omit<PartnerInquiry, "id" | "status" | "createdAt">) {
  const rows = readPartnerInquiries();
  const row: PartnerInquiry = {
    ...payload,
    id: crypto.randomUUID(),
    status: "pending",
    createdAt: new Date().toISOString(),
  };
  rows.unshift(row);
  writeJson(INQ_KEY, rows);
}

export function updatePartnerInquiry(id: string, patch: Partial<PartnerInquiry>) {
  const rows = readPartnerInquiries();
  const idx = rows.findIndex((r) => r.id === id);
  if (idx === -1) return false;
  const next = [...rows];
  next[idx] = { ...next[idx]!, ...patch };
  writeJson(INQ_KEY, next);
  return true;
}

export function readPlannedEvents(): PlannedEvent[] {
  const rows = readJson<PlannedEvent[] | null>(PLANNED_KEY, null);
  return Array.isArray(rows) ? rows : [];
}

function appendPlannedEvent(ev: PlannedEvent) {
  const rows = readPlannedEvents();
  rows.push(ev);
  writeJson(PLANNED_KEY, rows);
}

export function pendingInquiryCount() {
  return readPartnerInquiries().filter((r) => r.status === "pending").length;
}

export function acceptPartnerInquiry(id: string): boolean {
  const rows = readPartnerInquiries();
  const row = rows.find((r) => r.id === id);
  if (!row || row.status !== "pending") return false;
  updatePartnerInquiry(id, { status: "accepted" });
  appendPlannedEvent({
    id: crypto.randomUUID(),
    title: `Partner call · ${row.name}`,
    start: row.proposedStart,
    end: row.proposedEnd,
    sourceInquiryId: id,
  });
  return true;
}

export function declinePartnerInquiry(id: string) {
  return updatePartnerInquiry(id, { status: "declined" });
}

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function isoDayRange(anchor: Date, days: number) {
  const start = startOfDay(anchor).getTime();
  const end = addDays(startOfDay(anchor), days).getTime();
  return { start, end };
}

export function eventKpis(anchor = new Date()) {
  const events = readPlannedEvents();
  const today = startOfDay(anchor).getTime();
  const tomorrow = addDays(startOfDay(anchor), 1).getTime();
  const week = isoDayRange(anchor, 7);
  const monthStart = new Date(anchor.getFullYear(), anchor.getMonth(), 1).getTime();
  const monthEnd = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1).getTime();

  const inRange = (iso: string, a: number, b: number) => {
    const t = new Date(iso).getTime();
    return !Number.isNaN(t) && t >= a && t < b;
  };

  const todayN = events.filter((e) => inRange(e.start, today, tomorrow)).length;
  const weekN = events.filter((e) => inRange(e.start, week.start, week.end)).length;
  const monthN = events.filter((e) => inRange(e.start, monthStart, monthEnd)).length;
  return {
    today: String(todayN),
    week: String(weekN),
    month: String(monthN),
    total: String(events.length),
  };
}

export function formatRangeLabel(isoStart: string, isoEnd: string) {
  try {
    const a = new Date(isoStart);
    const b = new Date(isoEnd);
    if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return "—";
    const opts: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" };
    return `${a.toLocaleString(undefined, opts)} – ${b.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
  } catch {
    return "—";
  }
}
