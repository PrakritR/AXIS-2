"use client";

import { useEffect, useMemo, useState } from "react";
import type { DemoManagerWorkOrderRow } from "@/data/demo-portal";
import { ManagerPortalPageShell } from "@/components/portal/portal-metrics";
import { PortalDataTableEmpty } from "@/components/portal/portal-data-table";
import { readManagerWorkOrderRows, syncManagerWorkOrdersFromServer, MANAGER_WORK_ORDERS_EVENT } from "@/lib/manager-work-orders-storage";

function propertyLabel(row: DemoManagerWorkOrderRow): string {
  const unit = row.unit?.trim();
  return unit && unit !== "—" ? `${row.propertyName} · ${unit}` : row.propertyName;
}

function dayKey(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

/** Scheduled visits for the signed-in vendor, grouped by day. */
export function VendorCalendarPanel() {
  const [rows, setRows] = useState<DemoManagerWorkOrderRow[]>(() => readManagerWorkOrderRows());

  useEffect(() => {
    const sync = () => setRows(readManagerWorkOrderRows());
    window.addEventListener(MANAGER_WORK_ORDERS_EVENT, sync);
    void syncManagerWorkOrdersFromServer().then(() => sync());
    return () => window.removeEventListener(MANAGER_WORK_ORDERS_EVENT, sync);
  }, []);

  const groups = useMemo(() => {
    const upcoming = rows
      .filter((r) => r.scheduledAtIso && r.bucket !== "completed")
      .sort((a, b) => (a.scheduledAtIso ?? "").localeCompare(b.scheduledAtIso ?? ""));
    const byDay = new Map<string, DemoManagerWorkOrderRow[]>();
    for (const row of upcoming) {
      const key = dayKey(row.scheduledAtIso!);
      const list = byDay.get(key) ?? [];
      list.push(row);
      byDay.set(key, list);
    }
    return [...byDay.entries()];
  }, [rows]);

  return (
    <ManagerPortalPageShell title="Calendar">
      {groups.length === 0 ? (
        <PortalDataTableEmpty message="No scheduled visits yet." icon="work-order" />
      ) : (
        <div className="space-y-6">
          {groups.map(([day, items]) => (
            <div key={day}>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">{day}</p>
              <div className="mt-2 space-y-2">
                {items.map((row) => (
                  <div
                    key={row.id}
                    className="rounded-2xl border border-border bg-card px-4 py-3.5 shadow-[var(--shadow-sm)]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-foreground">{row.title}</p>
                        <p className="mt-0.5 text-sm text-muted">{propertyLabel(row)}</p>
                      </div>
                      <span className="shrink-0 text-sm font-semibold text-foreground">
                        {timeLabel(row.scheduledAtIso!)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </ManagerPortalPageShell>
  );
}
