import { emitAdminUi } from "@/lib/demo-admin-ui";

const AVAIL_KEY = "axis_admin_avail_slots_v1";
const INQ_KEY = "axis_admin_partner_inquiries_v1";
const PLANNED_KEY = "axis_admin_planned_events_v1";

/** Monday = 0 … Sunday = 6 */
export const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

/** Half-hour slots from 8:00 through 17:30 (index 0 = 8:00–8:30). */
export const SLOTS_PER_DAY = 20;

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

export function mondayBasedDayIndex(d: Date) {
  return (d.getDay() + 6) % 7;
}

export function slotIndexForDate(d: Date) {
  const h = d.getHours();
  const m = d.getMinutes();
  if (h < 8 || h > 18 || (h === 18 && m > 0)) return null;
  const base = (h - 8) * 2 + (m >= 30 ? 1 : 0);
  if (base < 0 || base >= SLOTS_PER_DAY) return null;
  return base;
}

/** True when the start time falls in a painted availability half-hour cell. */
export function isStartInsideAvailability(isoStart: string): boolean {
  const t = new Date(isoStart);
  if (Number.isNaN(t.getTime())) return false;
  const day = mondayBasedDayIndex(t);
  const slot = slotIndexForDate(t);
  if (slot == null) return false;
  const set = readAvailabilitySet();
  return set.has(slotKey(day, slot));
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
