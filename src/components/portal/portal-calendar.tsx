"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { PortalPropertyFilter } from "./manager-section-shell";
import { ManagerPortalPageShell } from "./portal-metrics";
import { PortalCalendarPanels } from "./portal-calendar-panels";
import { ADMIN_AVAILABILITY_STORAGE_KEY, managerAvailabilityStorageKey } from "@/lib/demo-admin-scheduling";
import { useManagerUserId } from "@/hooks/use-manager-user-id";

export function PortalCalendar({ portal }: { portal: "manager" | "admin" }) {
  const { userId, ready: authReady } = useManagerUserId();
  const [calendarRefreshSignal, setCalendarRefreshSignal] = useState(0);
  const storageKey = useMemo(() => {
    if (portal === "admin") return ADMIN_AVAILABILITY_STORAGE_KEY;
    return userId ? managerAvailabilityStorageKey(userId) : null;
  }, [portal, userId]);

  const reloadAvailability = () => setCalendarRefreshSignal((n) => n + 1);

  if (portal === "manager" && !authReady) {
    return (
      <ManagerPortalPageShell
        title="Calendar"
        titleAside={
          <Button type="button" variant="outline" className="shrink-0 rounded-full" onClick={reloadAvailability}>
            Refresh
          </Button>
        }
        filterRow={<PortalPropertyFilter />}
      >
        <p className="text-sm text-slate-500">Loading calendar…</p>
      </ManagerPortalPageShell>
    );
  }
  if (portal === "manager" && !userId) {
    return (
      <ManagerPortalPageShell
        title="Calendar"
        titleAside={
          <Button type="button" variant="outline" className="shrink-0 rounded-full" onClick={reloadAvailability}>
            Refresh
          </Button>
        }
        filterRow={<PortalPropertyFilter />}
      >
        <p className="text-sm text-slate-600">Sign in to manage your availability.</p>
      </ManagerPortalPageShell>
    );
  }

  return (
    <ManagerPortalPageShell
      title="Calendar"
      titleAside={
        <Button type="button" variant="outline" className="shrink-0 rounded-full" onClick={reloadAvailability}>
          Refresh
        </Button>
      }
      filterRow={portal === "manager" ? <PortalPropertyFilter /> : undefined}
    >
      <PortalCalendarPanels storageKey={storageKey} calendarRefreshSignal={calendarRefreshSignal} />
    </ManagerPortalPageShell>
  );
}
