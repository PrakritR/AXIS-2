"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ManagerPortalPageShell } from "./portal-metrics";
import { PortalCalendarPanels } from "./portal-calendar-panels";
import { demoManagerHouseRows } from "@/data/demo-portal";
import {
  ADMIN_AVAILABILITY_STORAGE_KEY,
  managerPropertyAvailabilityStorageKey,
} from "@/lib/demo-admin-scheduling";
import { useManagerUserId } from "@/hooks/use-manager-user-id";

const selectClassName =
  "h-10 min-w-[12rem] max-w-full rounded-full border border-slate-200/90 bg-white px-3.5 text-sm text-slate-800 outline-none transition focus:ring-2 focus:ring-primary/25";

function ManagerCalendarPropertyFilter({
  value,
  onChange,
}: {
  value: string;
  onChange: (propertyId: string) => void;
}) {
  return (
    <div className="flex w-full min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
      <div className="min-w-0 sm:shrink-0">
        <label htmlFor="portal-calendar-property" className="sr-only">
          Property
        </label>
        <select
          id="portal-calendar-property"
          className={selectClassName}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">Select a house</option>
          {demoManagerHouseRows.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      {!value ? (
        <p className="min-w-0 text-xs leading-snug text-slate-500">
          Choose a house before creating tour windows.
        </p>
      ) : null}
    </div>
  );
}

export function PortalCalendar({ portal }: { portal: "manager" | "admin" }) {
  const { userId, ready: authReady } = useManagerUserId();
  const [calendarRefreshSignal, setCalendarRefreshSignal] = useState(0);
  const [calendarPropertyId, setCalendarPropertyId] = useState<string>("");

  const storageKey = useMemo(() => {
    if (portal === "admin") return ADMIN_AVAILABILITY_STORAGE_KEY;
    if (!userId) return null;
    if (!calendarPropertyId) return null;
    return managerPropertyAvailabilityStorageKey(userId, calendarPropertyId);
  }, [portal, userId, calendarPropertyId]);

  const tourScopeLabel = useMemo(() => {
    if (portal !== "manager") return undefined;
    if (!calendarPropertyId) return undefined;
    const name = demoManagerHouseRows.find((p) => p.id === calendarPropertyId)?.name;
    return name ? `Tours · ${name}` : undefined;
  }, [portal, calendarPropertyId]);

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
        filterRow={
          <ManagerCalendarPropertyFilter value={calendarPropertyId} onChange={setCalendarPropertyId} />
        }
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
        filterRow={
          <ManagerCalendarPropertyFilter value={calendarPropertyId} onChange={setCalendarPropertyId} />
        }
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
      filterRow={
        portal === "manager" ? (
          <ManagerCalendarPropertyFilter value={calendarPropertyId} onChange={setCalendarPropertyId} />
        ) : undefined
      }
    >
      <PortalCalendarPanels
        storageKey={storageKey}
        calendarRefreshSignal={calendarRefreshSignal}
        tourScopeLabel={tourScopeLabel}
        unavailableMessage="Select a house before creating tour windows."
      />
    </ManagerPortalPageShell>
  );
}
