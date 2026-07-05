"use client";

import { useEffect, useMemo, useState } from "react";
import type { DemoManagerWorkOrderRow } from "@/data/demo-portal";
import { ManagerPortalPageShell } from "@/components/portal/portal-metrics";
import { PortalCalendarPanels, MEETING_CONFIRMED_COLOR, type DemoMeeting } from "@/components/portal/portal-calendar-panels";
import { readVendorWorkOrderRows, syncManagerWorkOrdersFromServer, MANAGER_WORK_ORDERS_EVENT } from "@/lib/manager-work-orders-storage";
import { dateSlotKey, SLOT_DURATION_MINUTES, toLocalDateStr } from "@/lib/demo-admin-scheduling";
import { DEMO_VENDOR_AVAILABILITY_RULES, fetchVendorAvailability, type VendorAvailabilityRule } from "@/lib/vendor-availability";
import { isDemoModeActive } from "@/lib/demo/demo-session";
import type { CoManagerAvailabilityOverlay } from "@/lib/co-manager-calendar";

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

/** How far back/forward of today to expand recurring availability rules into concrete calendar slots. */
const AVAILABILITY_OVERLAY_PAST_DAYS = 7;
const AVAILABILITY_OVERLAY_FUTURE_DAYS = 90;
const SLOTS_PER_DAY = Math.round(1440 / SLOT_DURATION_MINUTES);

/** Expands weekly/open/block availability rules into a set of concrete `dateSlotKey`s so they can
 * shade the calendar grid the same way a co-manager's shared availability overlay does. */
function vendorAvailabilitySlotKeys(rules: VendorAvailabilityRule[]): Set<string> {
  const weeklyByWeekday = new Map<number, Array<{ start: number; end: number }>>();
  const opensByDate = new Map<string, Array<{ start: number; end: number }>>();
  const blocksByDate = new Map<string, Array<{ start: number; end: number }>>();
  for (const rule of rules) {
    if (rule.kind === "weekly") {
      const list = weeklyByWeekday.get(rule.weekday) ?? [];
      list.push({ start: rule.startMinute, end: rule.endMinute });
      weeklyByWeekday.set(rule.weekday, list);
    } else if (rule.kind === "open") {
      const list = opensByDate.get(rule.specificDate) ?? [];
      list.push({ start: rule.startMinute, end: rule.endMinute });
      opensByDate.set(rule.specificDate, list);
    } else {
      const list = blocksByDate.get(rule.specificDate) ?? [];
      list.push({ start: rule.startMinute, end: rule.endMinute });
      blocksByDate.set(rule.specificDate, list);
    }
  }

  const keys = new Set<string>();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let offset = -AVAILABILITY_OVERLAY_PAST_DAYS; offset <= AVAILABILITY_OVERLAY_FUTURE_DAYS; offset += 1) {
    const day = new Date(today.getTime() + offset * 86_400_000);
    const ds = toLocalDateStr(day);
    const windows = [...(weeklyByWeekday.get(day.getDay()) ?? []), ...(opensByDate.get(ds) ?? [])];
    if (windows.length === 0) continue;
    const blocks = blocksByDate.get(ds) ?? [];
    for (let slot = 0; slot < SLOTS_PER_DAY; slot += 1) {
      const slotStart = slot * SLOT_DURATION_MINUTES;
      const slotEnd = slotStart + SLOT_DURATION_MINUTES;
      const inWindow = windows.some((w) => slotStart < w.end && slotEnd > w.start);
      if (!inWindow) continue;
      const inBlock = blocks.some((b) => slotStart < b.end && slotEnd > b.start);
      if (inBlock) continue;
      keys.add(dateSlotKey(ds, slot));
    }
  }
  return keys;
}

/** Scheduled visits + the vendor's own weekly/open/blocked availability (edited in Settings). */
export function VendorCalendarPanel() {
  const [rows, setRows] = useState<DemoManagerWorkOrderRow[]>(() => readVendorWorkOrderRows());
  const demo = isDemoModeActive();
  const [availabilityRules, setAvailabilityRules] = useState<VendorAvailabilityRule[]>(() =>
    demo ? DEMO_VENDOR_AVAILABILITY_RULES : [],
  );

  useEffect(() => {
    const sync = () => setRows(readVendorWorkOrderRows());
    window.addEventListener(MANAGER_WORK_ORDERS_EVENT, sync);
    void syncManagerWorkOrdersFromServer().then(() => sync());
    return () => window.removeEventListener(MANAGER_WORK_ORDERS_EVENT, sync);
  }, []);

  useEffect(() => {
    if (demo) return;
    void fetchVendorAvailability().then(setAvailabilityRules);
  }, [demo]);

  const vendorMeetings = useMemo<DemoMeeting[]>(
    () =>
      rows
        .filter((r) => r.scheduledAtIso && r.bucket !== "completed")
        .map(vendorMeetingFromRow)
        .filter((meeting): meeting is DemoMeeting => meeting !== null),
    [rows],
  );

  const availabilityOverlays = useMemo<CoManagerAvailabilityOverlay[]>(() => {
    const slots = vendorAvailabilitySlotKeys(availabilityRules);
    return slots.size > 0 ? [{ userId: "self", label: "Available", slots }] : [];
  }, [availabilityRules]);

  return (
    <ManagerPortalPageShell title="Calendar">
      <div className="space-y-6">
        <PortalCalendarPanels
          storageKey={null}
          readOnly
          compactAvailability
          defaultViewMode="week"
          availabilityHeading="Your schedule"
          eventSummaryLabel="visit"
          externalMeetings={vendorMeetings}
          coManagerAvailabilityOverlays={availabilityOverlays}
        />
      </div>
    </ManagerPortalPageShell>
  );
}
