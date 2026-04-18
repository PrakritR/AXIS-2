"use client";

import { Fragment, memo, useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { SegmentedThree } from "@/components/ui/segmented-control";
import { TabNav, type TabItem } from "@/components/ui/tabs";
import { ManagerSectionShell } from "@/components/portal/manager-section-shell";
import { useAppUi } from "@/components/providers/app-ui-provider";
import {
  acceptPartnerInquiry,
  dateHasAvailability,
  dateSlotKey,
  declinePartnerInquiry,
  eventKpis,
  formatRangeLabel,
  mondayBasedDayIndex,
  readAvailabilityDateSet,
  readPartnerInquiries,
  readPlannedEvents,
  startOfWeekMonday,
  toLocalDateStr,
  writeAvailabilityDateSet,
  writeAvailabilitySet,
  type PartnerInquiry,
  type PlannedEvent,
  WEEKDAY_LABELS,
  SLOTS_PER_DAY,
} from "@/lib/demo-admin-scheduling";
import { ADMIN_UI_EVENT } from "@/lib/demo-admin-ui";

const tabs: TabItem[] = [
  { id: "events", label: "Events", href: "/admin/events/events" },
  { id: "availability", label: "Availability", href: "/admin/events/availability" },
];

type CalendarMode = "day" | "week" | "month";

function slotLabel(slotIndex: number) {
  const mins = 8 * 60 + slotIndex * 30;
  const h24 = Math.floor(mins / 60);
  const m = mins % 60;
  const d = new Date(2000, 0, 1, h24, m);
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function weekDatesFromMonday(weekMonday: Date) {
  const start = new Date(weekMonday.getFullYear(), weekMonday.getMonth(), weekMonday.getDate(), 0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

function addCalendarMonths(d: Date, delta: number) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0, 0);
  x.setMonth(x.getMonth() + delta);
  return x;
}

function dayCellTone(d: Date, availability: Set<string>, events: PlannedEvent[]) {
  const hasAvail = dateHasAvailability(d, availability);
  const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);
  const hasEvent = events.some((e) => {
    const t = new Date(e.start).getTime();
    return t >= dayStart.getTime() && t < dayEnd.getTime();
  });
  if (hasEvent) return "border-primary/25 bg-primary/[0.07]";
  if (hasAvail) return "border-emerald-200/80 bg-emerald-50/60";
  return "border-slate-100 bg-white";
}

function formatWeekRangeLabel(weekMonday: Date) {
  const days = weekDatesFromMonday(weekMonday);
  const a = days[0]!;
  const b = days[6]!;
  const y = a.getFullYear() !== b.getFullYear();
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  const optsY: Intl.DateTimeFormatOptions = { ...opts, year: "numeric" };
  return `${a.toLocaleDateString(undefined, y ? optsY : opts)} – ${b.toLocaleDateString(undefined, optsY)}`;
}

function InquiryDetailSheet({
  open,
  onClose,
  row,
  onChanged,
  showToast,
}: {
  open: boolean;
  onClose: () => void;
  row: PartnerInquiry | null;
  onChanged: () => void;
  showToast: (m: string) => void;
}) {
  if (!open || !row) return null;

  const onAccept = () => {
    if (acceptPartnerInquiry(row.id)) {
      showToast("Meeting accepted and added to your calendar.");
      onChanged();
      onClose();
    } else showToast("Could not accept this request.");
  };

  const onDecline = () => {
    if (declinePartnerInquiry(row.id)) {
      showToast("Request declined.");
      onChanged();
      onClose();
    } else showToast("Could not update this request.");
  };

  return (
    <>
      <button
        type="button"
        aria-label="Close details"
        className="fixed inset-0 z-40 bg-slate-900/20 backdrop-blur-[1px]"
        onClick={onClose}
      />
      <aside className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">Partner inquiry</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">{row.name}</p>
            <p className="text-sm text-slate-500">{row.email}</p>
          </div>
          <Button type="button" variant="ghost" className="shrink-0 rounded-full" onClick={onClose}>
            Close
          </Button>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4 text-sm text-slate-700">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">Proposed time</p>
            <p className="mt-1 font-medium text-slate-900">{formatRangeLabel(row.proposedStart, row.proposedEnd)}</p>
          </div>
          {row.phone ? (
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">Phone</p>
              <p className="mt-1">{row.phone}</p>
            </div>
          ) : null}
          {row.notes ? (
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">Notes</p>
              <p className="mt-1 whitespace-pre-wrap">{row.notes}</p>
            </div>
          ) : null}
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">Status</p>
            <p className="mt-1 capitalize">{row.status}</p>
          </div>
        </div>
        {row.status === "pending" ? (
          <div className="flex flex-wrap gap-2 border-t border-slate-100 px-5 py-4">
            <Button type="button" className="rounded-full" onClick={onAccept}>
              Accept
            </Button>
            <Button type="button" variant="outline" className="rounded-full" onClick={onDecline}>
              Decline
            </Button>
          </div>
        ) : null}
      </aside>
    </>
  );
}

function sameLocalDay(a: Date, b: Date) {
  return a.toDateString() === b.toDateString();
}

const MonthGrid = memo(function MonthGrid({
  anchor,
  availability,
  events,
  onDayDoubleClick,
}: {
  anchor: Date;
  availability: Set<string>;
  events: PlannedEvent[];
  onDayDoubleClick?: (d: Date) => void;
}) {
  const year = anchor.getFullYear();
  const month = anchor.getMonth();
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const pad = mondayBasedDayIndex(first);
  const cells: (Date | null)[] = [...Array(pad).fill(null)];
  for (let d = 1; d <= last.getDate(); d += 1) {
    cells.push(new Date(year, month, d));
  }
  while (cells.length % 7 !== 0) cells.push(null);
  while (cells.length < 42) cells.push(null);

  return (
    <div className="rounded-2xl border border-slate-200/90 bg-slate-50/40 p-3">
      <p className="mb-2 text-center text-sm font-semibold text-slate-800">
        {anchor.toLocaleString(undefined, { month: "long", year: "numeric" })}
      </p>
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold uppercase tracking-wide text-slate-400">
        {WEEKDAY_LABELS.map((d) => (
          <div key={d} className="py-1">
            {d}
          </div>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((d, i) =>
          d ? (
            <button
              key={i}
              type="button"
              title="Double-click for events"
              onDoubleClick={() => onDayDoubleClick?.(d)}
              className={`flex aspect-square flex-col items-center justify-center rounded-xl border text-sm font-semibold text-slate-800 transition-colors duration-150 hover:border-primary/30 ${dayCellTone(d, availability, events)}`}
            >
              {d.getDate()}
            </button>
          ) : (
            <div key={i} className="aspect-square" />
          ),
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-emerald-200/90" /> Availability
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-primary/25" /> Event
        </span>
      </div>
    </div>
  );
});

const EventsWeekGrid = memo(function EventsWeekGrid({
  weekMonday,
  availability,
  planned,
  onDayDoubleClick,
}: {
  weekMonday: Date;
  availability: Set<string>;
  planned: PlannedEvent[];
  onDayDoubleClick?: (d: Date) => void;
}) {
  const days = weekDatesFromMonday(weekMonday);
  return (
    <div className="w-full max-w-full rounded-2xl border border-slate-200/90 bg-slate-50/50 p-2 sm:p-3">
      <div className="grid w-full grid-cols-7 gap-1 text-center text-[10px] font-bold uppercase text-slate-400 sm:gap-1.5 sm:text-[11px]">
        {days.map((d) => (
          <div key={toLocalDateStr(d)} className="min-w-0 truncate px-0.5 py-1.5 sm:py-2">
            {WEEKDAY_LABELS[mondayBasedDayIndex(d)]}{" "}
            <span className="font-semibold text-slate-600">{d.getDate()}</span>
          </div>
        ))}
      </div>
      <div className="mt-1 grid min-h-[min(12rem,28vh)] w-full grid-cols-7 gap-1 sm:min-h-[14rem] sm:gap-1.5">
        {days.map((d) => (
          <button
            key={toLocalDateStr(d)}
            type="button"
            onDoubleClick={() => onDayDoubleClick?.(d)}
            title="Double-click for events"
            aria-label={`${d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })} — double-click for events`}
            className={`relative min-h-[10rem] rounded-xl border p-2 text-left text-[11px] leading-snug text-slate-600 transition-colors duration-150 hover:border-primary/25 sm:min-h-[11rem] sm:p-2.5 ${dayCellTone(d, availability, planned)}`}
          >
            <span className="pointer-events-none absolute bottom-2 left-2 text-[10px] font-semibold text-slate-400">{d.getDate()}</span>
          </button>
        ))}
      </div>
    </div>
  );
});

const DayAgendaView = memo(function DayAgendaView({
  day,
  availability,
  onDayDoubleClick,
}: {
  day: Date;
  availability: Set<string>;
  onDayDoubleClick?: (d: Date) => void;
}) {
  const ds = toLocalDateStr(day);

  return (
    <div
      className="rounded-2xl border border-slate-200/90 bg-white p-4"
      onDoubleClick={() => onDayDoubleClick?.(day)}
    >
      <p className="text-sm font-semibold text-slate-900">
        {day.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
      </p>
      <p className="mt-1 text-xs text-slate-400">Double-click to view events and meeting requests for this day.</p>
      <div className="mt-4 max-h-[min(28rem,55vh)] space-y-1 overflow-y-auto">
        {Array.from({ length: SLOTS_PER_DAY }).map((_, slotIndex) => {
          const open = availability.has(dateSlotKey(ds, slotIndex));
          return (
            <div
              key={slotIndex}
              className={`flex items-start gap-3 rounded-xl border px-3 py-2 text-sm ${
                open ? "border-emerald-200/80 bg-emerald-50/50" : "border-slate-100 bg-slate-50/40"
              }`}
            >
              <span className="w-16 shrink-0 text-xs font-medium text-slate-500">{slotLabel(slotIndex)}</span>
              <span className="text-xs text-slate-600">{open ? "Available" : "Unavailable"}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
});

function EventDaySheet({
  day,
  open,
  onClose,
  planned,
  inquiries,
  onOpenInquiry,
}: {
  day: Date | null;
  open: boolean;
  onClose: () => void;
  planned: PlannedEvent[];
  inquiries: PartnerInquiry[];
  onOpenInquiry: (row: PartnerInquiry) => void;
}) {
  if (!open || !day) return null;
  const dayEvents = planned.filter((e) => sameLocalDay(new Date(e.start), day));
  const dayInquiries = inquiries.filter((r) => sameLocalDay(new Date(r.proposedStart), day));

  return (
    <>
      <button type="button" aria-label="Close" className="fixed inset-0 z-40 bg-slate-900/25 backdrop-blur-[1px]" onClick={onClose} />
      <aside className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">This day</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">
              {day.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
            </p>
          </div>
          <Button type="button" variant="ghost" className="shrink-0 rounded-full" onClick={onClose}>
            Close
          </Button>
        </div>
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">Planned events</p>
            {dayEvents.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">No events on this day.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {dayEvents.map((e) => (
                  <li key={e.id} className="rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2 text-sm text-slate-800">
                    <span className="font-semibold text-slate-900">{e.title}</span>
                    <span className="text-slate-500"> · {formatRangeLabel(e.start, e.end)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">Partner inquiries</p>
            {dayInquiries.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">No meeting requests on this day.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {dayInquiries.map((row) => (
                  <li key={row.id} className="flex flex-col gap-2 rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-3 text-sm">
                    <div>
                      <p className="font-semibold text-slate-900">{row.name}</p>
                      <p className="text-xs text-slate-500">{row.email}</p>
                      <p className="mt-1 text-xs text-slate-600">{formatRangeLabel(row.proposedStart, row.proposedEnd)}</p>
                    </div>
                    {row.status === "pending" ? (
                      <Button type="button" variant="outline" className="w-fit rounded-full text-xs" onClick={() => onOpenInquiry(row)}>
                        Review
                      </Button>
                    ) : (
                      <p className="text-xs capitalize text-slate-500">Status: {row.status}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}

function clearAvailabilityForWeek(weekMonday: Date) {
  const set = readAvailabilityDateSet();
  const days = weekDatesFromMonday(weekMonday);
  days.forEach((d) => {
    const ds = toLocalDateStr(d);
    for (let s = 0; s < SLOTS_PER_DAY; s += 1) {
      set.delete(dateSlotKey(ds, s));
    }
  });
  writeAvailabilityDateSet(set);
}

function AvailabilityEditor() {
  const { showToast } = useAppUi();
  const [dragMode, setDragMode] = useState<"add" | "remove" | null>(null);
  const [weekMonday, setWeekMonday] = useState(() => startOfWeekMonday(new Date()));
  const [slots, setSlots] = useState<Set<string>>(() => readAvailabilityDateSet());

  const weekDays = useMemo(() => weekDatesFromMonday(weekMonday), [weekMonday]);

  const syncFromStorage = useCallback(() => {
    setSlots(readAvailabilityDateSet());
  }, []);

  useEffect(() => {
    const on = () => syncFromStorage();
    window.addEventListener("storage", on);
    return () => {
      window.removeEventListener("storage", on);
    };
  }, [syncFromStorage]);

  const apply = (key: string, mode: "add" | "remove") => {
    setSlots((cur) => {
      const next = new Set(cur);
      if (mode === "add") next.add(key);
      else next.delete(key);
      writeAvailabilityDateSet(next);
      return next;
    });
  };

  const goPrevWeek = () => {
    const x = new Date(weekMonday);
    x.setDate(x.getDate() - 7);
    setWeekMonday(x);
  };

  const goNextWeek = () => {
    const x = new Date(weekMonday);
    x.setDate(x.getDate() + 7);
    setWeekMonday(x);
  };

  const goThisWeek = () => {
    setWeekMonday(startOfWeekMonday(new Date()));
  };

  return (
    <div className="w-full min-w-0 space-y-4">
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-slate-50/50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">Editing week</p>
          <p className="mt-1 text-sm font-semibold text-slate-900">{formatWeekRangeLabel(weekMonday)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" className="rounded-full" onClick={goPrevWeek}>
            Previous week
          </Button>
          <Button type="button" variant="outline" className="rounded-full" onClick={goThisWeek}>
            This week
          </Button>
          <Button type="button" variant="outline" className="rounded-full" onClick={goNextWeek}>
            Next week
          </Button>
        </div>
      </div>
      <div
        className="flex h-[min(72vh,820px)] min-h-[26rem] w-full max-w-full flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-slate-50/50 p-2 sm:p-3"
        onMouseLeave={() => setDragMode(null)}
        onMouseUp={() => setDragMode(null)}
      >
        <div className="grid min-h-0 w-full flex-1 grid-cols-[minmax(3.25rem,4.75rem)_repeat(7,minmax(0,1fr))] grid-rows-[auto_repeat(20,minmax(0,1fr))] gap-x-0.5 gap-y-px sm:gap-x-1 sm:gap-y-0.5">
          <div className="min-w-0" />
          {weekDays.map((d) => (
            <div
              key={toLocalDateStr(d)}
              className="flex min-w-0 flex-col items-center justify-center py-2 text-center text-[10px] font-bold uppercase leading-tight tracking-wide text-slate-500 sm:text-[11px]"
            >
              <span>{WEEKDAY_LABELS[mondayBasedDayIndex(d)]}</span>
              <span className="mt-0.5 text-[9px] font-semibold tabular-nums text-slate-400 sm:text-[10px]">
                {d.getMonth() + 1}/{d.getDate()}
              </span>
            </div>
          ))}
          {Array.from({ length: SLOTS_PER_DAY }).map((_, slotIndex) => (
            <Fragment key={slotIndex}>
              <div className="flex min-h-0 min-w-0 items-center justify-end pr-1 text-[10px] font-medium tabular-nums text-slate-400 sm:text-xs">
                {slotLabel(slotIndex)}
              </div>
              {weekDays.map((day) => {
                const ds = toLocalDateStr(day);
                const key = dateSlotKey(ds, slotIndex);
                const active = slots.has(key);
                return (
                  <button
                    key={key}
                    type="button"
                    onMouseDown={() => {
                      const mode = active ? "remove" : "add";
                      setDragMode(mode);
                      apply(key, mode);
                    }}
                    onMouseEnter={() => {
                      if (dragMode) apply(key, dragMode);
                    }}
                    onMouseUp={() => setDragMode(null)}
                    className={`min-h-0 w-full min-w-0 rounded-md border text-[0] transition sm:rounded-lg ${
                      active
                        ? "border-emerald-500/80 bg-emerald-300/85 shadow-[inset_0_0_0_1px_rgba(5,150,105,0.25)]"
                        : "border-slate-200/80 bg-white hover:border-primary/35 hover:bg-primary/[0.07]"
                    }`}
                  >
                    <span className="sr-only">Toggle availability</span>
                  </button>
                );
              })}
            </Fragment>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          className="rounded-full"
          onClick={() => {
            clearAvailabilityForWeek(weekMonday);
            syncFromStorage();
            showToast("Cleared availability for this week.");
          }}
        >
          Clear this week
        </Button>
        <Button
          type="button"
          variant="outline"
          className="rounded-full"
          onClick={() => {
            writeAvailabilityDateSet(new Set());
            writeAvailabilitySet(new Set());
            syncFromStorage();
            showToast("All availability removed.");
          }}
        >
          Clear all weeks
        </Button>
      </div>
    </div>
  );
}

function shiftCalendarAnchor(anchor: Date, mode: CalendarMode, delta: -1 | 1) {
  const x = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate(), 12, 0, 0, 0);
  if (mode === "day") x.setDate(x.getDate() + delta);
  else if (mode === "week") x.setDate(x.getDate() + delta * 7);
  else x.setMonth(x.getMonth() + delta);
  return x;
}

function calendarNavLabel(anchor: Date, mode: CalendarMode) {
  if (mode === "day") {
    return anchor.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  }
  if (mode === "week") {
    return formatWeekRangeLabel(startOfWeekMonday(anchor));
  }
  return anchor.toLocaleString(undefined, { month: "long", year: "numeric" });
}

export function AdminEventsClient({ tabId }: { tabId: "events" | "availability" }) {
  const { showToast } = useAppUi();
  const [tick, setTick] = useState(0);
  const [detail, setDetail] = useState<PartnerInquiry | null>(null);
  const [eventSheetDay, setEventSheetDay] = useState<Date | null>(null);
  const [monthAnchor] = useState(() => new Date());
  const [calMode, setCalMode] = useState<CalendarMode>("week");
  const [calAnchor, setCalAnchor] = useState(() => {
    const t = new Date();
    t.setHours(12, 0, 0, 0);
    return t;
  });

  const bump = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    const on = () => bump();
    window.addEventListener(ADMIN_UI_EVENT, on);
    window.addEventListener("storage", on);
    return () => {
      window.removeEventListener(ADMIN_UI_EVENT, on);
      window.removeEventListener("storage", on);
    };
  }, [bump]);

  const { availability, inquiries, planned, kpis } = useMemo(() => {
    const inq = readPartnerInquiries();
    return {
      availability: readAvailabilityDateSet(),
      inquiries: inq,
      planned: readPlannedEvents(),
      kpis: eventKpis(monthAnchor),
    };
  }, [tick, monthAnchor]);

  const refresh = useCallback(() => {
    bump();
    showToast("Refreshed.");
  }, [bump, showToast]);

  const shellActions = useMemo(() => [{ label: "Refresh", variant: "outline" as const, onClick: refresh }], [refresh]);

  const weekMondayForGrid = useMemo(() => startOfWeekMonday(calAnchor), [calAnchor]);
  const monthDisplayAnchor = useMemo(() => new Date(calAnchor.getFullYear(), calAnchor.getMonth(), 1), [calAnchor]);

  const calPrev = useCallback(() => setCalAnchor((a) => shiftCalendarAnchor(a, calMode, -1)), [calMode]);
  const calNext = useCallback(() => setCalAnchor((a) => shiftCalendarAnchor(a, calMode, 1)), [calMode]);
  const calToday = useCallback(() => {
    const t = new Date();
    t.setHours(12, 0, 0, 0);
    setCalAnchor(t);
  }, []);

  const openDaySheet = useCallback((d: Date) => {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0, 0);
    setEventSheetDay(x);
  }, []);

  const handleCalModeChange = useCallback((id: string) => {
    setCalMode(id as CalendarMode);
  }, []);

  const goTodayCalendar = useCallback(() => {
    calToday();
    setCalMode("day");
  }, [calToday]);

  const goThisWeekCalendar = useCallback(() => {
    calToday();
    setCalMode("week");
  }, [calToday]);

  const goThisMonthCalendar = useCallback(() => {
    const t = new Date();
    t.setDate(1);
    t.setHours(12, 0, 0, 0);
    setCalAnchor(t);
    setCalMode("month");
  }, []);

  return (
    <ManagerSectionShell title="Events" actions={shellActions}>
      <div className="space-y-5">
        <TabNav items={tabs} activeId={tabId} />

        {tabId === "availability" ? (
          <AvailabilityEditor />
        ) : (
          <>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <button
                type="button"
                onClick={goTodayCalendar}
                className={`rounded-2xl border px-4 py-3 text-left transition-[border-color,background-color] duration-150 ease-out hover:border-primary/30 hover:bg-white ${
                  calMode === "day" ? "border-primary/30 bg-white ring-1 ring-primary/15" : "border-slate-100 bg-slate-50/60"
                }`}
              >
                <p className="text-2xl font-semibold tabular-nums text-slate-900">{kpis.today}</p>
                <p className="mt-0.5 text-xs font-medium text-slate-500">Today · day view</p>
              </button>
              <button
                type="button"
                onClick={goThisWeekCalendar}
                className={`rounded-2xl border px-4 py-3 text-left transition-[border-color,background-color] duration-150 ease-out hover:border-primary/30 hover:bg-white ${
                  calMode === "week" ? "border-primary/30 bg-white ring-1 ring-primary/15" : "border-slate-100 bg-slate-50/60"
                }`}
              >
                <p className="text-2xl font-semibold tabular-nums text-slate-900">{kpis.week}</p>
                <p className="mt-0.5 text-xs font-medium text-slate-500">This week · week view</p>
              </button>
              <button
                type="button"
                onClick={goThisMonthCalendar}
                className={`rounded-2xl border px-4 py-3 text-left transition-[border-color,background-color] duration-150 ease-out hover:border-primary/30 hover:bg-white ${
                  calMode === "month" ? "border-primary/30 bg-white ring-1 ring-primary/15" : "border-slate-100 bg-slate-50/60"
                }`}
              >
                <p className="text-2xl font-semibold tabular-nums text-slate-900">{kpis.month}</p>
                <p className="mt-0.5 text-xs font-medium text-slate-500">This month · month view</p>
              </button>
              <div className="rounded-2xl border border-slate-100 bg-slate-50/60 px-4 py-3">
                <p className="text-2xl font-semibold tabular-nums text-slate-900">{kpis.total}</p>
                <p className="mt-0.5 text-xs font-medium text-slate-500">Total booked</p>
              </div>
            </div>

            <section id="events-calendar" className="scroll-mt-28 space-y-4 pt-2">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Calendar</p>
                  <h2 className="mt-1 text-lg font-semibold text-slate-900">Availability</h2>
                  <p className="mt-1 text-sm text-slate-600">Double-click a day to see events and meeting requests.</p>
                </div>
                <SegmentedThree
                  value={calMode}
                  onChange={handleCalModeChange}
                  first={{ id: "day", label: "Day" }}
                  second={{ id: "week", label: "Week" }}
                  third={{ id: "month", label: "Month" }}
                />
              </div>

              <div className="flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-slate-50/40 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm font-semibold text-slate-900">{calendarNavLabel(calAnchor, calMode)}</p>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" className="rounded-full" onClick={calPrev}>
                    Back
                  </Button>
                  <Button type="button" variant="outline" className="rounded-full" onClick={calToday}>
                    Today
                  </Button>
                  <Button type="button" variant="outline" className="rounded-full" onClick={calNext}>
                    Forward
                  </Button>
                </div>
              </div>

              {calMode === "day" ? (
                <DayAgendaView day={calAnchor} availability={availability} onDayDoubleClick={openDaySheet} />
              ) : null}

              {calMode === "week" ? (
                <EventsWeekGrid
                  weekMonday={weekMondayForGrid}
                  availability={availability}
                  planned={planned}
                  onDayDoubleClick={openDaySheet}
                />
              ) : null}

              {calMode === "month" ? (
                <MonthGrid
                  anchor={monthDisplayAnchor}
                  availability={availability}
                  events={planned}
                  onDayDoubleClick={openDaySheet}
                />
              ) : null}
            </section>
          </>
        )}
      </div>

      <EventDaySheet
        day={eventSheetDay}
        open={Boolean(eventSheetDay)}
        onClose={() => setEventSheetDay(null)}
        planned={planned}
        inquiries={inquiries}
        onOpenInquiry={(row) => {
          setEventSheetDay(null);
          setDetail(row);
        }}
      />

      <InquiryDetailSheet
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        row={detail}
        onChanged={bump}
        showToast={showToast}
      />
    </ManagerSectionShell>
  );
}
