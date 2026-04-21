"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PORTAL_CALENDAR_FRAME, PortalSegmentedControl } from "./portal-metrics";
import {
  dateHasAvailability,
  dateSlotKey,
  formatAvailabilitySlotLabel,
  readAvailabilityDateSetForStorageKey,
  startOfWeekMonday,
  toLocalDateStr,
  writeAvailabilityDateSetForStorageKey,
} from "@/lib/demo-admin-scheduling";

type CalendarMode = "day" | "week" | "month";

/** Half-hour slots shown in the grid (9:00–17:30 local); matches demo slot indexing from 8:00. */
const SLOT_ROW_START = 2;
const SLOT_ROW_END = 18;

const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri"] as const;

function addDays(d: Date, n: number): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0, 0);
  x.setDate(x.getDate() + n);
  return x;
}

function addMonths(d: Date, n: number): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0, 0);
  x.setMonth(x.getMonth() + n);
  return x;
}

function mondayBasedDayIndex(d: Date) {
  return (d.getDay() + 6) % 7;
}

function buildMonthCells(year: number, month: number): (number | null)[] {
  const first = new Date(year, month, 1, 12, 0, 0, 0);
  const pad = mondayBasedDayIndex(first);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = Array(pad).fill(null);
  for (let day = 1; day <= daysInMonth; day += 1) cells.push(day);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function formatWeekRangeMonFri(monday: Date): string {
  const fri = addDays(monday, 4);
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  return `${monday.toLocaleDateString(undefined, opts)}–${fri.toLocaleDateString(undefined, { ...opts, year: "numeric" })}`;
}

function isInMonthPickRange(ds: string, pick: { start: string | null; end: string | null }): boolean {
  if (!pick.start) return false;
  if (!pick.end) return ds === pick.start;
  const lo = pick.start < pick.end ? pick.start : pick.end;
  const hi = pick.start < pick.end ? pick.end : pick.start;
  return ds >= lo && ds <= hi;
}

function formatNavTitle(anchor: Date, mode: CalendarMode): string {
  if (mode === "month") {
    return anchor.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  }
  if (mode === "week") {
    return formatWeekRangeMonFri(startOfWeekMonday(anchor));
  }
  return anchor.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric", year: "numeric" });
}

type DemoMeeting = {
  dateStr: string;
  startSlot: number;
  span: number;
  title: string;
  color: string;
};

const slotRowIndices = Array.from(
  { length: SLOT_ROW_END - SLOT_ROW_START + 1 },
  (_, i) => SLOT_ROW_START + i,
);

/**
 * Manager + admin shared calendar: schedule card (day/week/month) + availability paint grid.
 * `storageKey` must be non-null for reads/writes (caller handles manager auth).
 */
export function PortalCalendarPanels({
  storageKey,
  calendarRefreshSignal,
  defaultViewMode = "week",
  pinMonthSchedule = false,
}: {
  storageKey: string | null;
  /** Increment from parent to reload slot state from storage (e.g. admin page Refresh). */
  calendarRefreshSignal?: number;
  /** Initial schedule panel mode (admin defaults to month). */
  defaultViewMode?: CalendarMode;
  /** When true, month grid stays visible: day clicks choose a range + sync week without jumping to Day view (admin Calendar). */
  pinMonthSchedule?: boolean;
}) {
  const [viewMode, setViewMode] = useState<CalendarMode>(defaultViewMode);
  /** yyyy-mm-dd inclusive range highlights in month view when `pinMonthSchedule`. */
  const [monthPick, setMonthPick] = useState<{ start: string | null; end: string | null }>({ start: null, end: null });
  const [anchorDate, setAnchorDate] = useState(() => new Date());
  const [activeSlots, setActiveSlots] = useState<Set<string>>(() => new Set());
  const [dragMode, setDragMode] = useState<"add" | "remove" | null>(null);

  useEffect(() => {
    if (!storageKey) return;
    setActiveSlots(new Set(readAvailabilityDateSetForStorageKey(storageKey)));
  }, [storageKey]);

  const weekMonday = useMemo(() => startOfWeekMonday(anchorDate), [anchorDate]);
  const workWeekDates = useMemo(
    () => [0, 1, 2, 3, 4].map((i) => addDays(weekMonday, i)),
    [weekMonday],
  );
  const workWeekDateStrs = useMemo(() => workWeekDates.map(toLocalDateStr), [workWeekDates]);

  const meetings = useMemo<DemoMeeting[]>(() => [], []);

  const monthYear = anchorDate.getFullYear();
  const monthIndex = anchorDate.getMonth();
  const monthCells = useMemo(() => buildMonthCells(monthYear, monthIndex), [monthYear, monthIndex]);

  const monthBlocksCount = useMemo(() => {
    let n = 0;
    const dim = new Date(monthYear, monthIndex + 1, 0).getDate();
    for (let day = 1; day <= dim; day += 1) {
      const ds = toLocalDateStr(new Date(monthYear, monthIndex, day, 12, 0, 0, 0));
      for (const slot of slotRowIndices) {
        if (activeSlots.has(dateSlotKey(ds, slot))) n += 1;
      }
    }
    return n;
  }, [monthYear, monthIndex, activeSlots]);

  const applySlot = useCallback(
    (key: string, mode: "add" | "remove") => {
      if (!storageKey) return;
      setActiveSlots((current) => {
        const next = new Set(current);
        if (mode === "add") next.add(key);
        else next.delete(key);
        writeAvailabilityDateSetForStorageKey(next, storageKey);
        return next;
      });
    },
    [storageKey],
  );

  const reloadAvailability = useCallback(() => {
    if (!storageKey) return;
    setActiveSlots(new Set(readAvailabilityDateSetForStorageKey(storageKey)));
  }, [storageKey]);

  const prevRefreshSig = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (calendarRefreshSignal === undefined) return;
    if (prevRefreshSig.current === undefined) {
      prevRefreshSig.current = calendarRefreshSignal;
      return;
    }
    if (prevRefreshSig.current === calendarRefreshSignal) return;
    prevRefreshSig.current = calendarRefreshSignal;
    reloadAvailability();
  }, [calendarRefreshSignal, reloadAvailability]);

  const weekSlotCount = useMemo(() => {
    let n = 0;
    for (const ds of workWeekDateStrs) {
      for (const slot of slotRowIndices) {
        if (activeSlots.has(dateSlotKey(ds, slot))) n += 1;
      }
    }
    return n;
  }, [activeSlots, workWeekDateStrs]);

  const shiftAnchor = (dir: -1 | 1) => {
    if (viewMode === "month") setAnchorDate((d) => addMonths(d, dir));
    else if (viewMode === "week") setAnchorDate((d) => addDays(d, dir * 7));
    else setAnchorDate((d) => addDays(d, dir));
  };

  const shiftAvailabilityWeek = useCallback((dir: -1 | 1) => {
    setAnchorDate((d) => addDays(d, dir * 7));
  }, []);

  if (!storageKey) {
    return <p className="text-sm text-slate-600">Sign in to manage your availability.</p>;
  }

  const scheduleCard = (
    <Card className="overflow-hidden p-0">
      <div className="border-b border-slate-200/80 bg-white px-5 py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
              {viewMode === "day" ? "Day view" : viewMode === "week" ? "Week view" : "Month view"}
            </p>
            <h2 className="mt-1 truncate text-xl font-semibold text-slate-950">{formatNavTitle(anchorDate, viewMode)}</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 rounded-full border border-slate-200 bg-white p-0.5">
              <Button type="button" variant="outline" className="h-9 rounded-full px-3 text-xs" onClick={() => shiftAnchor(-1)}>
                ←
              </Button>
              <Button type="button" variant="outline" className="h-9 rounded-full px-3 text-xs" onClick={() => shiftAnchor(1)}>
                →
              </Button>
            </div>
            <PortalSegmentedControl<CalendarMode>
              options={[
                { id: "day", label: "Day" },
                { id: "week", label: "Week" },
                { id: "month", label: "Month" },
              ]}
              value={viewMode}
              onChange={setViewMode}
            />
            <div className="rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-600">
              {viewMode === "month" ? monthBlocksCount : meetings.length} blocks
            </div>
          </div>
        </div>
      </div>

      {viewMode === "month" ? (
        <div className="p-5">
          <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold uppercase tracking-wide text-slate-400">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
              <div key={d} className="py-1">
                {d}
              </div>
            ))}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-1">
            {monthCells.map((day, i) => {
              if (!day) return <div key={`pad-${i}`} className="aspect-square" />;
              const cellDate = new Date(monthYear, monthIndex, day, 12, 0, 0, 0);
              const ds = toLocalDateStr(cellDate);
              const picked = pinMonthSchedule && isInMonthPickRange(ds, monthPick);
              const hasAvail = dateHasAvailability(cellDate, activeSlots);
              return (
                <button
                  key={`${monthYear}-${monthIndex}-${day}`}
                  type="button"
                  onClick={() => {
                    setAnchorDate(cellDate);
                    if (pinMonthSchedule) {
                      setMonthPick((prev) => {
                        if (!prev.start || (prev.start && prev.end)) return { start: ds, end: null };
                        if (prev.start === ds) return { start: ds, end: null };
                        return prev.start <= ds ? { start: prev.start, end: ds } : { start: ds, end: prev.start };
                      });
                    } else {
                      setViewMode("day");
                    }
                  }}
                  className={`flex aspect-square flex-col items-center justify-center rounded-xl border text-sm font-semibold transition hover:border-primary/30 ${
                    picked ? "border-primary bg-primary/[0.14] text-slate-900 ring-2 ring-primary/35" : ""
                  } ${hasAvail ? "border-primary/25 bg-primary/[0.07] text-slate-900" : "border-slate-100 bg-white text-slate-800"}`}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {viewMode === "week" ? (
        <div className={PORTAL_CALENDAR_FRAME}>
          <div className="grid grid-cols-[68px_repeat(5,minmax(0,1fr))] gap-px bg-slate-200">
            <div className="bg-slate-50" />
            {workWeekDates.map((d, idx) => (
              <div key={toLocalDateStr(d)} className="bg-slate-50 px-2 py-3 text-center">
                <p className="text-sm font-semibold text-slate-900">{WEEKDAY_SHORT[idx]}</p>
                <p className="text-xs text-slate-500">{d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}</p>
              </div>
            ))}
            {slotRowIndices.map((slotIdx) => (
              <Fragment key={slotIdx}>
                <div className="bg-white px-2 py-2 text-[11px] font-semibold text-slate-400">
                  {formatAvailabilitySlotLabel(slotIdx)}
                </div>
                {workWeekDateStrs.map((ds) => {
                  const meeting = meetings.find((m) => m.dateStr === ds && m.startSlot === slotIdx);
                  return (
                    <div key={`${ds}-${slotIdx}`} className="relative min-h-[40px] bg-white p-1">
                      {meeting ? (
                        <div
                          className={`absolute inset-1 z-[1] rounded-xl border px-2 py-2 text-xs font-semibold shadow-sm ${meeting.color}`}
                          style={{ height: `calc(${meeting.span} * 40px - 4px)` }}
                        >
                          {meeting.title}
                        </div>
                      ) : (
                        <div className="h-full rounded-xl border border-dashed border-slate-100" />
                      )}
                    </div>
                  );
                })}
              </Fragment>
            ))}
          </div>
        </div>
      ) : null}

      {viewMode === "day" ? (
        <div className={PORTAL_CALENDAR_FRAME}>
          <div className="grid grid-cols-[68px_minmax(0,1fr)] gap-px bg-slate-200">
            <div className="col-span-2 bg-slate-50 px-3 py-3 text-center">
              <p className="text-sm font-semibold text-slate-900">{anchorDate.toLocaleDateString(undefined, { weekday: "long" })}</p>
              <p className="text-xs text-slate-500">
                {anchorDate.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
              </p>
            </div>
            {slotRowIndices.map((slotIdx) => {
              const ds = toLocalDateStr(anchorDate);
              const meeting = meetings.find((m) => m.dateStr === ds && m.startSlot === slotIdx);
              return (
                <Fragment key={slotIdx}>
                  <div className="bg-white px-2 py-2 text-[11px] font-semibold text-slate-400">
                    {formatAvailabilitySlotLabel(slotIdx)}
                  </div>
                  <div className="relative min-h-[40px] bg-white p-1">
                    {meeting ? (
                      <div
                        className={`absolute inset-1 z-[1] rounded-xl border px-2 py-2 text-xs font-semibold shadow-sm ${meeting.color}`}
                        style={{ height: `calc(${meeting.span} * 40px - 4px)` }}
                      >
                        {meeting.title}
                      </div>
                    ) : (
                      <div className="h-full rounded-xl border border-dashed border-slate-100" />
                    )}
                  </div>
                </Fragment>
              );
            })}
          </div>
        </div>
      ) : null}
    </Card>
  );

  const availabilityCard = (
    <Card className="p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Availability editor</p>
          <h2 className="mt-2 text-xl font-semibold text-slate-950">Public booking windows</h2>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-9 shrink-0 rounded-full px-3 text-sm"
              onClick={() => shiftAvailabilityWeek(-1)}
              aria-label="Previous week"
            >
              ←
            </Button>
            <p className="min-w-0 flex-1 text-xs leading-snug text-slate-600 sm:text-sm">
              <span className="font-semibold text-slate-800">Week of {formatWeekRangeMonFri(weekMonday)}</span>
            </p>
            <Button
              type="button"
              variant="outline"
              className="h-9 shrink-0 rounded-full px-3 text-sm"
              onClick={() => shiftAvailabilityWeek(1)}
              aria-label="Next week"
            >
              →
            </Button>
          </div>
        </div>
        <div className="rounded-full bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700">{weekSlotCount} open slots</div>
      </div>

      <div
        className="mt-4 grid grid-cols-[64px_repeat(5,minmax(0,1fr))] gap-1 rounded-[24px] border border-slate-200 bg-slate-50 p-3"
        onMouseLeave={() => setDragMode(null)}
        onMouseUp={() => setDragMode(null)}
      >
        <div />
        {workWeekDates.map((d, idx) => (
          <div key={toLocalDateStr(d)} className="px-1 py-2 text-center">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">{WEEKDAY_SHORT[idx]}</p>
            <p className="text-[11px] font-semibold text-slate-700">{d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}</p>
          </div>
        ))}
        {slotRowIndices.map((slotIdx) => (
          <div key={slotIdx} className="contents">
            <div className="flex items-center text-[11px] font-medium text-slate-400">{formatAvailabilitySlotLabel(slotIdx)}</div>
            {workWeekDateStrs.map((ds) => {
              const key = dateSlotKey(ds, slotIdx);
              const active = activeSlots.has(key);
              return (
                <button
                  key={key}
                  type="button"
                  onMouseDown={() => {
                    const nextMode = active ? "remove" : "add";
                    setDragMode(nextMode);
                    applySlot(key, nextMode);
                  }}
                  onMouseEnter={() => {
                    if (dragMode) applySlot(key, dragMode);
                  }}
                  onMouseUp={() => setDragMode(null)}
                  className={`h-8 rounded-xl border transition ${
                    active ? "border-emerald-300 bg-emerald-200/80" : "border-white bg-white hover:border-primary/20 hover:bg-primary/[0.06]"
                  }`}
                />
              );
            })}
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          className="rounded-full"
          onClick={() => {
            if (!storageKey) return;
            const next = new Set(activeSlots);
            for (const ds of workWeekDateStrs) {
              for (const slot of slotRowIndices) {
                next.delete(dateSlotKey(ds, slot));
              }
            }
            writeAvailabilityDateSetForStorageKey(next, storageKey);
            setActiveSlots(next);
          }}
        >
          Clear this week
        </Button>
        <Button
          type="button"
          variant="outline"
          className="rounded-full"
          onClick={() => {
            if (!storageKey) return;
            const next = new Set(activeSlots);
            const templateSlots = [4, 5, 6, 12, 13];
            for (const ds of workWeekDateStrs) {
              for (const s of templateSlots) {
                if (s >= SLOT_ROW_START && s <= SLOT_ROW_END) {
                  next.add(dateSlotKey(ds, s));
                }
              }
            }
            writeAvailabilityDateSetForStorageKey(next, storageKey);
            setActiveSlots(next);
          }}
        >
          Apply template
        </Button>
      </div>
    </Card>
  );

  return (
    <div className="grid gap-4 xl:grid-cols-[1.25fr_0.95fr]">
      {scheduleCard}
      {availabilityCard}
    </div>
  );
}
