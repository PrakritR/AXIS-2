"use client";

import { useEffect, useMemo, useState } from "react";
import type { DemoManagerWorkOrderRow } from "@/data/demo-portal";
import { ManagerPortalPageShell, MANAGER_TABLE_TH } from "@/components/portal/portal-metrics";
import { PORTAL_DATA_TABLE_WRAP, PORTAL_DATA_TABLE_SCROLL, PORTAL_TABLE_HEAD_ROW, PORTAL_TABLE_TR, PORTAL_TABLE_TD, PortalDataTableEmpty } from "@/components/portal/portal-data-table";
import { WorkOrderStatusBadge } from "@/components/portal/resident-services-panel";
import { readManagerWorkOrderRows, syncManagerWorkOrdersFromServer, MANAGER_WORK_ORDERS_EVENT } from "@/lib/manager-work-orders-storage";

function propertyLabel(row: DemoManagerWorkOrderRow): string {
  const unit = row.unit?.trim();
  return unit && unit !== "—" ? `${row.propertyName} · ${unit}` : row.propertyName;
}

/** Work orders offered/assigned to the signed-in vendor — read-only (the manager owns assignment and scheduling). */
export function VendorWorkOrdersPanel() {
  const [rows, setRows] = useState<DemoManagerWorkOrderRow[]>(() => readManagerWorkOrderRows());

  useEffect(() => {
    const sync = () => setRows(readManagerWorkOrderRows());
    window.addEventListener(MANAGER_WORK_ORDERS_EVENT, sync);
    void syncManagerWorkOrdersFromServer().then(() => sync());
    return () => window.removeEventListener(MANAGER_WORK_ORDERS_EVENT, sync);
  }, []);

  const sorted = useMemo(
    () => [...rows].sort((a, b) => (b.scheduledAtIso ?? "").localeCompare(a.scheduledAtIso ?? "")),
    [rows],
  );

  return (
    <ManagerPortalPageShell title="Work Orders">
      {sorted.length === 0 ? (
        <PortalDataTableEmpty message="No work orders offered to you yet." icon="work-order" />
      ) : (
        <div className={PORTAL_DATA_TABLE_WRAP}>
          <div className={PORTAL_DATA_TABLE_SCROLL}>
            <table className="w-full min-w-[640px] border-collapse text-left">
              <thead>
                <tr className={PORTAL_TABLE_HEAD_ROW}>
                  <th className={MANAGER_TABLE_TH}>Work order</th>
                  <th className={MANAGER_TABLE_TH}>Property</th>
                  <th className={MANAGER_TABLE_TH}>Scheduled visit</th>
                  <th className={MANAGER_TABLE_TH}>Status</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((row) => (
                  <tr key={row.id} className={PORTAL_TABLE_TR}>
                    <td className={PORTAL_TABLE_TD}>
                      <p className="font-medium text-foreground">{row.title}</p>
                      {row.description ? (
                        <p className="mt-0.5 line-clamp-2 text-xs text-muted">{row.description}</p>
                      ) : null}
                    </td>
                    <td className={PORTAL_TABLE_TD}>{propertyLabel(row)}</td>
                    <td className={PORTAL_TABLE_TD}>{row.scheduled || "Not yet scheduled"}</td>
                    <td className={PORTAL_TABLE_TD}>
                      <WorkOrderStatusBadge bucket={row.bucket} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </ManagerPortalPageShell>
  );
}
