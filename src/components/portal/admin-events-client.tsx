"use client";

import { ManagerPortalPageShell } from "@/components/portal/portal-metrics";
import { PortalCalendarPanels } from "@/components/portal/portal-calendar-panels";
import { ADMIN_AVAILABILITY_STORAGE_KEY, adminAvailabilityStorageKey } from "@/lib/demo-admin-scheduling";
import { useManagerUserId } from "@/hooks/use-manager-user-id";

/** Admin calendar page: one calendar surface for availability plus requested/confirmed meeting blocks. */
export function AdminEventsClient() {
  const { userId, email } = useManagerUserId();

  return (
    <ManagerPortalPageShell
      title="Schedule meeting"
    >
      <PortalCalendarPanels
        storageKey={userId ? adminAvailabilityStorageKey(userId) : ADMIN_AVAILABILITY_STORAGE_KEY}
        defaultViewMode="month"
        pinMonthSchedule
        compactAvailability
        scheduleOwnerLabel={email}
        availabilityHeading="Schedule meeting"
      />
    </ManagerPortalPageShell>
  );
}
