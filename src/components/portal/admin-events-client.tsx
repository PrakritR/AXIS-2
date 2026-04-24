"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ManagerPortalPageShell } from "@/components/portal/portal-metrics";
import { PortalCalendarPanels } from "@/components/portal/portal-calendar-panels";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { ADMIN_AVAILABILITY_STORAGE_KEY } from "@/lib/demo-admin-scheduling";

/** Admin calendar page: one calendar surface for availability plus requested/confirmed meeting blocks. */
export function AdminEventsClient() {
  const { showToast } = useAppUi();
  const [calendarRefreshSignal, setCalendarRefreshSignal] = useState(0);

  const refresh = () => {
    setCalendarRefreshSignal((n) => n + 1);
    showToast("Calendar refreshed.");
  };

  return (
    <ManagerPortalPageShell
      title="Calendar"
      titleAside={
        <Button type="button" variant="outline" className="shrink-0 rounded-full" onClick={refresh}>
          Refresh
        </Button>
      }
    >
      <PortalCalendarPanels
        storageKey={ADMIN_AVAILABILITY_STORAGE_KEY}
        calendarRefreshSignal={calendarRefreshSignal}
        defaultViewMode="month"
        pinMonthSchedule
        compactAvailability
      />
    </ManagerPortalPageShell>
  );
}
