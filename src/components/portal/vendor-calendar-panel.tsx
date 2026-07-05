"use client";

import { useEffect, useMemo, useState } from "react";
import type { DemoManagerWorkOrderRow } from "@/data/demo-portal";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { ManagerPortalPageShell } from "@/components/portal/portal-metrics";
import { PortalCalendarPanels, MEETING_CONFIRMED_COLOR, type DemoMeeting } from "@/components/portal/portal-calendar-panels";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { readVendorWorkOrderRows, syncManagerWorkOrdersFromServer, MANAGER_WORK_ORDERS_EVENT } from "@/lib/manager-work-orders-storage";
import { SLOT_DURATION_MINUTES, toLocalDateStr } from "@/lib/demo-admin-scheduling";
import {
  WEEKDAY_DISPLAY_ORDER,
  WEEKDAY_LABELS,
  deleteVendorAvailabilityRule,
  fetchVendorAvailability,
  formatMinuteOfDayLabel,
  saveVendorBlockRule,
  saveVendorWeeklyRule,
  timeInputValueToMinuteOfDay,
  type VendorAvailabilityRule,
} from "@/lib/vendor-availability";

function propertyLabel(row: DemoManagerWorkOrderRow): string {
  const unit = row.unit?.trim();
  return unit && unit !== "—" ? `${row.propertyName} · ${unit}` : row.propertyName;
}

/** Work orders don't carry an explicit visit duration — assume an hour on-site. */
const VENDOR_VISIT_DEFAULT_DURATION_MINUTES = 60;

function vendorMeetingFromRow(row: DemoManagerWorkOrderRow): DemoMeeting | null {
  if (!row.scheduledAtIso) return null;
  const start = new Date(row.scheduledAtIso);
  if (Number.isNaN(start.getTime())) return null;
  const end = new Date(start.getTime() + VENDOR_VISIT_DEFAULT_DURATION_MINUTES * 60_000);
  return {
    id: `vendor-visit-${row.id}`,
    source: "external",
    sourceId: row.id,
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    dateStr: toLocalDateStr(start),
    startSlot: Math.max(0, Math.floor((start.getHours() * 60 + start.getMinutes()) / SLOT_DURATION_MINUTES)),
    span: Math.max(1, Math.ceil(VENDOR_VISIT_DEFAULT_DURATION_MINUTES / SLOT_DURATION_MINUTES)),
    durationMinutes: VENDOR_VISIT_DEFAULT_DURATION_MINUTES,
    title: row.title,
    color: MEETING_CONFIRMED_COLOR,
    statusLabel: "Scheduled",
    propertyTitle: propertyLabel(row),
    propertyId: row.propertyId,
    notes: row.description || undefined,
  };
}

function todayDateInputValue(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Weekly recurring hours + one-off blocked dates, editable inline. */
function VendorAvailabilityEditor() {
  const { showToast } = useAppUi();
  const [rules, setRules] = useState<VendorAvailabilityRule[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [weeklyFormOpen, setWeeklyFormOpen] = useState(false);
  const [weeklyDraft, setWeeklyDraft] = useState({ weekday: 1, start: "09:00", end: "17:00" });
  const [blockFormOpen, setBlockFormOpen] = useState(false);
  const [blockDraft, setBlockDraft] = useState({ date: todayDateInputValue(), allDay: true, start: "09:00", end: "17:00", note: "" });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const reload = async () => {
    const next = await fetchVendorAvailability();
    setRules(next);
    setLoaded(true);
  };

  useEffect(() => {
    void reload();
  }, []);

  const weeklyByDay = useMemo(() => {
    const map = new Map<number, VendorAvailabilityRule[]>();
    for (const rule of rules) {
      if (rule.kind !== "weekly") continue;
      const list = map.get(rule.weekday) ?? [];
      list.push(rule);
      map.set(rule.weekday, list);
    }
    for (const list of map.values()) list.sort((a, b) => (a.kind === "weekly" && b.kind === "weekly" ? a.startMinute - b.startMinute : 0));
    return map;
  }, [rules]);

  const blocks = useMemo(
    () =>
      rules
        .filter((r): r is Extract<VendorAvailabilityRule, { kind: "block" }> => r.kind === "block")
        .sort((a, b) => a.specificDate.localeCompare(b.specificDate)),
    [rules],
  );

  const addWeeklyWindow = async () => {
    const start = timeInputValueToMinuteOfDay(weeklyDraft.start);
    const end = timeInputValueToMinuteOfDay(weeklyDraft.end);
    if (start === null || end === null || start >= end) {
      showToast("Choose a valid start and end time.");
      return;
    }
    setSaving(true);
    const result = await saveVendorWeeklyRule({ weekday: weeklyDraft.weekday, startMinute: start, endMinute: end });
    setSaving(false);
    if (!result.ok) {
      showToast(result.error ?? "Could not save that window.");
      return;
    }
    setWeeklyFormOpen(false);
    showToast("Weekly window added.");
    await reload();
  };

  const addBlock = async () => {
    if (!blockDraft.date) {
      showToast("Choose a date to block.");
      return;
    }
    let startMinute: number | undefined;
    let endMinute: number | undefined;
    if (!blockDraft.allDay) {
      const start = timeInputValueToMinuteOfDay(blockDraft.start);
      const end = timeInputValueToMinuteOfDay(blockDraft.end);
      if (start === null || end === null || start >= end) {
        showToast("Choose a valid start and end time, or mark it all day.");
        return;
      }
      startMinute = start;
      endMinute = end;
    }
    setSaving(true);
    const result = await saveVendorBlockRule({
      specificDate: blockDraft.date,
      startMinute,
      endMinute,
      note: blockDraft.note,
    });
    setSaving(false);
    if (!result.ok) {
      showToast(result.error ?? "Could not block that date.");
      return;
    }
    setBlockFormOpen(false);
    setBlockDraft({ date: todayDateInputValue(), allDay: true, start: "09:00", end: "17:00", note: "" });
    showToast("Date blocked.");
    await reload();
  };

  const removeRule = async (id: string) => {
    setBusyId(id);
    const ok = await deleteVendorAvailabilityRule(id);
    setBusyId(null);
    if (!ok.ok) {
      showToast(ok.error ?? "Could not remove that.");
      return;
    }
    await reload();
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-sm)]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-foreground">Weekly hours</p>
          <Button
            type="button"
            variant="outline"
            data-attr="vendor-availability-add-weekly"
            className="h-8 rounded-full px-3 text-xs"
            onClick={() => setWeeklyFormOpen((v) => !v)}
          >
            {weeklyFormOpen ? "Cancel" : "+ Add window"}
          </Button>
        </div>

        {weeklyFormOpen ? (
          <div className="mt-3 flex flex-wrap items-end gap-x-3 gap-y-2 rounded-xl border border-border bg-accent/20 p-3">
            <label className="flex flex-col gap-1 text-[11px] font-medium text-muted">
              Day
              <Select
                className="h-9 min-w-[110px] rounded-md text-sm"
                value={weeklyDraft.weekday}
                onChange={(e) => setWeeklyDraft((d) => ({ ...d, weekday: Number(e.target.value) }))}
              >
                {WEEKDAY_DISPLAY_ORDER.map((wd) => (
                  <option key={wd} value={wd}>
                    {WEEKDAY_LABELS[wd]}
                  </option>
                ))}
              </Select>
            </label>
            <label className="flex flex-col gap-1 text-[11px] font-medium text-muted">
              Start
              <Input
                type="time"
                value={weeklyDraft.start}
                onChange={(e) => setWeeklyDraft((d) => ({ ...d, start: e.target.value }))}
                className="h-9 w-[120px] rounded-md text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 text-[11px] font-medium text-muted">
              End
              <Input
                type="time"
                value={weeklyDraft.end}
                onChange={(e) => setWeeklyDraft((d) => ({ ...d, end: e.target.value }))}
                className="h-9 w-[120px] rounded-md text-sm"
              />
            </label>
            <Button
              type="button"
              variant="primary"
              data-attr="vendor-availability-save-weekly"
              className="h-9 rounded-full px-4 text-sm"
              disabled={saving}
              onClick={() => void addWeeklyWindow()}
            >
              Save
            </Button>
          </div>
        ) : null}

        <div className="mt-3 space-y-2">
          {WEEKDAY_DISPLAY_ORDER.map((wd) => {
            const windows = weeklyByDay.get(wd) ?? [];
            return (
              <div key={wd} className="flex flex-wrap items-center gap-2">
                <span className="w-9 shrink-0 text-xs font-semibold uppercase tracking-wide text-muted">{WEEKDAY_LABELS[wd]}</span>
                {windows.length === 0 ? (
                  <span className="text-xs text-muted">Unavailable</span>
                ) : (
                  windows.map((w) =>
                    w.kind === "weekly" ? (
                      <span
                        key={w.id}
                        className="inline-flex items-center gap-1.5 rounded-full bg-accent/30 px-3 py-1 text-xs font-medium text-foreground ring-1 ring-border"
                      >
                        {formatMinuteOfDayLabel(w.startMinute)}–{formatMinuteOfDayLabel(w.endMinute)}
                        <button
                          type="button"
                          data-attr="vendor-availability-remove-weekly"
                          aria-label={`Remove ${WEEKDAY_LABELS[wd]} ${formatMinuteOfDayLabel(w.startMinute)}–${formatMinuteOfDayLabel(w.endMinute)}`}
                          className="text-muted hover:text-danger"
                          disabled={busyId === w.id}
                          onClick={() => void removeRule(w.id)}
                        >
                          ✕
                        </button>
                      </span>
                    ) : null,
                  )
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-sm)]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-foreground">Blocked dates</p>
          <Button
            type="button"
            variant="outline"
            data-attr="vendor-availability-add-block"
            className="h-8 rounded-full px-3 text-xs"
            onClick={() => setBlockFormOpen((v) => !v)}
          >
            {blockFormOpen ? "Cancel" : "+ Block a date"}
          </Button>
        </div>

        {blockFormOpen ? (
          <div className="mt-3 flex flex-wrap items-end gap-x-3 gap-y-2 rounded-xl border border-border bg-accent/20 p-3">
            <label className="flex flex-col gap-1 text-[11px] font-medium text-muted">
              Date
              <Input
                type="date"
                value={blockDraft.date}
                onChange={(e) => setBlockDraft((d) => ({ ...d, date: e.target.value }))}
                className="h-9 w-[160px] rounded-md text-sm"
              />
            </label>
            <label className="flex items-center gap-2 pb-1.5 text-xs font-medium text-muted">
              <input
                type="checkbox"
                checked={blockDraft.allDay}
                onChange={(e) => setBlockDraft((d) => ({ ...d, allDay: e.target.checked }))}
                className="h-4 w-4 rounded border-border"
              />
              All day
            </label>
            {!blockDraft.allDay ? (
              <>
                <label className="flex flex-col gap-1 text-[11px] font-medium text-muted">
                  Start
                  <Input
                    type="time"
                    value={blockDraft.start}
                    onChange={(e) => setBlockDraft((d) => ({ ...d, start: e.target.value }))}
                    className="h-9 w-[120px] rounded-md text-sm"
                  />
                </label>
                <label className="flex flex-col gap-1 text-[11px] font-medium text-muted">
                  End
                  <Input
                    type="time"
                    value={blockDraft.end}
                    onChange={(e) => setBlockDraft((d) => ({ ...d, end: e.target.value }))}
                    className="h-9 w-[120px] rounded-md text-sm"
                  />
                </label>
              </>
            ) : null}
            <label className="flex flex-1 min-w-[140px] flex-col gap-1 text-[11px] font-medium text-muted">
              Note (optional)
              <Input
                type="text"
                placeholder="e.g. Vacation"
                value={blockDraft.note}
                onChange={(e) => setBlockDraft((d) => ({ ...d, note: e.target.value }))}
                className="h-9 rounded-md text-sm"
              />
            </label>
            <Button
              type="button"
              variant="primary"
              data-attr="vendor-availability-save-block"
              className="h-9 rounded-full px-4 text-sm"
              disabled={saving}
              onClick={() => void addBlock()}
            >
              Save
            </Button>
          </div>
        ) : null}

        <div className="mt-3 space-y-1.5">
          {blocks.length === 0 ? (
            <p className="text-xs text-muted">No blocked dates.</p>
          ) : (
            blocks.map((b) => (
              <div
                key={b.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-2.5 py-1.5 text-xs"
              >
                <span>
                  <span className="font-medium text-foreground">
                    {new Date(`${b.specificDate}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </span>{" "}
                  ·{" "}
                  {b.startMinute === 0 && b.endMinute === 1440
                    ? "All day"
                    : `${formatMinuteOfDayLabel(b.startMinute)}–${formatMinuteOfDayLabel(b.endMinute)}`}
                  {b.note ? <span className="text-muted"> · {b.note}</span> : null}
                </span>
                <button
                  type="button"
                  data-attr="vendor-availability-remove-block"
                  aria-label={`Remove blocked date ${b.specificDate}`}
                  className="text-muted hover:text-danger"
                  disabled={busyId === b.id}
                  onClick={() => void removeRule(b.id)}
                >
                  ✕
                </button>
              </div>
            ))
          )}
        </div>
      </div>
      {!loaded ? <p className="text-xs text-muted">Loading availability…</p> : null}
    </div>
  );
}

/** Scheduled visits + editable availability for the signed-in vendor. */
export function VendorCalendarPanel() {
  const [rows, setRows] = useState<DemoManagerWorkOrderRow[]>(() => readVendorWorkOrderRows());

  useEffect(() => {
    const sync = () => setRows(readVendorWorkOrderRows());
    window.addEventListener(MANAGER_WORK_ORDERS_EVENT, sync);
    void syncManagerWorkOrdersFromServer().then(() => sync());
    return () => window.removeEventListener(MANAGER_WORK_ORDERS_EVENT, sync);
  }, []);

  const vendorMeetings = useMemo<DemoMeeting[]>(
    () =>
      rows
        .filter((r) => r.scheduledAtIso && r.bucket !== "completed")
        .map(vendorMeetingFromRow)
        .filter((meeting): meeting is DemoMeeting => meeting !== null),
    [rows],
  );

  return (
    <ManagerPortalPageShell title="Calendar">
      <div className="space-y-6">
        <VendorAvailabilityEditor />
        <PortalCalendarPanels
          storageKey={null}
          readOnly
          compactAvailability
          defaultViewMode="week"
          availabilityHeading="Your schedule"
          eventSummaryLabel="visit"
          externalMeetings={vendorMeetings}
        />
      </div>
    </ManagerPortalPageShell>
  );
}
