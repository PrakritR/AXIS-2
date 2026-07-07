"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { DemoManagerWorkOrderRow } from "@/data/demo-portal";
import { ManagerPortalPageShell } from "@/components/portal/portal-metrics";
import { PortalCalendarPanels, MEETING_CONFIRMED_COLOR, type DemoMeeting } from "@/components/portal/portal-calendar-panels";
import { VendorFlexibleSettingsModal } from "@/components/portal/vendor-flexible-settings-modal";
import { VENDOR_AVAILABILITY_CHANGED_EVENT } from "@/components/portal/vendor-settings-panel";
import { readVendorWorkOrderRows, syncManagerWorkOrdersFromServer, MANAGER_WORK_ORDERS_EVENT } from "@/lib/manager-work-orders-storage";
import {
  SLOT_DURATION_MINUTES,
  syncScheduleRecordsFromServer,
  toLocalDateStr,
  vendorAvailabilityStorageKey,
} from "@/lib/demo-admin-scheduling";
import {
  DEMO_VENDOR_AVAILABILITY_RULES,
  DEFAULT_FLEXIBLE_TIMING_RANK,
  fetchVendorAvailability,
  fetchVendorFlexiblePreferences,
  flexibleWeekdaysFromRules,
  isFlexibleWeeklyRule,
  saveVendorFlexiblePreferences,
  saveVendorWeeklyRule,
  deleteVendorAvailabilityRule,
  writeVendorFlexiblePreferencesToStorage,
  type VendorAvailabilityRule,
  type VendorFlexiblePreferences,
} from "@/lib/vendor-availability";
import { usePortalSession } from "@/hooks/use-portal-session";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { isDemoModeActive } from "@/lib/demo/demo-session";

function propertyLabel(row: DemoManagerWorkOrderRow): string {
  const unit = row.unit?.trim();
  return unit && unit !== "—" ? `${row.propertyName} · ${unit}` : row.propertyName;
}

const VENDOR_VISIT_DEFAULT_DURATION_MINUTES = 60;
let demoAvailabilityRuleCounter = DEMO_VENDOR_AVAILABILITY_RULES.length;

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

function notifyAvailabilityChanged(rules: VendorAvailabilityRule[]) {
  window.dispatchEvent(new CustomEvent(VENDOR_AVAILABILITY_CHANGED_EVENT, { detail: { rules } }));
}

/** Drag-painted availability blocks + per-day flexible scheduling for vendor visits. */
export function VendorCalendarPanel() {
  const { showToast } = useAppUi();
  const { userId, ready } = usePortalSession();
  const demo = isDemoModeActive();
  const [rows, setRows] = useState<DemoManagerWorkOrderRow[]>(() => readVendorWorkOrderRows());
  const [availabilityRules, setAvailabilityRules] = useState<VendorAvailabilityRule[]>(() =>
    demo ? DEMO_VENDOR_AVAILABILITY_RULES : [],
  );
  const [preferences, setPreferences] = useState<VendorFlexiblePreferences>({
    timingRank: [...DEFAULT_FLEXIBLE_TIMING_RANK],
  });
  const [flexModalOpen, setFlexModalOpen] = useState(false);
  const [prefsSaving, setPrefsSaving] = useState(false);
  const [calendarRefreshSignal, setCalendarRefreshSignal] = useState(0);

  const storageKey = useMemo(() => (userId ? vendorAvailabilityStorageKey(userId) : null), [userId]);
  const flexibleWeekdays = useMemo(() => flexibleWeekdaysFromRules(availabilityRules), [availabilityRules]);

  const reloadAvailability = useCallback(async () => {
    if (demo) return;
    const [rules, prefs] = await Promise.all([fetchVendorAvailability(), fetchVendorFlexiblePreferences()]);
    setAvailabilityRules(rules);
    setPreferences(prefs);
    if (userId) writeVendorFlexiblePreferencesToStorage(userId, prefs);
  }, [demo, userId]);

  useEffect(() => {
    const sync = () => setRows(readVendorWorkOrderRows());
    window.addEventListener(MANAGER_WORK_ORDERS_EVENT, sync);
    void syncManagerWorkOrdersFromServer().then(() => sync());
    return () => window.removeEventListener(MANAGER_WORK_ORDERS_EVENT, sync);
  }, []);

  useEffect(() => {
    void reloadAvailability();
  }, [reloadAvailability]);

  useEffect(() => {
    if (!storageKey || demo) return;
    void syncScheduleRecordsFromServer({ force: true }).then(() => setCalendarRefreshSignal((n) => n + 1));
  }, [storageKey, demo]);

  useEffect(() => {
    const bump = (event: Event) => {
      const detail = (event as CustomEvent<{ rules?: VendorAvailabilityRule[] }>).detail;
      if (detail?.rules) setAvailabilityRules(detail.rules);
    };
    window.addEventListener(VENDOR_AVAILABILITY_CHANGED_EVENT, bump);
    return () => window.removeEventListener(VENDOR_AVAILABILITY_CHANGED_EVENT, bump);
  }, []);

  const vendorMeetings = useMemo<DemoMeeting[]>(
    () =>
      rows
        .filter((r) => r.scheduledAtIso && r.bucket !== "completed")
        .map(vendorMeetingFromRow)
        .filter((meeting): meeting is DemoMeeting => meeting !== null),
    [rows],
  );

  const toggleFlexibleDay = useCallback(
    async (weekday: number) => {
      const existing = availabilityRules.find(
        (r) => r.kind === "weekly" && r.weekday === weekday && isFlexibleWeeklyRule(r),
      );
      if (existing) {
        if (demo) {
          const next = availabilityRules.filter((r) => r.id !== existing.id);
          setAvailabilityRules(next);
          notifyAvailabilityChanged(next);
          showToast("Flexible schedule removed.");
          return;
        }
        const result = await deleteVendorAvailabilityRule(existing.id);
        if (!result.ok) {
          showToast(result.error ?? "Could not update flexible day.");
          return;
        }
        showToast("Flexible schedule removed.");
        await reloadAvailability();
        return;
      }

      if (demo) {
        const next = [
          ...availabilityRules.filter((r) => !(r.kind === "weekly" && r.weekday === weekday && isFlexibleWeeklyRule(r))),
          {
            id: `demo-avail-flex-${++demoAvailabilityRuleCounter}`,
            kind: "weekly" as const,
            weekday,
            startMinute: 0,
            endMinute: 1440,
            note: "Flexible",
          },
        ];
        setAvailabilityRules(next);
        notifyAvailabilityChanged(next);
        showToast("Marked flexible — visits can auto-schedule by your timing preferences.");
        return;
      }

      const result = await saveVendorWeeklyRule({
        weekday,
        startMinute: 0,
        endMinute: 1440,
        note: "Flexible",
      });
      if (!result.ok) {
        showToast(result.error ?? "Could not mark day as flexible.");
        return;
      }
      showToast("Marked flexible — visits can auto-schedule by your timing preferences.");
      await reloadAvailability();
    },
    [availabilityRules, demo, reloadAvailability, showToast],
  );

  const savePreferences = useCallback(
    async (next: VendorFlexiblePreferences) => {
      setPrefsSaving(true);
      if (demo) {
        setPreferences(next);
        if (userId) writeVendorFlexiblePreferencesToStorage(userId, next);
        setPrefsSaving(false);
        setFlexModalOpen(false);
        showToast("Flexible timing preferences saved.");
        return;
      }
      const result = await saveVendorFlexiblePreferences(next);
      setPrefsSaving(false);
      if (!result.ok) {
        showToast(result.error ?? "Could not save preferences.");
        return;
      }
      setPreferences(next);
      if (userId) writeVendorFlexiblePreferencesToStorage(userId, next);
      setFlexModalOpen(false);
      showToast("Flexible timing preferences saved.");
    },
    [demo, showToast, userId],
  );

  if (!demo && !ready) {
    return (
      <ManagerPortalPageShell title="Calendar">
        <p className="text-sm text-muted">Loading calendar…</p>
      </ManagerPortalPageShell>
    );
  }

  if (!demo && !userId) {
    return (
      <ManagerPortalPageShell title="Calendar">
        <p className="text-sm text-muted">Sign in to manage your availability.</p>
      </ManagerPortalPageShell>
    );
  }

  return (
    <ManagerPortalPageShell title="Calendar">
      <div className="space-y-4">
        <p className="text-sm text-muted">
          Drag on the grid to open visit times. Mark a day flexible when managers can auto-schedule around tenant requests using your preferred timing.
        </p>
        <PortalCalendarPanels
          storageKey={storageKey}
          readOnly={false}
          compactAvailability
          defaultViewMode="week"
          availabilityHeading="Availability"
          eventSummaryLabel="visit"
          calendarRefreshSignal={calendarRefreshSignal}
          externalMeetings={vendorMeetings}
          vendorDayFlexibility={{
            flexibleWeekdays,
            onToggleFlexibleDay: (weekday) => void toggleFlexibleDay(weekday),
            onOpenFlexibleSettings: () => setFlexModalOpen(true),
          }}
        />
      </div>
      <VendorFlexibleSettingsModal
        open={flexModalOpen}
        preferences={preferences}
        saving={prefsSaving}
        onClose={() => setFlexModalOpen(false)}
        onSave={(next) => void savePreferences(next)}
      />
    </ManagerPortalPageShell>
  );
}
