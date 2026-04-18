"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { TabNav, type TabItem } from "@/components/ui/tabs";
import { ManagerSectionShell } from "@/components/portal/manager-section-shell";
import { useAppUi } from "@/components/providers/app-ui-provider";
import {
  acceptPartnerInquiry,
  declinePartnerInquiry,
  eventKpis,
  formatRangeLabel,
  mondayBasedDayIndex,
  readAvailabilitySet,
  readPartnerInquiries,
  readPlannedEvents,
  slotKey,
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

function slotLabel(slotIndex: number) {
  const mins = 8 * 60 + slotIndex * 30;
  const h24 = Math.floor(mins / 60);
  const m = mins % 60;
  const d = new Date(2000, 0, 1, h24, m);
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function weekDates(anchor: Date) {
  const start = new Date(anchor);
  const dow = mondayBasedDayIndex(start);
  start.setDate(start.getDate() - dow);
  start.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

function dayCellTone(d: Date, availability: Set<string>, events: PlannedEvent[]) {
  const idx = mondayBasedDayIndex(d);
  const hasAvail = Array.from({ length: SLOTS_PER_DAY }).some((_, s) => availability.has(slotKey(idx, s)));
  const dayStart = new Date(d);
  dayStart.setHours(0, 0, 0, 0);
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
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">Partner inquiry</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">{row.name}</p>
            <p className="text-sm text-slate-500">{row.email}</p>
          </div>
          <Button type="button" variant="ghost" className="shrink-0 rounded-full" onClick={onClose}>
            Close
          </Button>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4 text-sm text-slate-700">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">Proposed time</p>
            <p className="mt-1 font-medium text-slate-900">{formatRangeLabel(row.proposedStart, row.proposedEnd)}</p>
          </div>
          {row.phone ? (
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">Phone</p>
              <p className="mt-1">{row.phone}</p>
            </div>
          ) : null}
          {row.notes ? (
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">Notes</p>
              <p className="mt-1 whitespace-pre-wrap">{row.notes}</p>
            </div>
          ) : null}
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">Status</p>
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
}: {
  anchor: Date;
  availability: Set<string>;
  events: PlannedEvent[];
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
            <div
              key={i}
              className={`flex aspect-square flex-col items-center justify-center rounded-xl border text-sm font-semibold text-slate-800 ${dayCellTone(d, availability, events)}`}
            >
              {d.getDate()}
            </div>
          ) : (
            <div key={i} className="aspect-square" />
          ),
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-emerald-200/90" /> Availability pattern
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-primary/25" /> Planned event
        </span>
      </div>
    </div>
  );
}

function AvailabilityEditor() {
  const { showToast } = useAppUi();
  const [dragMode, setDragMode] = useState<"add" | "remove" | null>(null);
  const [slots, setSlots] = useState<Set<string>>(() => readAvailabilitySet());

  const syncFromStorage = useCallback(() => {
    setSlots(readAvailabilitySet());
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
      writeAvailabilitySet(next);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        Click or drag across half-hour cells to mark when you are available for partner calls. Partner scheduling checks
        these windows on this device.
      </p>
      <div
        className="overflow-x-auto rounded-2xl border border-slate-200/90 bg-slate-50/50 p-3"
        onMouseLeave={() => setDragMode(null)}
        onMouseUp={() => setDragMode(null)}
      >
        <div className="inline-block min-w-[720px]">
          <div className="grid grid-cols-[4.5rem_repeat(7,minmax(0,1fr))] gap-1">
            <div />
            {WEEKDAY_LABELS.map((d) => (
              <div key={d} className="py-2 text-center text-[11px] font-bold uppercase tracking-wide text-slate-500">
                {d}
              </div>
            ))}
            {Array.from({ length: SLOTS_PER_DAY }).map((_, slotIndex) => (
              <Fragment key={slotIndex}>
                <div className="flex items-center pr-1 text-right text-[11px] font-medium text-slate-400">
                  {slotLabel(slotIndex)}
                </div>
                {WEEKDAY_LABELS.map((_, dayIndex) => {
                  const key = slotKey(dayIndex, slotIndex);
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
                      className={`h-7 rounded-lg border text-[0] transition ${
                        active
                          ? "border-emerald-400 bg-emerald-300/70"
                          : "border-white bg-white hover:border-primary/25 hover:bg-primary/[0.06]"
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
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          className="rounded-full"
          onClick={() => {
            writeAvailabilitySet(new Set());
            syncFromStorage();
            showToast("Availability cleared.");
          }}
        >
          Clear all
        </Button>
      </div>
    </div>
  );
}

export function AdminEventsClient({ tabId }: { tabId: "events" | "availability" }) {
  const { showToast } = useAppUi();
  const [tick, setTick] = useState(0);
  const [detail, setDetail] = useState<PartnerInquiry | null>(null);
  const [monthAnchor] = useState(() => new Date());

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
      availability: readAvailabilitySet(),
      inquiries: inq,
      planned: readPlannedEvents(),
      kpis: eventKpis(monthAnchor),
      pendingRows: inq.filter((r) => r.status === "pending"),
    };
  }, [tick, monthAnchor]);

  const week = useMemo(() => weekDates(new Date()), []);

  const refresh = () => {
    bump();
    showToast("Refreshed.");
  };

  const shellActions = [
    { label: "Refresh", variant: "outline" as const, onClick: refresh },
  ];

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

            <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
              <MonthGrid anchor={monthAnchor} availability={availability} events={planned} />
              <div className="rounded-2xl border border-slate-200/90 bg-white p-4">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">This week</p>
                <p className="mt-1 text-sm text-slate-600">
                  Availability (green) and accepted meetings (blue) use your recurring weekly pattern and confirmed
                  events.
                </p>
                <div className="mt-4 grid grid-cols-7 gap-1 text-center text-[10px] font-bold uppercase text-slate-400">
                  {week.map((d) => (
                    <div key={d.toISOString()} className="truncate px-0.5">
                      {WEEKDAY_LABELS[mondayBasedDayIndex(d)]}{" "}
                      <span className="font-semibold text-slate-600">{d.getDate()}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-2 grid min-h-[140px] grid-cols-7 gap-1">
                  {week.map((d) => (
                    <div
                      key={d.toISOString()}
                      className={`rounded-xl border p-1 text-left text-[11px] leading-snug text-slate-600 ${dayCellTone(d, availability, planned)}`}
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
                          <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">Partner</th>
                          <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">Email</th>
                          <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">Proposed window</th>
                          <th className="px-5 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">Actions</th>
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
