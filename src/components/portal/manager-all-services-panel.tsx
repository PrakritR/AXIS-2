"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import {
  ManagerPortalPageShell,
  MANAGER_TABLE_TH,
  ManagerPortalStatusPills,
} from "@/components/portal/portal-metrics";
import { PortalPropertyFilterPill } from "@/components/portal/manager-section-shell";
import { useManagerUserId } from "@/hooks/use-manager-user-id";
import { buildManagerPropertyFilterOptions } from "@/lib/manager-portfolio-access";
import { syncPropertyPipelineFromServer } from "@/lib/demo-property-pipeline";
import {
  readManagerWorkOrderRows,
  syncManagerWorkOrdersFromServer,
  updateManagerWorkOrder,
  MANAGER_WORK_ORDERS_EVENT,
} from "@/lib/manager-work-orders-storage";
import {
  readServiceRequestsForManager,
  approveServiceRequest,
  deleteServiceRequest,
  denyServiceRequest,
  markServiceRequestServicePaid,
  markServiceRequestDepositPaid,
  SERVICE_REQUESTS_EVENT,
  type ServiceRequest,
} from "@/lib/service-requests-storage";
import type { DemoManagerWorkOrderRow, ManagerWorkOrderBucket } from "@/data/demo-portal";
import { ManagerWorkOrdersPanel } from "@/components/portal/manager-work-orders-panel";
import { ManagerCreateWorkOrderModal } from "@/components/portal/manager-create-work-order-modal";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { Button } from "@/components/ui/button";
import { TabNav } from "@/components/ui/tabs";
import {
  PORTAL_DATA_TABLE_SCROLL,
  PORTAL_DATA_TABLE_WRAP,
  PORTAL_TABLE_DETAIL_CELL,
  PORTAL_TABLE_DETAIL_ROW,
  PORTAL_TABLE_HEAD_ROW,
  PORTAL_TABLE_ROW_TOGGLE_CLASS,
  PORTAL_TABLE_TD,
  PORTAL_TABLE_TR,
} from "@/components/portal/portal-data-table";

type FilterType = "requests" | "work-orders";

const STATUS_PILL: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700 ring-amber-200",
  approved: "bg-blue-50 text-blue-700 ring-blue-200",
  denied: "bg-rose-50 text-rose-700 ring-rose-200",
  returned: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  open: "bg-sky-50 text-sky-700 ring-sky-200",
  scheduled: "bg-sky-50 text-sky-700 ring-sky-200",
  completed: "bg-emerald-50 text-emerald-700 ring-emerald-200",
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  approved: "Approved",
  denied: "Denied",
  returned: "Returned",
  open: "Open",
  scheduled: "Scheduled",
  completed: "Completed",
};

function hasDeposit(dep: string) {
  return dep.trim() !== "" && dep.trim() !== "0" && dep.trim() !== "$0";
}

export function ManagerAllServicesPanel({
  tabId,
  basePath,
}: {
  tabId: "requests" | "work-orders";
  basePath: string;
}) {
  const { showToast } = useAppUi();
  const { userId, ready: authReady } = useManagerUserId();
  const [propertyTick, setPropertyTick] = useState(0);
  const [dataTick, setDataTick] = useState(0);
  const [propertyFilter, setPropertyFilter] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [woBucket, setWoBucket] = useState<ManagerWorkOrderBucket>("open");
  const [createWoOpen, setCreateWoOpen] = useState(false);
  const typeFilter: FilterType = tabId;

  const propertyOptions = useMemo(() => {
    void propertyTick;
    return buildManagerPropertyFilterOptions(userId ?? null);
  }, [userId, propertyTick]);

  useEffect(() => {
    if (!authReady || !userId) return;
    void syncPropertyPipelineFromServer().then(() => setPropertyTick((t) => t + 1));
    void syncManagerWorkOrdersFromServer();
    const onWo = () => setDataTick((t) => t + 1);
    const onSr = () => setDataTick((t) => t + 1);
    window.addEventListener(MANAGER_WORK_ORDERS_EVENT, onWo);
    window.addEventListener(SERVICE_REQUESTS_EVENT, onSr);
    return () => {
      window.removeEventListener(MANAGER_WORK_ORDERS_EVENT, onWo);
      window.removeEventListener(SERVICE_REQUESTS_EVENT, onSr);
    };
  }, [authReady, userId]);

  const workOrders = useMemo<DemoManagerWorkOrderRow[]>(() => {
    void dataTick;
    if (!userId) return [];
    return readManagerWorkOrderRows().filter((r) => !r.managerUserId || r.managerUserId === userId);
  }, [userId, dataTick]);

  const serviceRequests = useMemo<ServiceRequest[]>(() => {
    void dataTick;
    if (!userId) return [];
    return readServiceRequestsForManager(userId);
  }, [userId, dataTick]);

  const filterPropertyOptions = useMemo(() => {
    const opts = [...propertyOptions];
    const seen = new Set(opts.map((p) => p.id));
    const woProps = workOrders
      .filter((w) => w.propertyId?.trim())
      .map((w) => ({ id: w.propertyId!, label: w.propertyName || w.propertyId! }));
    for (const p of woProps) {
      if (!seen.has(p.id)) {
        seen.add(p.id);
        opts.push(p);
      }
    }
    const srProps = serviceRequests
      .filter((r) => r.propertyId?.trim())
      .map((r) => {
        const match = propertyOptions.find((p) => p.id === r.propertyId);
        return { id: r.propertyId, label: match?.label ?? r.propertyId };
      });
    for (const p of srProps) {
      if (!seen.has(p.id)) {
        seen.add(p.id);
        opts.push(p);
      }
    }
    return opts.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
  }, [propertyOptions, workOrders, serviceRequests]);

  const filteredWorkOrders = useMemo(() => {
    let rows = workOrders;
    if (propertyFilter) rows = rows.filter((r) => r.propertyId === propertyFilter || r.assignedPropertyId === propertyFilter);
    return rows;
  }, [workOrders, propertyFilter]);

  const filteredRequests = useMemo(() => {
    let rows = serviceRequests;
    if (propertyFilter) rows = rows.filter((r) => r.propertyId === propertyFilter);
    return rows;
  }, [serviceRequests, propertyFilter]);

  type UnifiedItem =
    | { kind: "request"; data: ServiceRequest; sortKey: number }
    | { kind: "work-order"; data: DemoManagerWorkOrderRow; sortKey: number };

  const unified = useMemo<UnifiedItem[]>(() => {
    const items: UnifiedItem[] = [];
    if (typeFilter !== "work-orders") {
      for (const r of filteredRequests) {
        items.push({ kind: "request", data: r, sortKey: new Date(r.requestedAt).getTime() });
      }
    }
    if (typeFilter !== "requests") {
      for (const w of filteredWorkOrders) {
        const t = w.scheduledAtIso ? new Date(w.scheduledAtIso).getTime() : 0;
        items.push({ kind: "work-order", data: w, sortKey: t });
      }
    }
    items.sort((a, b) => b.sortKey - a.sortKey);
    return items;
  }, [filteredRequests, filteredWorkOrders, typeFilter]);

  const pendingCount = filteredRequests.filter((r) => r.status === "pending").length;
  const openCount = filteredWorkOrders.filter((w) => w.bucket === "open").length;
  const woCounts = useMemo(() => {
    const c: Record<ManagerWorkOrderBucket, number> = { open: 0, scheduled: 0, completed: 0 };
    for (const r of filteredWorkOrders) c[r.bucket] += 1;
    return c;
  }, [filteredWorkOrders]);
  const woTabs = useMemo(
    () =>
      (["open", "scheduled", "completed"] as const).map((id) => ({
        id,
        label: id === "open" ? "Open" : id === "scheduled" ? "Scheduled" : "Completed",
        count: woCounts[id],
      })),
    [woCounts],
  );

  return (
    <ManagerPortalPageShell
      title="Services"
      titleAside={
        <div className="flex flex-wrap items-center justify-end gap-2">
          {pendingCount > 0 && (
            <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold text-amber-800 ring-1 ring-amber-300/60">
              {pendingCount} awaiting approval
            </span>
          )}
          {openCount > 0 && (
            <span className="rounded-full bg-sky-100 px-2.5 py-0.5 text-[11px] font-bold text-sky-800 ring-1 ring-sky-300/60">
              {openCount} open work orders
            </span>
          )}
          <PortalPropertyFilterPill
            propertyOptions={filterPropertyOptions}
            propertyValue={propertyFilter}
            onPropertyChange={setPropertyFilter}
          />
        </div>
      }
      filterRow={null}
    >
      <div className="mt-1">
        <div className="mb-4">
          <TabNav
            activeId={typeFilter}
            items={[
              { id: "requests", label: "Requests", href: `${basePath}/services/requests` },
              { id: "work-orders", label: "Work orders", href: `${basePath}/services/work-orders` },
              { id: "vendors", label: "Vendors", href: `${basePath}/services/vendors` },
            ]}
          />
        </div>

        {typeFilter === "work-orders" ? (
          <>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <ManagerPortalStatusPills
                tabs={woTabs}
                activeId={woBucket}
                onChange={(id) => setWoBucket(id as ManagerWorkOrderBucket)}
              />
              <Button type="button" variant="primary" className="h-9 rounded-full px-4 text-sm" onClick={() => setCreateWoOpen(true)}>
                Log work order
              </Button>
            </div>
            <ManagerWorkOrdersPanel
              allRows={filteredWorkOrders}
              bucket={woBucket}
              onAfterSchedule={() => setWoBucket("scheduled")}
            />
            <ManagerCreateWorkOrderModal
              open={createWoOpen}
              onClose={() => setCreateWoOpen(false)}
              managerUserId={userId}
              defaultPropertyId={propertyFilter || undefined}
              onSubmitted={(bucket) => {
                setDataTick((t) => t + 1);
                setWoBucket(bucket);
              }}
            />
          </>
        ) : unified.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-accent/30 py-16 text-center">
            <p className="text-sm font-medium text-muted">No services yet</p>
            <p className="mt-1 max-w-xs text-xs text-muted">Service requests from residents will appear here.</p>
          </div>
        ) : (
          <div className={PORTAL_DATA_TABLE_WRAP}>
            <div className={PORTAL_DATA_TABLE_SCROLL}>
              <table className="min-w-[920px] w-full border-collapse text-left text-sm">
                <thead>
                  <tr className={PORTAL_TABLE_HEAD_ROW}>
                    <th className={`${MANAGER_TABLE_TH} text-left`}>Type</th>
                    <th className={`${MANAGER_TABLE_TH} text-left`}>Title</th>
                    <th className={`${MANAGER_TABLE_TH} text-left`}>Resident</th>
                    <th className={`${MANAGER_TABLE_TH} text-left`}>Property</th>
                    <th className={`${MANAGER_TABLE_TH} text-left`}>Status</th>
                    <th className={`${MANAGER_TABLE_TH} text-left`}>Details</th>
                    <th className={`${MANAGER_TABLE_TH} text-right`}>Actions</th>
                  </tr>
                </thead>
                <tbody>
            {unified.map((item) => {
              const id = item.kind === "request" ? `request-${item.data.id}` : `work-order-${item.data.id}`;
              const isExpanded = expandedId === id;

              if (item.kind === "request") {
                const req = item.data;
                const needsReturn = hasDeposit(req.deposit);
                return (
                  <Fragment key={`req-${req.id}`}>
                    <tr className={PORTAL_TABLE_TR}>
                      <td className={PORTAL_TABLE_TD}>Request</td>
                      <td className={`${PORTAL_TABLE_TD} font-medium text-foreground`}>{req.offerName}</td>
                      <td className={PORTAL_TABLE_TD}>{req.residentName || req.residentEmail}</td>
                      <td className={PORTAL_TABLE_TD}>
                        {req.propertyId && propertyOptions.find((p) => p.id === req.propertyId)
                          ? propertyOptions.find((p) => p.id === req.propertyId)!.label
                          : "—"}
                      </td>
                      <td className={PORTAL_TABLE_TD}>
                        <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ring-1 ${STATUS_PILL[req.status] ?? "bg-accent/40 text-muted ring-border"}`}>
                          {STATUS_LABEL[req.status] ?? req.status}
                        </span>
                      </td>
                      <td className={PORTAL_TABLE_TD}>
                        {[req.price, needsReturn ? `Deposit ${req.deposit}` : null].filter(Boolean).join(" · ") || "—"}
                      </td>
                      <td className={`${PORTAL_TABLE_TD} text-right`}>
                        <button
                          type="button"
                          onClick={() => setExpandedId(isExpanded ? null : id)}
                          className={PORTAL_TABLE_ROW_TOGGLE_CLASS}
                        >
                          {isExpanded ? "Hide" : "Details"}
                        </button>
                      </td>
                    </tr>
                    {isExpanded ? (
                      <tr className={PORTAL_TABLE_DETAIL_ROW}>
                        <td colSpan={7} className={PORTAL_TABLE_DETAIL_CELL}>
                          <div className="space-y-3">
                            {req.notes ? <p className="text-xs italic text-muted">&ldquo;{req.notes}&rdquo;</p> : null}
                        {req.status === "pending" ? (
                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              className="h-8 rounded-full bg-emerald-600 px-4 text-xs font-semibold text-white hover:bg-emerald-700"
                              onClick={() => { approveServiceRequest(req.id); setDataTick((t) => t + 1); showToast(`Approved "${req.offerName}".`); }}
                            >
                              Approve
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              className="h-8 rounded-full border-rose-200 px-4 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                              onClick={() => { denyServiceRequest(req.id); setDataTick((t) => t + 1); showToast("Request denied."); }}
                            >
                              Deny
                            </Button>
                          </div>
                        ) : null}

                        {(req.status === "approved" || req.status === "returned") ? (
                          <div className="rounded-xl bg-accent/40 p-3 ring-1 ring-border">
                            <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-muted">Charges</p>
                            <div className="space-y-2">
                              {req.price ? (
                                <div className="flex items-center justify-between">
                                  <span className="text-xs text-foreground/80">Service fee · {req.price}</span>
                                  {req.servicePaid
                                    ? <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-200">Paid</span>
                                    : <Button type="button" className="h-6 rounded-full px-2.5 text-[10px]" onClick={() => { markServiceRequestServicePaid(req.id); setDataTick((t) => t + 1); showToast("Service charge marked paid."); }}>Mark paid</Button>
                                  }
                                </div>
                              ) : null}
                              {needsReturn ? (
                                <div className="flex items-center justify-between">
                                  <span className="text-xs text-foreground/80">Deposit · {req.deposit}</span>
                                  {req.depositPaid
                                    ? <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-200">Refunded</span>
                                    : <Button type="button" className="h-6 rounded-full px-2.5 text-[10px]" onClick={() => { markServiceRequestDepositPaid(req.id); setDataTick((t) => t + 1); showToast("Deposit marked refunded."); }}>Mark refunded</Button>
                                  }
                                </div>
                              ) : null}
                            </div>
                          </div>
                        ) : null}

                        <div className="flex justify-end">
                          <Button
                            type="button"
                            variant="outline"
                            className="h-8 rounded-full border-rose-200 px-4 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                            onClick={() => {
                              if (!window.confirm("Delete this request? This cannot be undone.")) return;
                              deleteServiceRequest(req.id);
                              setDataTick((t) => t + 1);
                              setExpandedId(null);
                              showToast("Request deleted.");
                            }}
                          >
                            Delete request
                          </Button>
                        </div>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              }

              // Work order
              const wo = item.data;
              return (
                <Fragment key={`wo-${wo.id}`}>
                  <tr className={PORTAL_TABLE_TR}>
                    <td className={PORTAL_TABLE_TD}>Work order</td>
                    <td className={`${PORTAL_TABLE_TD} font-medium text-foreground`}>{wo.title}</td>
                    <td className={PORTAL_TABLE_TD}>{wo.residentName ?? wo.residentEmail ?? "Resident"}</td>
                    <td className={PORTAL_TABLE_TD}>
                      {[wo.propertyName, wo.unit].filter(Boolean).join(" · ") || "—"}
                    </td>
                    <td className={PORTAL_TABLE_TD}>
                      <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ring-1 ${STATUS_PILL[wo.bucket] ?? "bg-accent/40 text-muted ring-border"}`}>
                        {STATUS_LABEL[wo.bucket] ?? wo.status}
                      </span>
                    </td>
                    <td className={PORTAL_TABLE_TD}>{wo.priority}</td>
                    <td className={`${PORTAL_TABLE_TD} text-right`}>
                      <button
                        type="button"
                        onClick={() => setExpandedId(isExpanded ? null : id)}
                        className={PORTAL_TABLE_ROW_TOGGLE_CLASS}
                      >
                        {isExpanded ? "Hide" : "Details"}
                      </button>
                    </td>
                  </tr>
                  {isExpanded ? (
                    <tr className={PORTAL_TABLE_DETAIL_ROW}>
                      <td colSpan={7} className={PORTAL_TABLE_DETAIL_CELL}>
                        {wo.description ? (
                          <p className="mb-3 text-sm leading-relaxed text-muted">{wo.description}</p>
                        ) : null}
                      <div className="grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-3">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Preferred arrival</p>
                          <p className="mt-1 text-foreground">{wo.preferredArrival?.trim() || "Anytime"}</p>
                        </div>
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Visit</p>
                          <p className="mt-1 text-foreground">{wo.scheduled && wo.scheduled !== "—" ? wo.scheduled : "Not scheduled"}</p>
                        </div>
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Cost</p>
                          <p className="mt-1 text-foreground">{wo.cost !== "—" && wo.cost?.trim() ? wo.cost : "—"}</p>
                        </div>
                      </div>
                      {wo.bucket !== "completed" ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            className="h-8 rounded-full text-xs"
                            onClick={() => {
                              updateManagerWorkOrder(wo.id, (r) => ({ ...r, bucket: "completed", status: "Completed" }));
                              setDataTick((t) => t + 1);
                              showToast("Work order marked complete.");
                            }}
                          >
                            Mark complete
                          </Button>
                        </div>
                      ) : null}
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </ManagerPortalPageShell>
  );
}
