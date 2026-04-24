"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { PORTAL_CALENDAR_FRAME, PortalSegmentedControl } from "./portal-metrics";
import {
  ADMIN_AVAILABILITY_STORAGE_KEY,
  SLOTS_PER_DAY,
  dateHasAvailability,
  dateSlotKey,
  formatAvailabilitySlotLabel,
  getPartnerInquiryWindows,
  readPartnerInquiries,
  readPlannedEvents,
  readAvailabilityDateSetForStorageKey,
  startOfWeekMonday,
  toLocalDateStr,
  writeAvailabilityDateSetForStorageKey,
} from "@/lib/demo-admin-scheduling";

type CalendarMode = "day" | "week" | "month";
type RecurrenceCadence = "once" | "weekly" | "biweekly" | "monthly";
type DragSelection = {
  dateStr: string;
  weekday: number;
  startSlot: number;
  endSlotExclusive: number;
};

const SLOT_ROW_START = 0;
const SLOT_ROW_END = SLOTS_PER_DAY - 1;
const DEFAULT_VISIBLE_START_SLOT = 16;
const DEFAULT_VISIBLE_END_SLOT_EXCLUSIVE = 40;
const WEEKDAY_OPTIONS = [
  { value: 0, label: "Mon" },
  { value: 1, label: "Tue" },
  { value: 2, label: "Wed" },
  { value: 3, label: "Thu" },
  { value: 4, label: "Fri" },
  { value: 5, label: "Sat" },
  { value: 6, label: "Sun" },
] as const;

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

function formatWeekRangeMonSun(monday: Date): string {
  const sunday = addDays(monday, 6);
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  return `${monday.toLocaleDateString(undefined, opts)}–${sunday.toLocaleDateString(undefined, { ...opts, year: "numeric" })}`;
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
    return formatWeekRangeMonSun(startOfWeekMonday(anchor));
  }
  return anchor.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric", year: "numeric" });
}

type DemoMeeting = {
  id: string;
  dateStr: string;
  startSlot: number;
  span: number;
  title: string;
  color: string;
  statusLabel?: string;
};

const slotRowIndices = Array.from({ length: SLOT_ROW_END - SLOT_ROW_START + 1 }, (_, i) => SLOT_ROW_START + i);

function formatSlotEndLabel(slotIndexExclusive: number): string {
  const mins = (slotIndexExclusive % SLOTS_PER_DAY) * 30;
  const h24 = Math.floor(mins / 60);
  const m = mins % 60;
  const d = new Date(2000, 0, 1, h24, m);
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function weekdayLabelList(days: number[]) {
  return WEEKDAY_OPTIONS.filter((option) => days.includes(option.value))
    .map((option) => option.label)
    .join(", ");
}

export function PortalCalendarPanels({
  storageKey,
  calendarRefreshSignal,
  defaultViewMode = "week",
  pinMonthSchedule = false,
  tourScopeLabel,
  unavailableMessage = "Sign in to manage your availability.",
  compactAvailability = false,
}: {
  storageKey: string | null;
  calendarRefreshSignal?: number;
  defaultViewMode?: CalendarMode;
  pinMonthSchedule?: boolean;
  tourScopeLabel?: string;
  unavailableMessage?: string;
  compactAvailability?: boolean;
}) {
  const [viewMode, setViewMode] = useState<CalendarMode>(defaultViewMode);
  const [monthPick, setMonthPick] = useState<{ start: string | null; end: string | null }>({ start: null, end: null });
  const [anchorDate, setAnchorDate] = useState(() => new Date());
  const [activeSlots, setActiveSlots] = useState<Set<string>>(() => new Set());
  const [dragSelection, setDragSelection] = useState<DragSelection | null>(null);
  const [visibleStartSlot, setVisibleStartSlot] = useState(DEFAULT_VISIBLE_START_SLOT);
  const [visibleEndSlotExclusive, setVisibleEndSlotExclusive] = useState(DEFAULT_VISIBLE_END_SLOT_EXCLUSIVE);
  const [blockModalOpen, setBlockModalOpen] = useState(false);
  const [blockStartSlot, setBlockStartSlot] = useState(DEFAULT_VISIBLE_START_SLOT);
  const [blockEndSlotExclusive, setBlockEndSlotExclusive] = useState(DEFAULT_VISIBLE_START_SLOT + 2);
  const [blockWeekdays, setBlockWeekdays] = useState<number[]>([0, 1, 2, 3, 4]);
  const [blockCadence, setBlockCadence] = useState<RecurrenceCadence>("weekly");
  const [blockOccurrences, setBlockOccurrences] = useState(4);

  useEffect(() => {
    if (!storageKey) return;
    setActiveSlots(new Set(readAvailabilityDateSetForStorageKey(storageKey)));
  }, [storageKey]);

  const weekMonday = useMemo(() => startOfWeekMonday(anchorDate), [anchorDate]);
  const fullWeekDates = useMemo(() => [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(weekMonday, i)), [weekMonday]);
  const fullWeekDateStrs = useMemo(() => fullWeekDates.map(toLocalDateStr), [fullWeekDates]);

  const meetings = useMemo<DemoMeeting[]>(() => {
    if (storageKey !== ADMIN_AVAILABILITY_STORAGE_KEY) return [];

    const planned = readPlannedEvents().map((event) => {
      const start = new Date(event.start);
      const end = new Date(event.end);
      const mins = Math.max(30, end.getTime() - start.getTime());
      return {
        id: `planned-${event.id}`,
        dateStr: toLocalDateStr(start),
        startSlot: Math.max(0, Math.floor((start.getHours() * 60 + start.getMinutes()) / 30)),
        span: Math.max(1, Math.round(mins / (30 * 60 * 1000))),
        title: event.title,
        color: "border-sky-300 bg-sky-100 text-sky-950",
        statusLabel: "Confirmed",
      } satisfies DemoMeeting;
    });

    const pending = readPartnerInquiries()
      .filter((row) => row.status === "pending")
      .flatMap((row) =>
        getPartnerInquiryWindows(row).map((window, index) => {
          const start = new Date(window.start);
          const end = new Date(window.end);
          const mins = Math.max(30, end.getTime() - start.getTime());
          return {
            id: `inquiry-${row.id}-${index}`,
            dateStr: toLocalDateStr(start),
            startSlot: Math.max(0, Math.floor((start.getHours() * 60 + start.getMinutes()) / 30)),
            span: Math.max(1, Math.round(mins / (30 * 60 * 1000))),
            title: `${row.name} request`,
            color: "border-amber-300 bg-amber-100 text-amber-950",
            statusLabel: "Requested",
          } satisfies DemoMeeting;
        }),
      );

    return [...planned, ...pending];
  }, [storageKey, activeSlots, calendarRefreshSignal]);

  const monthYear = anchorDate.getFullYear();
  const monthIndex = anchorDate.getMonth();
  const monthCells = useMemo(() => buildMonthCells(monthYear, monthIndex), [monthYear, monthIndex]);
  const today = useMemo(() => new Date(), []);

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

  const visibleSlotIndices = useMemo(
    () => slotRowIndices.filter((slot) => slot >= visibleStartSlot && slot < visibleEndSlotExclusive),
    [visibleEndSlotExclusive, visibleStartSlot],
  );

  const reloadAvailability = useCallback(() => {
    if (!storageKey) return;
    setActiveSlots(new Set(readAvailabilityDateSetForStorageKey(storageKey)));
  }, [storageKey]);

  const writeAvailability = useCallback(
    (next: Set<string>) => {
      if (!storageKey) return;
      writeAvailabilityDateSetForStorageKey(next, storageKey);
      setActiveSlots(next);
    },
    [storageKey],
  );

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
    for (const ds of fullWeekDateStrs) {
      for (const slot of slotRowIndices) {
        if (activeSlots.has(dateSlotKey(ds, slot))) n += 1;
      }
    }
    return n;
  }, [activeSlots, fullWeekDateStrs]);

  const meetingBySlotKey = useMemo(() => {
    const map = new Map<string, DemoMeeting>();
    for (const meeting of meetings) {
      for (let offset = 0; offset < meeting.span; offset += 1) {
        map.set(dateSlotKey(meeting.dateStr, meeting.startSlot + offset), meeting);
      }
    }
    return map;
  }, [meetings]);

  const timeWindowControl = (
    <div className="flex flex-wrap items-center gap-2">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Show</p>
      <select
        className="h-9 rounded-full border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 outline-none transition focus:ring-2 focus:ring-primary/25"
        value={String(visibleStartSlot)}
        onChange={(e) => {
          const nextStart = Number.parseInt(e.target.value, 10);
          if (!Number.isFinite(nextStart)) return;
          setVisibleStartSlot(nextStart);
          setVisibleEndSlotExclusive((current) =>
            current <= nextStart ? Math.min(nextStart + 1, SLOTS_PER_DAY) : current,
          );
        }}
      >
        {slotRowIndices.map((slot) => (
          <option key={`start-${slot}`} value={slot}>
            {formatAvailabilitySlotLabel(slot)}
          </option>
        ))}
      </select>
      <span className="text-sm font-medium text-slate-500">to</span>
      <select
        className="h-9 rounded-full border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 outline-none transition focus:ring-2 focus:ring-primary/25"
        value={String(visibleEndSlotExclusive)}
        onChange={(e) => {
          const nextEnd = Number.parseInt(e.target.value, 10);
          if (!Number.isFinite(nextEnd)) return;
          setVisibleEndSlotExclusive(nextEnd);
          setVisibleStartSlot((current) => (current >= nextEnd ? Math.max(0, nextEnd - 1) : current));
        }}
      >
        {slotRowIndices
          .map((slot) => slot + 1)
          .filter((slot) => slot > visibleStartSlot && slot <= SLOTS_PER_DAY)
          .map((slot) => (
            <option key={`end-${slot}`} value={slot}>
              {formatSlotEndLabel(slot)}
            </option>
          ))}
      </select>
    </div>
  );

  const shiftAnchor = (dir: -1 | 1) => {
    if (viewMode === "month") setAnchorDate((d) => addMonths(d, dir));
    else if (viewMode === "week") setAnchorDate((d) => addDays(d, dir * 7));
    else setAnchorDate((d) => addDays(d, dir));
  };

  const jumpToToday = useCallback(() => {
    setAnchorDate(new Date(today));
    setMonthPick({ start: null, end: null });
  }, [today]);

  const shiftAvailabilityWeek = useCallback((dir: -1 | 1) => {
    setAnchorDate((d) => addDays(d, dir * 7));
  }, []);

  const copyPreviousWeek = useCallback(() => {
    const previousWeekDates = fullWeekDates.map((date) => addDays(date, -7));
    const next = new Set(activeSlots);

    for (const targetDate of fullWeekDates) {
      const targetDateStr = toLocalDateStr(targetDate);
      for (const slot of slotRowIndices) {
        next.delete(dateSlotKey(targetDateStr, slot));
      }
    }

    previousWeekDates.forEach((sourceDate, idx) => {
      const sourceDateStr = toLocalDateStr(sourceDate);
      const targetDateStr = toLocalDateStr(fullWeekDates[idx]!);
      for (const slot of slotRowIndices) {
        if (activeSlots.has(dateSlotKey(sourceDateStr, slot))) {
          next.add(dateSlotKey(targetDateStr, slot));
        }
      }
    });

    writeAvailability(next);
  }, [activeSlots, fullWeekDates, writeAvailability]);

  const toggleBlockWeekday = useCallback((weekday: number) => {
    setBlockWeekdays((current) =>
      current.includes(weekday) ? current.filter((value) => value !== weekday) : [...current, weekday].sort((a, b) => a - b),
    );
  }, []);

  const prefillBlockModal = useCallback(
    (selection?: DragSelection | null) => {
      const baseDate = selection ? new Date(`${selection.dateStr}T12:00:00`) : anchorDate;
      const weekday = selection ? selection.weekday : mondayBasedDayIndex(baseDate);
      setBlockWeekdays(viewMode === "day" && !selection ? [weekday] : selection ? [weekday] : [0, 1, 2, 3, 4]);
      setBlockStartSlot(selection?.startSlot ?? visibleStartSlot);
      setBlockEndSlotExclusive(
        selection?.endSlotExclusive ?? Math.min(SLOTS_PER_DAY, visibleStartSlot + 2),
      );
      setBlockCadence(selection ? "once" : "weekly");
      setBlockOccurrences(selection ? 1 : 4);
      setBlockModalOpen(true);
    },
    [anchorDate, viewMode, visibleStartSlot],
  );

  const openBlockModal = useCallback(() => {
    prefillBlockModal(null);
  }, [prefillBlockModal]);

  const startDragSelection = useCallback((dateStr: string, weekday: number, slotIdx: number) => {
    setDragSelection({
      dateStr,
      weekday,
      startSlot: slotIdx,
      endSlotExclusive: slotIdx + 1,
    });
  }, []);

  const extendDragSelection = useCallback((dateStr: string, slotIdx: number) => {
    setDragSelection((current) => {
      if (!current || current.dateStr !== dateStr) return current;
      const start = Math.min(current.startSlot, slotIdx);
      const end = Math.max(current.startSlot, slotIdx) + 1;
      return {
        ...current,
        startSlot: start,
        endSlotExclusive: end,
      };
    });
  }, []);

  const finishDragSelection = useCallback(() => {
    if (!dragSelection) return;
    prefillBlockModal(dragSelection);
    setDragSelection(null);
  }, [dragSelection, prefillBlockModal]);

  const cancelDragSelection = useCallback(() => {
    setDragSelection(null);
  }, []);

  const isSlotInDragSelection = useCallback(
    (dateStr: string, slotIdx: number) =>
      Boolean(
        dragSelection &&
          dragSelection.dateStr === dateStr &&
          slotIdx >= dragSelection.startSlot &&
          slotIdx < dragSelection.endSlotExclusive,
      ),
    [dragSelection],
  );

  const applyRecurringBlock = useCallback(() => {
    if (blockWeekdays.length === 0 || blockEndSlotExclusive <= blockStartSlot) return;

    const next = new Set(activeSlots);
    const occurrences = blockCadence === "once" ? 1 : Math.max(1, blockOccurrences);
    const baseDates = blockWeekdays.map((weekday) => addDays(weekMonday, weekday));

    for (let occurrenceIndex = 0; occurrenceIndex < occurrences; occurrenceIndex += 1) {
      const targetDates = baseDates.map((date) => {
        if (blockCadence === "once" || blockCadence === "weekly") return addDays(date, occurrenceIndex * 7);
        if (blockCadence === "biweekly") return addDays(date, occurrenceIndex * 14);
        return addMonths(date, occurrenceIndex);
      });

      for (const targetDate of targetDates) {
        const targetDateStr = toLocalDateStr(targetDate);
        for (let slot = blockStartSlot; slot < blockEndSlotExclusive; slot += 1) {
          next.add(dateSlotKey(targetDateStr, slot));
        }
      }
    }

    writeAvailability(next);
    setBlockModalOpen(false);
  }, [activeSlots, blockCadence, blockEndSlotExclusive, blockOccurrences, blockStartSlot, blockWeekdays, weekMonday, writeAvailability]);

  const clearCurrentWeek = useCallback(() => {
    const next = new Set(activeSlots);
    for (const ds of fullWeekDateStrs) {
      for (const slot of slotRowIndices) {
        next.delete(dateSlotKey(ds, slot));
      }
    }
    writeAvailability(next);
  }, [activeSlots, fullWeekDateStrs, writeAvailability]);

  const blockSummary = useMemo(() => {
    const days = blockWeekdays.length > 0 ? weekdayLabelList(blockWeekdays) : "No days selected";
    const repeats =
      blockCadence === "once"
        ? "this week only"
        : `${blockCadence} for ${blockOccurrences} occurrence${blockOccurrences === 1 ? "" : "s"}`;
    return `${days} · ${formatAvailabilitySlotLabel(blockStartSlot)}-${formatSlotEndLabel(blockEndSlotExclusive)} · ${repeats}`;
  }, [blockCadence, blockEndSlotExclusive, blockOccurrences, blockStartSlot, blockWeekdays]);

  if (!storageKey) {
    return (
      <Card className="p-5">
        <p className="text-sm font-medium text-slate-800">{unavailableMessage}</p>
      </Card>
    );
  }

  if (compactAvailability) {
    return (
      <>
        <Card className="p-4 sm:p-5">
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="outline" className="h-10 rounded-full px-3" onClick={() => shiftAvailabilityWeek(-1)} aria-label="Previous week">
                  ←
                </Button>
                <div className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2">
                  <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">Availability</p>
                  <p className="truncate text-sm font-semibold text-slate-900">Week of {formatWeekRangeMonSun(weekMonday)}</p>
                  {tourScopeLabel ? <p className="truncate text-xs font-medium text-primary">{tourScopeLabel}</p> : null}
                </div>
                <Button type="button" variant="outline" className="h-10 rounded-full px-3" onClick={() => shiftAvailabilityWeek(1)} aria-label="Next week">
                  →
                </Button>
                <div className="rounded-full bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700">{weekSlotCount} open this week</div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 xl:justify-end">
              {timeWindowControl}
              <Button type="button" variant="outline" className="rounded-full" onClick={jumpToToday}>
                Today
              </Button>
              <Button type="button" variant="outline" className="rounded-full" onClick={copyPreviousWeek}>
                Copy previous week
              </Button>
              <Button type="button" variant="outline" className="rounded-full" onClick={openBlockModal}>
                Create block
              </Button>
              <Button type="button" variant="outline" className="rounded-full" onClick={clearCurrentWeek}>
                Clear week
              </Button>
            </div>
          </div>

          <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="border-b border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-xs font-semibold text-slate-600">Drag to define a time block, then edit it before saving. Use Create block for recurring schedules.</p>
            </div>
            <div className="overflow-x-auto" onMouseLeave={cancelDragSelection} onMouseUp={finishDragSelection}>
              <div className="grid min-w-[920px] grid-cols-[76px_repeat(7,minmax(108px,1fr))] gap-px bg-slate-200 text-xs">
                <div className="bg-slate-50 px-2 py-2 font-bold uppercase tracking-[0.12em] text-slate-400">Time</div>
                {fullWeekDates.map((d) => {
                  const ds = toLocalDateStr(d);
                  const count = visibleSlotIndices.reduce((total, slot) => total + (activeSlots.has(dateSlotKey(ds, slot)) ? 1 : 0), 0);
                  return (
                    <div key={ds} className="bg-slate-50 px-2 py-2 text-center">
                      <p className="font-bold uppercase tracking-[0.12em] text-slate-500">{d.toLocaleDateString(undefined, { weekday: "short" })}</p>
                      <p className="mt-0.5 font-semibold text-slate-900">{d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}</p>
                      <p className="mt-0.5 text-[11px] font-medium text-emerald-700">{count} open</p>
                    </div>
                  );
                })}

                {visibleSlotIndices.map((slotIdx) => (
                  <Fragment key={slotIdx}>
                    <div className="flex min-h-9 items-center bg-white px-2 font-semibold text-slate-500">{formatAvailabilitySlotLabel(slotIdx)}</div>
                    {fullWeekDateStrs.map((ds) => {
                      const key = dateSlotKey(ds, slotIdx);
                      const active = activeSlots.has(key);
                      const selected = isSlotInDragSelection(ds, slotIdx);
                      const meeting = meetingBySlotKey.get(key);
                      const isMeetingStart = meeting?.startSlot === slotIdx;
                      return (
                        <button
                          key={key}
                          type="button"
                          onMouseDown={() => startDragSelection(ds, fullWeekDateStrs.indexOf(ds), slotIdx)}
                          onMouseEnter={() => extendDragSelection(ds, slotIdx)}
                          onMouseUp={finishDragSelection}
                          className={`min-h-9 px-2 text-center text-[11px] font-semibold transition ${
                            meeting
                              ? `${meeting.color} ring-1 ring-inset`
                              : selected
                                ? "bg-primary/[0.14] text-primary ring-2 ring-inset ring-primary/35"
                              : active
                                ? "bg-emerald-100 text-emerald-950 ring-1 ring-inset ring-emerald-300"
                                : "bg-white text-transparent hover:bg-primary/[0.07] hover:text-primary"
                          }`}
                          aria-label={`Select ${formatAvailabilitySlotLabel(slotIdx)} on ${ds}`}
                        >
                          {meeting ? (
                            isMeetingStart ? (
                              <span className="block truncate">
                                {meeting.statusLabel}: {meeting.title}
                              </span>
                            ) : (
                              <span className="block truncate opacity-70">{meeting.statusLabel}</span>
                            )
                          ) : selected ? (
                            "Selected"
                          ) : active ? (
                            "Open"
                          ) : (
                            "Add"
                          )}
                        </button>
                      );
                    })}
                  </Fragment>
                ))}
              </div>
            </div>
          </div>
        </Card>

        <Modal open={blockModalOpen} title="Create recurring availability block" onClose={() => { setBlockModalOpen(false); setDragSelection(null); }}>
          <div className="space-y-5">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">{blockSummary}</div>

            <div className="space-y-2">
              <p className="text-sm font-semibold text-slate-900">Days of week</p>
              <div className="flex flex-wrap gap-2">
                {WEEKDAY_OPTIONS.map((option) => {
                  const active = blockWeekdays.includes(option.value);
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => toggleBlockWeekday(option.value)}
                      className={`rounded-full border px-3 py-2 text-sm font-semibold transition ${
                        active
                          ? "border-primary bg-primary text-white"
                          : "border-slate-200 bg-white text-slate-700 hover:border-primary/30 hover:text-primary"
                      }`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-900">Start time</label>
                <Select
                  value={String(blockStartSlot)}
                  onChange={(e) => {
                    const nextStart = Number.parseInt(e.target.value, 10);
                    if (!Number.isFinite(nextStart)) return;
                    setBlockStartSlot(nextStart);
                    setBlockEndSlotExclusive((current) =>
                      current <= nextStart ? Math.min(SLOTS_PER_DAY, nextStart + 1) : current,
                    );
                  }}
                >
                  {slotRowIndices.map((slot) => (
                    <option key={`block-start-${slot}`} value={slot}>
                      {formatAvailabilitySlotLabel(slot)}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-900">End time</label>
                <Select
                  value={String(blockEndSlotExclusive)}
                  onChange={(e) => {
                    const nextEnd = Number.parseInt(e.target.value, 10);
                    if (!Number.isFinite(nextEnd)) return;
                    setBlockEndSlotExclusive(nextEnd);
                    setBlockStartSlot((current) => (current >= nextEnd ? Math.max(0, nextEnd - 1) : current));
                  }}
                >
                  {slotRowIndices
                    .map((slot) => slot + 1)
                    .filter((slot) => slot > blockStartSlot && slot <= SLOTS_PER_DAY)
                    .map((slot) => (
                      <option key={`block-end-${slot}`} value={slot}>
                        {formatSlotEndLabel(slot)}
                      </option>
                    ))}
                </Select>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_140px]">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-900">Repeat</label>
                <Select value={blockCadence} onChange={(e) => setBlockCadence(e.target.value as RecurrenceCadence)}>
                  <option value="once">Once</option>
                  <option value="weekly">Weekly</option>
                  <option value="biweekly">Biweekly</option>
                  <option value="monthly">Monthly</option>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-900">Occurrences</label>
                <Input
                  type="number"
                  min={1}
                  max={24}
                  value={String(blockCadence === "once" ? 1 : blockOccurrences)}
                  onChange={(e) => setBlockOccurrences(Math.max(1, Math.min(24, Number.parseInt(e.target.value, 10) || 1)))}
                  disabled={blockCadence === "once"}
                />
              </div>
            </div>

            <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
              <Button type="button" variant="outline" className="rounded-full" onClick={() => setBlockModalOpen(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                className="rounded-full"
                onClick={applyRecurringBlock}
                disabled={blockWeekdays.length === 0 || blockEndSlotExclusive <= blockStartSlot}
              >
                Create block
              </Button>
            </div>
          </div>
        </Modal>
      </>
    );
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
              <Button type="button" variant="outline" className="h-9 rounded-full px-3 text-xs" onClick={jumpToToday}>
                Today
              </Button>
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
            {viewMode !== "month" ? timeWindowControl : null}
            <Button type="button" variant="outline" className="h-9 rounded-full px-3 text-xs" onClick={openBlockModal}>
              Create block
            </Button>
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
          <div className="space-y-3">
            {fullWeekDates.map((d) => {
              const ds = toLocalDateStr(d);
              return (
                <div key={ds} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                  <div className="bg-slate-50 px-4 py-3">
                    <p className="text-sm font-semibold text-slate-900">{d.toLocaleDateString(undefined, { weekday: "long" })}</p>
                    <p className="text-xs text-slate-500">{d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}</p>
                  </div>
                  <div className="grid grid-cols-[76px_minmax(0,1fr)] gap-px bg-slate-100">
                    {visibleSlotIndices.map((slotIdx) => {
                      const meeting = meetings.find((m) => m.dateStr === ds && m.startSlot === slotIdx);
                      return (
                        <Fragment key={`${ds}-${slotIdx}`}>
                          <div className="bg-white px-3 py-2 text-[11px] font-semibold text-slate-400">{formatAvailabilitySlotLabel(slotIdx)}</div>
                          <div className="relative min-h-[40px] bg-white p-1">
                            {meeting ? (
                              <div className={`rounded-xl border px-2 py-2 text-xs font-semibold shadow-sm ${meeting.color}`}>{meeting.title}</div>
                            ) : (
                              <div className="h-full rounded-xl border border-dashed border-slate-100" />
                            )}
                          </div>
                        </Fragment>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {viewMode === "day" ? (
        <div className={PORTAL_CALENDAR_FRAME}>
          <div className="grid grid-cols-[68px_minmax(0,1fr)] gap-px bg-slate-200">
            <div className="col-span-2 bg-slate-50 px-3 py-3 text-center">
              <p className="text-sm font-semibold text-slate-900">{anchorDate.toLocaleDateString(undefined, { weekday: "long" })}</p>
              <p className="text-xs text-slate-500">{anchorDate.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</p>
            </div>
            {visibleSlotIndices.map((slotIdx) => {
              const ds = toLocalDateStr(anchorDate);
              const meeting = meetings.find((m) => m.dateStr === ds && m.startSlot === slotIdx);
              return (
                <Fragment key={slotIdx}>
                  <div className="bg-white px-2 py-2 text-[11px] font-semibold text-slate-400">{formatAvailabilitySlotLabel(slotIdx)}</div>
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
          {tourScopeLabel ? <p className="mt-1 text-sm font-medium text-primary">{tourScopeLabel}</p> : null}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" className="h-9 shrink-0 rounded-full px-3 text-sm" onClick={jumpToToday}>
              Today
            </Button>
            <Button type="button" variant="outline" className="h-9 shrink-0 rounded-full px-3 text-sm" onClick={() => shiftAvailabilityWeek(-1)} aria-label="Previous week">
              ←
            </Button>
            <p className="min-w-0 flex-1 text-xs leading-snug text-slate-600 sm:text-sm">
              <span className="font-semibold text-slate-800">Week of {formatWeekRangeMonSun(weekMonday)}</span>
            </p>
            <Button type="button" variant="outline" className="h-9 shrink-0 rounded-full px-3 text-sm" onClick={() => shiftAvailabilityWeek(1)} aria-label="Next week">
              →
            </Button>
          </div>
        </div>
        <div className="rounded-full bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700">{weekSlotCount} open slots</div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {timeWindowControl}
        <Button type="button" variant="outline" className="rounded-full" onClick={openBlockModal}>
          Create block
        </Button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" variant="outline" className="rounded-full" onClick={copyPreviousWeek}>
          Copy previous week
        </Button>
      </div>

      <div className="mt-4 space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-3" onMouseLeave={cancelDragSelection} onMouseUp={finishDragSelection}>
        {fullWeekDates.map((d) => {
          const ds = toLocalDateStr(d);
          const weekday = mondayBasedDayIndex(d);
          return (
            <div key={ds} className="rounded-2xl border border-slate-200 bg-white p-3">
              <div className="mb-3">
                <p className="text-sm font-bold text-slate-900">{d.toLocaleDateString(undefined, { weekday: "long" })}</p>
                <p className="text-xs font-semibold text-slate-500">{d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}</p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {visibleSlotIndices.map((slotIdx) => {
                  const key = dateSlotKey(ds, slotIdx);
                  const active = activeSlots.has(key);
                  const selected = isSlotInDragSelection(ds, slotIdx);
                  return (
                    <button
                      key={key}
                      type="button"
                      onMouseDown={() => startDragSelection(ds, weekday, slotIdx)}
                      onMouseEnter={() => extendDragSelection(ds, slotIdx)}
                      onMouseUp={finishDragSelection}
                      className={`flex min-h-10 items-center justify-between rounded-xl border px-3 text-left text-xs font-semibold transition ${
                        selected
                          ? "border-primary/40 bg-primary/[0.12] text-primary"
                          : 
                        active
                          ? "border-emerald-300 bg-emerald-100 text-emerald-900"
                          : "border-slate-100 bg-slate-50 text-slate-500 hover:border-primary/20 hover:bg-primary/[0.06]"
                      }`}
                    >
                      <span>{formatAvailabilitySlotLabel(slotIdx)}</span>
                      <span>{selected ? "Selected" : active ? "Open" : ""}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="button" variant="outline" className="rounded-full" onClick={clearCurrentWeek}>
          Clear this week
        </Button>
      </div>
    </Card>
  );

  return (
    <>
      <div className="grid gap-4 xl:grid-cols-[1.25fr_0.95fr]">
        {scheduleCard}
        {availabilityCard}
      </div>

      <Modal open={blockModalOpen} title="Create recurring availability block" onClose={() => { setBlockModalOpen(false); setDragSelection(null); }}>
        <div className="space-y-5">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">{blockSummary}</div>

          <div className="space-y-2">
            <p className="text-sm font-semibold text-slate-900">Days of week</p>
            <div className="flex flex-wrap gap-2">
              {WEEKDAY_OPTIONS.map((option) => {
                const active = blockWeekdays.includes(option.value);
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => toggleBlockWeekday(option.value)}
                    className={`rounded-full border px-3 py-2 text-sm font-semibold transition ${
                      active
                        ? "border-primary bg-primary text-white"
                        : "border-slate-200 bg-white text-slate-700 hover:border-primary/30 hover:text-primary"
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-900">Start time</label>
              <Select
                value={String(blockStartSlot)}
                onChange={(e) => {
                  const nextStart = Number.parseInt(e.target.value, 10);
                  if (!Number.isFinite(nextStart)) return;
                  setBlockStartSlot(nextStart);
                  setBlockEndSlotExclusive((current) => (current <= nextStart ? Math.min(SLOTS_PER_DAY, nextStart + 1) : current));
                }}
              >
                {slotRowIndices.map((slot) => (
                  <option key={`block-start-${slot}`} value={slot}>
                    {formatAvailabilitySlotLabel(slot)}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-900">End time</label>
              <Select
                value={String(blockEndSlotExclusive)}
                onChange={(e) => {
                  const nextEnd = Number.parseInt(e.target.value, 10);
                  if (!Number.isFinite(nextEnd)) return;
                  setBlockEndSlotExclusive(nextEnd);
                  setBlockStartSlot((current) => (current >= nextEnd ? Math.max(0, nextEnd - 1) : current));
                }}
              >
                {slotRowIndices
                  .map((slot) => slot + 1)
                  .filter((slot) => slot > blockStartSlot && slot <= SLOTS_PER_DAY)
                  .map((slot) => (
                    <option key={`block-end-${slot}`} value={slot}>
                      {formatSlotEndLabel(slot)}
                    </option>
                  ))}
              </Select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_140px]">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-900">Repeat</label>
              <Select value={blockCadence} onChange={(e) => setBlockCadence(e.target.value as RecurrenceCadence)}>
                <option value="once">Once</option>
                <option value="weekly">Weekly</option>
                <option value="biweekly">Biweekly</option>
                <option value="monthly">Monthly</option>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-900">Occurrences</label>
              <Input
                type="number"
                min={1}
                max={24}
                value={String(blockCadence === "once" ? 1 : blockOccurrences)}
                onChange={(e) => setBlockOccurrences(Math.max(1, Math.min(24, Number.parseInt(e.target.value, 10) || 1)))}
                disabled={blockCadence === "once"}
              />
            </div>
          </div>

          <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
            <Button type="button" variant="outline" className="rounded-full" onClick={() => setBlockModalOpen(false)}>
              Cancel
            </Button>
            <Button type="button" variant="primary" className="rounded-full" onClick={applyRecurringBlock} disabled={blockWeekdays.length === 0 || blockEndSlotExclusive <= blockStartSlot}>
              Create block
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
