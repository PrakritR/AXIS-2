"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import {
  ManagerPortalPageShell,
  PORTAL_HEADER_ACTION_BTN,
  PORTAL_TOOLBAR_LABEL,
  PORTAL_TOOLBAR_SELECT,
  MANAGER_TABLE_TH,
} from "@/components/portal/portal-metrics";
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
import type { DemoManagerWorkOrderRow } from "@/data/demo-portal";
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
type SortKey = "newest" | "oldest" | "status";

const STATUS_PILL: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700 ring-amber-200",
  approved: "bg-violet-50 text-violet-700 ring-violet-200",
  denied: "bg-rose-50 text-rose-700 ring-rose-200",
  returned: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  open: "bg-sky-50 text-sky-700 ring-sky-200",
  scheduled: "bg-violet-50 text-violet-700 ring-violet-200",
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
  const [propertyFilter, setPropertyFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("newest");
  const [expandedId, setExpandedId] = useState<string | null>(null);
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

  const allPropertyOptions = useMemo(() => {
    const opts: { id: string; label: string }[] = [{ id: "all", label: "All properties" }];
    const seen = new Set<string>();
    for (const p of propertyOptions) {
      if (!seen.has(p.id)) { seen.add(p.id); opts.push(p); }
    }
    const woProps = workOrders
      .filter((w) => w.propertyId?.trim())
      .map((w) => ({ id: w.propertyId!, label: w.propertyName || w.propertyId! }));
    for (const p of woProps) {
      if (!seen.has(p.id)) { seen.add(p.id); opts.push(p); }
    }
    const srProps = serviceRequests
      .filter((r) => r.propertyId?.trim())
      .map((r) => {
        const match = propertyOptions.find((p) => p.id === r.propertyId);
        return { id: r.propertyId, label: match?.label ?? r.propertyId };
      });
    for (const p of srProps) {
      if (!seen.has(p.id)) { seen.add(p.id); opts.push(p); }
    }
    return opts;
  }, [propertyOptions, workOrders, serviceRequests]);

  const filteredWorkOrders = useMemo(() => {
    let rows = workOrders;
    if (propertyFilter !== "all") rows = rows.filter((r) => r.propertyId === propertyFilter || r.assignedPropertyId === propertyFilter);
    return rows;
  }, [workOrders, propertyFilter]);

  const filteredRequests = useMemo(() => {
    let rows = serviceRequests;
    if (propertyFilter !== "all") rows = rows.filter((r) => r.propertyId === propertyFilter);
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
    if (sortKey === "newest") items.sort((a, b) => b.sortKey - a.sortKey);
    else if (sortKey === "oldest") items.sort((a, b) => a.sortKey - b.sortKey);
    else {
      items.sort((a, b) => {
        const getStatus = (item: UnifiedItem) =>
          item.kind === "request" ? item.data.status : item.data.bucket;
        return getStatus(a).localeCompare(getStatus(b));
      });
    }
    return items;
  }, [filteredRequests, filteredWorkOrders, typeFilter, sortKey]);

  const pendingCount = filteredRequests.filter((r) => r.status === "pending").length;
  const openCount = filteredWorkOrders.filter((w) => w.bucket === "open").length;

  return (
    <ManagerPortalPageShell
      title="Services"
      titleAside={
        <div className="flex flex-wrap items-center gap-2">
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
          <Button
            type="button"
            variant="outline"
            className={PORTAL_HEADER_ACTION_BTN}
            onClick={() => {
              void Promise.all([
                syncManagerWorkOrdersFromServer({ force: true }),
                syncPropertyPipelineFromServer({ force: true }),
              ]).then(() => {
                setDataTick((t) => t + 1);
                setPropertyTick((t) => t + 1);
                showToast("Refreshed.");
              });
            }}
          >
            Refresh
          </Button>
        </div>
      }
      filterRow={null}
    >
      <div className="mt-1">
        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-3 pb-4">
          {/* Property filter */}
          {allPropertyOptions.length > 2 && (
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200/90 bg-slate-100/70 p-1 pr-1.5">
              <label className={`${PORTAL_TOOLBAR_LABEL} pl-2`}>Property</label>
              <select
                value={propertyFilter}
                onChange={(e) => setPropertyFilter(e.target.value)}
                className={`${PORTAL_TOOLBAR_SELECT} h-8 px-3 text-xs`}
              >
                {allPropertyOptions.map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
            </div>
          )}

          {/* Sort */}
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200/90 bg-slate-100/70 p-1 pr-1.5">
            <label className={`${PORTAL_TOOLBAR_LABEL} pl-2`}>Sort</label>
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              className={`${PORTAL_TOOLBAR_SELECT} h-8 px-3 text-xs`}
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="status">By status</option>
            </select>
          </div>
        </div>

        <div className="mb-4">
          <TabNav
            activeId={typeFilter}
            items={[
              { id: "requests", label: "Requests", href: `${basePath}/services/requests` },
              { id: "work-orders", label: "Work orders", href: `${basePath}/services/work-orders` },
            ]}
          />
        </div>

        {unified.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 py-16 text-center">
            <p className="text-sm font-medium text-slate-600">No services yet</p>
            <p className="mt-1 max-w-xs text-xs text-slate-400">
              {typeFilter === "requests"
                ? "Service requests from residents will appear here."
                : "Work orders from residents will appear here."}
            </p>
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
                      <td className={`${PORTAL_TABLE_TD} font-medium text-slate-900`}>{req.offerName}</td>
                      <td className={PORTAL_TABLE_TD}>{req.residentName || req.residentEmail}</td>
                      <td className={PORTAL_TABLE_TD}>
                        {req.propertyId && propertyOptions.find((p) => p.id === req.propertyId)
                          ? propertyOptions.find((p) => p.id === req.propertyId)!.label
                          : "—"}
                      </td>
                      <td className={PORTAL_TABLE_TD}>
                        <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ring-1 ${STATUS_PILL[req.status] ?? "bg-slate-50 text-slate-600 ring-slate-200"}`}>
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
                            {req.notes ? <p className="text-xs italic text-slate-500">&ldquo;{req.notes}&rdquo;</p> : null}
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
                          <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
                            <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">Charges</p>
                            <div className="space-y-2">
                              {req.price ? (
                                <div className="flex items-center justify-between">
                                  <span className="text-xs text-slate-700">Service fee · {req.price}</span>
                                  {req.servicePaid
                                    ? <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-200">Paid</span>
                                    : <Button type="button" className="h-6 rounded-full px-2.5 text-[10px]" onClick={() => { markServiceRequestServicePaid(req.id); setDataTick((t) => t + 1); showToast("Service charge marked paid."); }}>Mark paid</Button>
                                  }
                                </div>
                              ) : null}
                              {needsReturn ? (
                                <div className="flex items-center justify-between">
                                  <span className="text-xs text-slate-700">Deposit · {req.deposit}</span>
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
                    <td className={`${PORTAL_TABLE_TD} font-medium text-slate-900`}>{wo.title}</td>
                    <td className={PORTAL_TABLE_TD}>{wo.residentName ?? wo.residentEmail ?? "Resident"}</td>
                    <td className={PORTAL_TABLE_TD}>
                      {[wo.propertyName, wo.unit].filter(Boolean).join(" · ") || "—"}
                    </td>
                    <td className={PORTAL_TABLE_TD}>
                      <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ring-1 ${STATUS_PILL[wo.bucket] ?? "bg-slate-50 text-slate-600 ring-slate-200"}`}>
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
                          <p className="mb-3 text-sm leading-relaxed text-slate-600">{wo.description}</p>
                        ) : null}
                      <div className="grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-3">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Preferred arrival</p>
                          <p className="mt-1 text-slate-800">{wo.preferredArrival?.trim() || "Anytime"}</p>
                        </div>
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Visit</p>
                          <p className="mt-1 text-slate-800">{wo.scheduled && wo.scheduled !== "—" ? wo.scheduled : "Not scheduled"}</p>
                        </div>
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Cost</p>
                          <p className="mt-1 text-slate-800">{wo.cost !== "—" && wo.cost?.trim() ? wo.cost : "—"}</p>
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
