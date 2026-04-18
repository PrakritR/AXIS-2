"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
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

function MonthGrid({
  anchor,
  availability,
  events,
  onDayClick,
}: {
  anchor: Date;
  availability: Set<string>;
  events: PlannedEvent[];
  onDayClick?: (d: Date) => void;
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
              onClick={() => onDayClick?.(d)}
              className={`flex aspect-square flex-col items-center justify-center rounded-xl border text-sm font-semibold text-slate-800 transition hover:border-primary/30 ${dayCellTone(d, availability, events)}`}
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
}

function EventsWeekGrid({
  weekMonday,
  availability,
  planned,
}: {
  weekMonday: Date;
  availability: Set<string>;
  planned: PlannedEvent[];
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
          <div
            key={toLocalDateStr(d)}
            className={`min-h-[10rem] rounded-xl border p-2 text-left text-[11px] leading-snug text-slate-600 sm:min-h-[11rem] sm:p-2.5 ${dayCellTone(d, availability, planned)}`}
          >
              {planned
                .filter((e) => {
                  const t = new Date(e.start);
                  return t.toDateString() === d.toDateString();
                })
                .map((e) => (
                  <p key={e.id} className="mb-1 font-medium text-slate-900">
                    {e.title}
                  </p>
                ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function DayAgendaView({
  day,
  availability,
  planned,
}: {
  day: Date;
  availability: Set<string>;
  planned: PlannedEvent[];
}) {
  const ds = toLocalDateStr(day);
  const dayEvents = planned.filter((e) => new Date(e.start).toDateString() === day.toDateString());

  return (
    <div className="rounded-2xl border border-slate-200/90 bg-white p-4">
      <p className="text-sm font-semibold text-slate-900">
        {day.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
      </p>
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
      {dayEvents.length ? (
        <div className="mt-4 border-t border-slate-100 pt-4">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">Events</p>
          <ul className="mt-2 space-y-2">
            {dayEvents.map((e) => (
              <li key={e.id} className="text-sm font-medium text-slate-800">
                {e.title} · {formatRangeLabel(e.start, e.end)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
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
      <p className="text-sm text-slate-600">
        Availability is saved per calendar week. Choose a future week to block time off or open partner-call windows.
        Partners only match slots that fall inside a painted half-hour on the specific date they book.
      </p>
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

  const { availability, inquiries, planned, kpis, pendingRows } = useMemo(() => {
    const inq = readPartnerInquiries();
    return {
      availability: readAvailabilityDateSet(),
      inquiries: inq,
      planned: readPlannedEvents(),
      kpis: eventKpis(monthAnchor),
      pendingRows: inq.filter((r) => r.status === "pending"),
    };
  }, [tick, monthAnchor]);

  const refresh = () => {
    bump();
    showToast("Refreshed.");
  };

  const shellActions = [
    { label: "Refresh", variant: "outline" as const, onClick: refresh },
  ];

  const weekMondayForGrid = useMemo(() => startOfWeekMonday(calAnchor), [calAnchor]);
  const monthDisplayAnchor = useMemo(() => new Date(calAnchor.getFullYear(), calAnchor.getMonth(), 1), [calAnchor]);

  const calPrev = () => setCalAnchor((a) => shiftCalendarAnchor(a, calMode, -1));
  const calNext = () => setCalAnchor((a) => shiftCalendarAnchor(a, calMode, 1));
  const calToday = () => {
    const t = new Date();
    t.setHours(12, 0, 0, 0);
    setCalAnchor(t);
  };

  return (
    <ManagerSectionShell title="Events" actions={shellActions}>
      <div className="space-y-5">
        <TabNav items={tabs} activeId={tabId} />

        {tabId === "availability" ? (
          <AvailabilityEditor />
        ) : (
          <>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {(
                [
                  ["Today", kpis.today],
                  ["This week", kpis.week],
                  ["This month", kpis.month],
                  ["Total booked", kpis.total],
                ] as const
              ).map(([label, value], i) => (
                <div
                  key={label}
                  className={`rounded-2xl border px-4 py-3 ${
                    i === 2 ? "border-primary/25 bg-white shadow-[0_8px_28px_-12px_rgba(15,23,42,0.14)]" : "border-slate-100 bg-slate-50/60"
                  }`}
                >
                  <p className="text-2xl font-semibold tabular-nums text-slate-900">{value}</p>
                  <p className="mt-0.5 text-xs font-medium text-slate-500">{label}</p>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <Link
                href="#events-calendar"
                className="text-sm font-semibold text-primary underline-offset-2 hover:underline"
              >
                Jump to calendar
              </Link>
              <p className="text-xs text-slate-500">Planned events and inquiries are above the calendar.</p>
            </div>

            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Planned events</p>
              {planned.length === 0 ? (
                <p className="mt-2 text-sm text-slate-500">Nothing scheduled yet. Accepted partner meetings appear here.</p>
              ) : (
                <ul className="mt-2 space-y-2 text-sm text-slate-700">
                  {planned.map((e) => (
                    <li key={e.id} className="rounded-xl border border-slate-100 bg-slate-50/50 px-3 py-2">
                      <span className="font-semibold text-slate-900">{e.title}</span>
                      <span className="text-slate-500"> · {formatRangeLabel(e.start, e.end)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Partner inquiries</p>
              <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200/90 bg-white">
                {pendingRows.length === 0 ? (
                  <div className="px-4 py-12 text-center text-sm text-slate-500">No pending meeting requests.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[640px] border-collapse text-left">
                      <thead>
                        <tr className="border-b border-slate-200/90 bg-white">
                          <th className="px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Partner</th>
                          <th className="px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Email</th>
                          <th className="px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Proposed window</th>
                          <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pendingRows.map((row) => (
                          <tr key={row.id} className="border-b border-slate-100 last:border-0">
                            <td className="px-5 py-4 font-semibold text-slate-900">{row.name}</td>
                            <td className="px-5 py-4 text-slate-600">{row.email}</td>
                            <td className="px-5 py-4 text-sm text-slate-600">{formatRangeLabel(row.proposedStart, row.proposedEnd)}</td>
                            <td className="px-5 py-4 text-right">
                              <Button
                                type="button"
                                variant="outline"
                                className="rounded-full border-slate-200 px-4 py-2 text-sm font-medium text-slate-800"
                                onClick={() => setDetail(row)}
                              >
                                Details
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            <section id="events-calendar" className="scroll-mt-28 space-y-4 pt-4">
              <div className="flex flex-col gap-3 border-t border-slate-200/80 pt-6 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Calendar</p>
                  <h2 className="mt-1 text-lg font-semibold text-slate-900">Availability and events</h2>
                  <p className="mt-1 text-sm text-slate-600">Switch day, week, or month. Use arrows to move in time.</p>
                </div>
                <SegmentedThree
                  value={calMode}
                  onChange={(id) => setCalMode(id as CalendarMode)}
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
                <DayAgendaView day={calAnchor} availability={availability} planned={planned} />
              ) : null}

              {calMode === "week" ? (
                <EventsWeekGrid weekMonday={weekMondayForGrid} availability={availability} planned={planned} />
              ) : null}

              {calMode === "month" ? (
                <MonthGrid
                  anchor={monthDisplayAnchor}
                  availability={availability}
                  events={planned}
                  onDayClick={(d) => {
                    setCalMode("day");
                    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0, 0);
                    setCalAnchor(x);
                  }}
                />
              ) : null}
            </section>
          </>
        )}
      </div>

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
