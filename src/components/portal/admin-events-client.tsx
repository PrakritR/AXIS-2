"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { TabNav, type TabItem } from "@/components/ui/tabs";
import { ManagerSectionShell } from "@/components/portal/manager-section-shell";
import { PORTAL_CALENDAR_FRAME, PortalSegmentedControl } from "@/components/portal/portal-metrics";
import { useAppUi } from "@/components/providers/app-ui-provider";
import {
  acceptPartnerInquiry,
  dateHasAvailability,
  dateSlotKey,
  declinePartnerInquiry,
  deletePlannedEvent,
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

function PartnerInquiryDetailPanel({
  row,
  instructionsDraft,
  onInstructionsChange,
  onClose,
  onChanged,
  showToast,
}: {
  row: PartnerInquiry;
  instructionsDraft: string;
  onInstructionsChange: (v: string) => void;
  onClose: () => void;
  onChanged: () => void;
  showToast: (m: string) => void;
}) {
  const onAccept = () => {
    if (acceptPartnerInquiry(row.id, { instructions: instructionsDraft })) {
      showToast("Scheduled — partner emailed (demo: sessionStorage axis_demo_outbound_mail_v1).");
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
    <div className="border-t border-slate-200/90 bg-slate-50/50 px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">Partner</p>
          <p className="mt-0.5 text-base font-semibold text-slate-900">{row.name}</p>
          <p className="text-sm text-slate-600">{row.email}</p>
        </div>
        <Button type="button" variant="ghost" className="shrink-0 rounded-full px-3 py-1.5 text-xs text-slate-600" onClick={onClose}>
          Close
        </Button>
      </div>
      <dl className="mt-3 grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Time</dt>
          <dd className="mt-0.5 font-medium text-slate-900">{formatRangeLabel(row.proposedStart, row.proposedEnd)}</dd>
        </div>
        {row.phone ? (
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Phone</dt>
            <dd className="mt-0.5">{row.phone}</dd>
          </div>
        ) : null}
        <div className="sm:col-span-2">
          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">Their notes</dt>
          <dd className="mt-0.5 whitespace-pre-wrap">{row.notes?.trim() ? row.notes : "—"}</dd>
        </div>
      </dl>
      {row.status === "pending" ? (
        <div className="mt-4 space-y-2">
          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500" htmlFor="inquiry-host-msg">
            Message for partner (optional)
          </label>
          <Textarea
            id="inquiry-host-msg"
            rows={3}
            value={instructionsDraft}
            onChange={(e) => onInstructionsChange(e.target.value)}
            placeholder="Zoom link, dial-in, parking, agenda…"
            className="min-h-[5rem] rounded-xl border-slate-200 bg-white text-sm"
          />
          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              className="rounded-full !border-0 !bg-emerald-600 !text-white hover:!bg-emerald-700"
              onClick={onAccept}
            >
              Accept & schedule
            </Button>
            <Button
              type="button"
              variant="outline"
              className="rounded-full border-rose-300 bg-white text-rose-800 hover:bg-rose-50"
              onClick={onDecline}
            >
              Decline
            </Button>
          </div>
        </div>
      ) : (
        <p className="mt-3 text-xs font-medium capitalize text-slate-500">Status: {row.status}</p>
      )}
    </div>
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
    <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-white p-3 shadow-sm">
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
    <div className={PORTAL_CALENDAR_FRAME}>
      <div className="grid grid-cols-[repeat(7,minmax(0,1fr))] gap-px bg-slate-200">
        {days.map((d) => (
          <div
            key={toLocalDateStr(d)}
            className="bg-slate-50 px-2 py-3 text-center sm:px-3"
          >
            <p className="text-sm font-semibold text-slate-900">{WEEKDAY_LABELS[mondayBasedDayIndex(d)]}</p>
            <p className="text-xs text-slate-500">{d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}</p>
          </div>
        ))}
      </div>
      <div className="grid min-h-0 w-full flex-1 grid-cols-7 gap-px overflow-y-auto overscroll-contain bg-slate-200">
        {days.map((d) => (
          <div
            key={toLocalDateStr(d)}
            className={`min-h-[min(18rem,50vh)] border-t border-slate-200/80 bg-white p-2 text-left text-[11px] leading-snug text-slate-600 sm:min-h-[20rem] sm:p-2.5 ${dayCellTone(d, availability, planned)}`}
          >
            {planned
              .filter((e) => {
                const t = new Date(e.start);
                return t.toDateString() === d.toDateString();
              })
              .map((e) => (
                <div
                  key={e.id}
                  className="mb-2 rounded-2xl border border-primary/20 bg-primary/[0.08] px-2 py-1.5 text-sm font-semibold text-primary shadow-sm"
                >
                  {e.title}
                </div>
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
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[24px] border border-slate-200 bg-white p-3 sm:p-4">
      <p className="shrink-0 text-sm font-semibold text-slate-900">
        {day.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
      </p>
      <div className="mt-2 min-h-0 flex-1 space-y-0.5 overflow-y-auto overscroll-contain">
        {Array.from({ length: SLOTS_PER_DAY }).map((_, slotIndex) => {
          const open = availability.has(dateSlotKey(ds, slotIndex));
          return (
            <div
              key={slotIndex}
              className={`flex items-center gap-2 rounded-lg border px-2 py-1 text-xs ${
                open ? "border-emerald-200/80 bg-emerald-50/50" : "border-slate-100 bg-slate-50/40"
              }`}
            >
              <span className="w-14 shrink-0 font-medium tabular-nums text-slate-500">{slotLabel(slotIndex)}</span>
              <span className="text-slate-600">{open ? "Open" : "—"}</span>
            </div>
          );
        })}
      </div>
      {dayEvents.length ? (
        <div className="mt-4 shrink-0 border-t border-slate-100 pt-4">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">Events</p>
          <ul className="mt-2 space-y-2">
            {dayEvents.map((e) => (
              <li key={e.id} className="text-sm font-medium text-slate-800">
                {e.title} · {formatRangeLabel(e.start, e.end)}
                {e.instructions ? (
                  <span className="mt-0.5 block text-xs font-normal text-slate-500">{e.instructions}</span>
                ) : null}
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
      <p className="text-sm text-slate-600">Paint half-hour cells for the week. Partners can only book inside green slots.</p>
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
        <div className="grid min-h-0 w-full flex-1 grid-cols-[minmax(3.25rem,4.75rem)_repeat(7,minmax(0,1fr))] grid-rows-[auto_repeat(24,minmax(0,1fr))] gap-x-0.5 gap-y-px sm:gap-x-1 sm:gap-y-0.5">
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
  const [inquiryInstructionsDraft, setInquiryInstructionsDraft] = useState("");
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const [monthAnchor] = useState(() => new Date());
  const [viewMode, setViewMode] = useState<CalendarMode>("week");
  const [calAnchor, setCalAnchor] = useState(() => {
    const t = new Date();
    t.setHours(12, 0, 0, 0);
    return t;
  });

  const bump = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    setInquiryInstructionsDraft("");
  }, [detail?.id]);

  useEffect(() => {
    const on = () => bump();
    window.addEventListener(ADMIN_UI_EVENT, on);
    window.addEventListener("storage", on);
    return () => {
      window.removeEventListener(ADMIN_UI_EVENT, on);
      window.removeEventListener("storage", on);
    };
  }, [bump]);

  const { availability, planned, kpis, pendingRows } = useMemo(() => {
    const inq = readPartnerInquiries();
    return {
      availability: readAvailabilityDateSet(),
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

  const calPrev = () => {
    setCalAnchor((a) => shiftCalendarAnchor(a, viewMode, -1));
  };
  const calNext = () => {
    setCalAnchor((a) => shiftCalendarAnchor(a, viewMode, 1));
  };
  const calToday = () => {
    const t = new Date();
    t.setHours(12, 0, 0, 0);
    setCalAnchor(t);
  };

  return (
    <ManagerSectionShell title="Events" actions={shellActions} bodyClassName="mt-4 lg:mt-5">
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <TabNav items={tabs} activeId={tabId} />

        {tabId === "availability" ? (
          <AvailabilityEditor />
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-3 lg:max-h-[calc(100dvh-9rem)] lg:gap-4">
            <div className="grid shrink-0 grid-cols-2 gap-2 sm:grid-cols-4">
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
                  className={`rounded-xl border px-3 py-2.5 sm:px-4 sm:py-3 ${
                    i === 2 ? "border-primary/25 bg-white shadow-[0_8px_28px_-12px_rgba(15,23,42,0.14)]" : "border-slate-100 bg-slate-50/60"
                  }`}
                >
                  <p className="text-xl font-semibold tabular-nums text-slate-900 sm:text-2xl">{value}</p>
                  <p className="mt-0.5 text-[11px] font-medium text-slate-500 sm:text-xs">{label}</p>
                </div>
              ))}
            </div>

            <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:min-h-0 lg:grid-cols-12 lg:gap-5 lg:overflow-hidden">
              {/* Lists: scroll independently on small screens; fixed column on large */}
              <div className="flex min-h-0 flex-col gap-3 lg:col-span-5 lg:max-h-full lg:overflow-hidden">
                <div className="flex min-h-0 max-h-[40vh] flex-col rounded-2xl border border-slate-200/90 bg-white lg:max-h-[min(220px,32vh)]">
                  <p className="shrink-0 border-b border-slate-100 px-3 py-2 text-xs font-bold uppercase tracking-[0.14em] text-slate-400 sm:px-4">
                    Planned events
                  </p>
                  <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-1 py-2 sm:px-2">
                    {planned.length === 0 ? (
                      <p className="px-2 py-1 text-sm text-slate-500">No meetings yet.</p>
                    ) : (
                      <ul className="divide-y divide-slate-100 text-sm">
                        {planned.map((e) => (
                          <Fragment key={e.id}>
                            <li className="flex flex-wrap items-center justify-between gap-2 px-2 py-2 sm:px-3">
                              <div className="min-w-0 flex-1">
                                <span className="font-semibold text-slate-900">{e.title}</span>
                                <span className="text-slate-500"> · {formatRangeLabel(e.start, e.end)}</span>
                              </div>
                              <div className="flex shrink-0 flex-wrap gap-1.5">
                                <Button
                                  type="button"
                                  variant="outline"
                                  className="rounded-full border-slate-200 px-2.5 py-1 text-xs"
                                  onClick={() => setExpandedEventId((id) => (id === e.id ? null : e.id))}
                                >
                                  {expandedEventId === e.id ? "Hide" : "Details"}
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  className="rounded-full !border-0 !bg-rose-600 px-2.5 py-1 text-xs !text-white hover:!bg-rose-700"
                                  onClick={() => {
                                    if (deletePlannedEvent(e.id)) {
                                      showToast("Event removed.");
                                      setExpandedEventId((id) => (id === e.id ? null : id));
                                      bump();
                                    } else showToast("Could not delete.");
                                  }}
                                >
                                  Delete
                                </Button>
                              </div>
                            </li>
                            {expandedEventId === e.id ? (
                              <li className="bg-slate-50/80 px-2 py-2 text-xs text-slate-600 sm:px-3">
                                <p>
                                  <span className="font-semibold text-slate-500">When: </span>
                                  {formatRangeLabel(e.start, e.end)}
                                </p>
                                {e.instructions ? (
                                  <p className="mt-2 whitespace-pre-wrap">
                                    <span className="font-semibold text-slate-500">Host message: </span>
                                    {e.instructions}
                                  </p>
                                ) : (
                                  <p className="mt-2 text-slate-400">No host message stored.</p>
                                )}
                                {e.sourceInquiryId ? (
                                  <p className="mt-2 font-mono text-[10px] text-slate-400">Inquiry ref: {e.sourceInquiryId}</p>
                                ) : null}
                              </li>
                            ) : null}
                          </Fragment>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>

                <div className="flex min-h-[12rem] flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white lg:min-h-0">
                  <p className="shrink-0 border-b border-slate-100 px-3 py-2 text-xs font-bold uppercase tracking-[0.14em] text-slate-400 sm:px-4">
                    Partner inquiries
                  </p>
                  <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                    {pendingRows.length === 0 ? (
                      <div className="px-4 py-6 text-center text-sm text-slate-500">No pending requests.</div>
                    ) : (
                      <>
                        <div className="overflow-x-auto">
                          <table className="w-full min-w-[520px] border-collapse text-left text-sm">
                            <thead>
                              <tr className="sticky top-0 z-[1] border-b border-slate-200/90 bg-white">
                                <th className="px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400 sm:px-4 sm:text-xs">
                                  Partner
                                </th>
                                <th className="px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400 sm:px-4 sm:text-xs">
                                  Email
                                </th>
                                <th className="px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400 sm:px-4 sm:text-xs">
                                  Window
                                </th>
                                <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400 sm:px-4 sm:text-xs">
                                  Actions
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {pendingRows.map((row) => (
                                <tr
                                  key={row.id}
                                  className={`border-b border-slate-100 last:border-0 ${detail?.id === row.id ? "bg-primary/[0.04]" : ""}`}
                                >
                                  <td className="px-3 py-2.5 font-semibold text-slate-900 sm:px-4">{row.name}</td>
                                  <td className="max-w-[8rem] truncate px-3 py-2.5 text-slate-600 sm:px-4">{row.email}</td>
                                  <td className="px-3 py-2.5 text-slate-600 sm:px-4">{formatRangeLabel(row.proposedStart, row.proposedEnd)}</td>
                                  <td className="px-3 py-2.5 text-right sm:px-4">
                                    <Button
                                      type="button"
                                      variant="outline"
                                      className={`rounded-full border-slate-200 px-3 py-1.5 text-xs font-medium ${
                                        detail?.id === row.id ? "border-primary/40 bg-primary/10 text-primary" : "text-slate-800"
                                      }`}
                                      onClick={() => setDetail((cur) => (cur?.id === row.id ? null : row))}
                                    >
                                      {detail?.id === row.id ? "Hide" : "Details"}
                                    </Button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        {detail ? (
                          <PartnerInquiryDetailPanel
                            row={detail}
                            instructionsDraft={inquiryInstructionsDraft}
                            onInstructionsChange={setInquiryInstructionsDraft}
                            onClose={() => setDetail(null)}
                            onChanged={bump}
                            showToast={showToast}
                          />
                        ) : null}
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Calendar: primary column — fills remaining viewport height on lg */}
              <section
                id="events-calendar"
                className="flex min-h-[min(28rem,55vh)] flex-col gap-2 lg:col-span-7 lg:min-h-0 lg:max-h-full lg:overflow-hidden"
              >
                <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Calendar</p>
                    <p className="mt-1 text-xl font-semibold text-slate-950">{calendarNavLabel(calAnchor, viewMode)}</p>
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
                </div>

                <div className="flex shrink-0 flex-col gap-2 rounded-xl border border-slate-200/80 bg-slate-50/50 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:px-4">
                  <p className="text-sm font-medium text-slate-600">Navigate</p>
                  <div className="flex flex-wrap gap-1.5 sm:gap-2">
                    <Button type="button" variant="outline" className="rounded-full px-3 py-1.5 text-xs sm:text-sm" onClick={calPrev}>
                      Back
                    </Button>
                    <Button type="button" variant="outline" className="rounded-full px-3 py-1.5 text-xs sm:text-sm" onClick={calToday}>
                      Today
                    </Button>
                    <Button type="button" variant="outline" className="rounded-full px-3 py-1.5 text-xs sm:text-sm" onClick={calNext}>
                      Forward
                    </Button>
                  </div>
                </div>

                <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:min-h-[12rem]">
                  {viewMode === "day" ? (
                    <DayAgendaView day={calAnchor} availability={availability} planned={planned} />
                  ) : null}

                  {viewMode === "week" ? (
                    <EventsWeekGrid weekMonday={weekMondayForGrid} availability={availability} planned={planned} />
                  ) : null}

                  {viewMode === "month" ? (
                    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                      <MonthGrid
                        anchor={monthDisplayAnchor}
                        availability={availability}
                        events={planned}
                        onDayClick={(d) => {
                          setViewMode("day");
                          const x = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0, 0);
                          setCalAnchor(x);
                        }}
                      />
                    </div>
                  ) : null}
                </div>
              </section>
            </div>
          </div>
        )}
      </div>
    </ManagerSectionShell>
  );
}
