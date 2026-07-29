"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { usePortalNavigate } from "@/lib/portal-nav-client";
import {
  serviceRequestDetailHref,
  serviceRequestListHref,
  workOrderDetailHref,
  workOrderListHref,
} from "@/lib/portal-detail-routes";
import { PortalFilterSortSheet, portalFilterActiveCount } from "@/components/portal/portal-filter-sort-sheet";
import { PortalListControlStack } from "@/components/portal/portal-list-control-stack";
import { PortalSectionActionRow } from "@/components/portal/portal-section-action-row";
import {
  ManagerPortalPageShell,
  PORTAL_HEADER_ACTION_BTN,
} from "@/components/portal/portal-metrics";
import { PortalPropertyFilterPill } from "@/components/portal/manager-section-shell";
import {
  PortalDetailHeader,
  PortalListDetailPane,
  PortalListDetailPlaceholder,
  portalUsesDesktopSplit,
} from "@/components/portal/portal-list-detail-shell";
import { PortalServiceRecordRow } from "@/components/portal/portal-record-row";
import { INBOX_LIST_SCROLL } from "@/components/portal/portal-inbox-ui";
import { useManagerUserId } from "@/hooks/use-manager-user-id";
import {
  buildManagerPropertyFilterOptions,
  moduleRowVisibleToPortalUser,
  samePropertyId,
} from "@/lib/manager-portfolio-access";
import { syncPropertyPipelineFromServer } from "@/lib/demo-property-pipeline";
import {
  readManagerWorkOrderRows,
  syncManagerWorkOrdersFromServer,
  MANAGER_WORK_ORDERS_EVENT,
} from "@/lib/manager-work-orders-storage";
import {
  readAllServiceRequests,
  syncServiceRequestsFromServer,
  SERVICE_REQUESTS_EVENT,
  type ServiceRequest,
} from "@/lib/service-requests-storage";
import type { DemoManagerWorkOrderRow, ManagerWorkOrderBucket } from "@/data/demo-portal";
import { ManagerWorkOrdersPanel } from "@/components/portal/manager-work-orders-panel";
import {
  ManagerServiceRequestDetail,
  managerServiceRequestBucket,
  type ManagerServiceRequestBucket,
} from "@/components/portal/manager-service-request-detail";
import { applicationVisibleToPortalUser } from "@/lib/manager-portfolio-access";
import { readManagerApplicationRows } from "@/lib/manager-applications-storage";
import { getRoomChoiceLabel } from "@/lib/rental-application/data";
import { ManagerCreateServiceRequestModal } from "@/components/portal/manager-create-service-request-modal";
import { ManagerCreateWorkOrderModal } from "@/components/portal/manager-create-work-order-modal";
import {
  ManagerVendorsPanel,
  type ManagerVendorsPanelHandle,
} from "@/components/portal/manager-vendors-panel";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { Button } from "@/components/ui/button";
import { DestinationNav } from "@/components/ui/destination-nav";
import { useShallowTabId } from "@/components/ui/tabs";
import { PortalDataTableEmpty } from "@/components/portal/portal-data-table";

type FilterType = "requests" | "work-orders" | "vendors";

type RequestBucket = ManagerServiceRequestBucket;

const SERVICES_TAB_IDS = ["requests", "work-orders", "vendors"] as const;

export function ManagerAllServicesPanel({
  tabId: serverTabId,
  basePath,
  requestBucket: requestBucketProp = "pending",
  workOrderBucket: workOrderBucketProp = "open",
  serviceRequestId: serviceRequestIdProp,
  workOrderId: workOrderIdProp,
}: {
  tabId: FilterType;
  basePath: string;
  requestBucket?: RequestBucket;
  workOrderBucket?: ManagerWorkOrderBucket;
  serviceRequestId?: string;
  workOrderId?: string;
}) {
  const tabId = useShallowTabId<FilterType>(serverTabId, SERVICES_TAB_IDS);
  const router = useRouter();
  const navigate = usePortalNavigate();
  const { showToast } = useAppUi();
  const { userId, ready: authReady } = useManagerUserId();
  const [propertyTick, setPropertyTick] = useState(0);
  const [dataTick, setDataTick] = useState(0);
  const [propertyFilter, setPropertyFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [residentFilter, setResidentFilter] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [woBucket, setWoBucket] = useState<ManagerWorkOrderBucket>(workOrderBucketProp);
  const [prevWoBucketProp, setPrevWoBucketProp] = useState(workOrderBucketProp);
  if (workOrderBucketProp !== prevWoBucketProp) {
    setPrevWoBucketProp(workOrderBucketProp);
    if (woBucket !== workOrderBucketProp) setWoBucket(workOrderBucketProp);
  }
  const [reqBucket, setReqBucket] = useState<RequestBucket>(requestBucketProp);
  const [prevReqBucketProp, setPrevReqBucketProp] = useState(requestBucketProp);
  if (requestBucketProp !== prevReqBucketProp) {
    setPrevReqBucketProp(requestBucketProp);
    if (reqBucket !== requestBucketProp) setReqBucket(requestBucketProp);
  }
  const [addRequestOpen, setAddRequestOpen] = useState(false);
  const [addWorkOrderOpen, setAddWorkOrderOpen] = useState(false);
  const vendorsPanelRef = useRef<ManagerVendorsPanelHandle>(null);
  const typeFilter: FilterType = tabId;

  const propertyOptions = useMemo(() => {
    void propertyTick;
    return buildManagerPropertyFilterOptions(userId ?? null);
  }, [userId, propertyTick]);

  useEffect(() => {
    if (!authReady || !userId) return;
    void syncPropertyPipelineFromServer().then(() => setPropertyTick((t) => t + 1));
    void syncManagerWorkOrdersFromServer({ force: true });
    void syncServiceRequestsFromServer({ force: true });
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
    // Owner rows + linked-property rows for co-managers with services access.
    return readManagerWorkOrderRows().filter((r) => moduleRowVisibleToPortalUser(r, userId, "services"));
  }, [userId, dataTick]);

  const serviceRequests = useMemo<ServiceRequest[]>(() => {
    void dataTick;
    if (!userId) return [];
    // Match work orders: owned manager id OR owned/linked property — not exact
    // managerUserId alone (stale/mis-stamped rows still show for property owners).
    return readAllServiceRequests().filter((r) => moduleRowVisibleToPortalUser(r, userId, "services"));
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
        const match = propertyOptions.find((p) => samePropertyId(p.id, r.propertyId));
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

  const residentOptions = useMemo(() => {
    if (typeFilter === "vendors") return [];
    const seen = new Map<string, string>();
    const consider = (name: string | undefined) => {
      const trimmed = name?.trim();
      if (!trimmed || seen.has(trimmed)) return;
      seen.set(trimmed, trimmed);
    };
    if (typeFilter === "requests") {
      for (const row of serviceRequests) {
        if (propertyFilter && !samePropertyId(row.propertyId, propertyFilter) && row.propertyId?.trim()) continue;
        consider(row.residentName);
      }
    } else if (typeFilter === "work-orders") {
      for (const row of workOrders) {
        if (
          propertyFilter &&
          row.propertyId !== propertyFilter &&
          row.assignedPropertyId !== propertyFilter
        ) {
          continue;
        }
        consider(row.residentName);
      }
    }
    return [...seen.entries()]
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
  }, [typeFilter, serviceRequests, workOrders, propertyFilter]);

  const activeResidentFilter = residentOptions.some((option) => option.id === residentFilter)
    ? residentFilter
    : "";

  const filteredWorkOrders = useMemo(() => {
    let rows = workOrders;
    if (propertyFilter) rows = rows.filter((r) => r.propertyId === propertyFilter || r.assignedPropertyId === propertyFilter);
    if (activeResidentFilter) rows = rows.filter((r) => r.residentName === activeResidentFilter);
    const q = searchQuery.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.title, r.propertyName, r.unit, r.residentName, r.priority, r.description]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [workOrders, propertyFilter, activeResidentFilter, searchQuery]);

  const filteredRequests = useMemo(() => {
    let rows = serviceRequests;
    if (propertyFilter) {
      rows = rows.filter(
        (r) => samePropertyId(r.propertyId, propertyFilter) || !r.propertyId?.trim(),
      );
    }
    if (activeResidentFilter) rows = rows.filter((r) => r.residentName === activeResidentFilter);
    const q = searchQuery.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.offerName, r.residentName, r.notes, r.residentEmail]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [serviceRequests, propertyFilter, activeResidentFilter, searchQuery]);

  const residentUnitByKey = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of readManagerApplicationRows()) {
      if (!applicationVisibleToPortalUser(row, userId)) continue;
      const email = row.email?.trim().toLowerCase();
      const propertyId = row.assignedPropertyId?.trim() || row.propertyId?.trim() || "";
      if (!email || !propertyId) continue;
      const roomLabel =
        row.manualResidentDetails?.roomNumber?.trim() ||
        getRoomChoiceLabel(row.assignedRoomChoice?.trim() || row.application?.roomChoice1?.trim() || "")
          .split(" · ")[0]
          ?.trim() ||
        "";
      if (roomLabel) map.set(`${email}|${propertyId}`, roomLabel);
    }
    return map;
  }, [userId, dataTick]);

  const resolveRequestPropertyLabel = (req: ServiceRequest) =>
    req.propertyId && propertyOptions.find((p) => p.id === req.propertyId)
      ? propertyOptions.find((p) => p.id === req.propertyId)!.label
      : "—";

  const resolveRequestUnit = (req: ServiceRequest) =>
    residentUnitByKey.get(`${req.residentEmail.trim().toLowerCase()}|${req.propertyId.trim()}`) ?? "";

  const bucketedRequests = useMemo(
    () =>
      filteredRequests
        .filter((r) => managerServiceRequestBucket(r.status) === reqBucket)
        .slice()
        .sort((a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime()),
    [filteredRequests, reqBucket],
  );

  const requestIds = useMemo(() => bucketedRequests.map((r) => `request-${r.id}`), [bucketedRequests]);

  useEffect(() => {
    if (typeFilter !== "requests") return;
    if (requestIds.length === 0) {
      setExpandedId(null);
      setMobileDetailOpen(false);
      return;
    }
    setExpandedId((cur) => {
      if (cur && requestIds.includes(cur)) return cur;
      if (portalUsesDesktopSplit()) return requestIds[0] ?? null;
      return null;
    });
  }, [requestIds, typeFilter]);

  useEffect(() => {
    if (typeFilter !== "requests" || !serviceRequestIdProp) return;
    const decoded = decodeURIComponent(serviceRequestIdProp);
    const id = `request-${decoded}`;
    if (requestIds.includes(id)) {
      setExpandedId(id);
      if (!portalUsesDesktopSplit()) setMobileDetailOpen(true);
    }
  }, [serviceRequestIdProp, requestIds, typeFilter]);

  useEffect(() => {
    setMobileDetailOpen(false);
    if (!portalUsesDesktopSplit() && !serviceRequestIdProp) setExpandedId(null);
  }, [reqBucket, propertyFilter, searchQuery, typeFilter, serviceRequestIdProp]);

  const selectedRequest = useMemo(() => {
    if (!expandedId?.startsWith("request-")) return null;
    const rawId = expandedId.slice("request-".length);
    return bucketedRequests.find((r) => r.id === rawId) ?? null;
  }, [bucketedRequests, expandedId]);


  const woCounts = useMemo(() => {
    const c: Record<ManagerWorkOrderBucket, number> = { open: 0, scheduled: 0, completed: 0 };
    for (const r of filteredWorkOrders) c[r.bucket] += 1;
    return c;
  }, [filteredWorkOrders]);
  const woTabs = useMemo(
    () =>
      (["open", "scheduled", "completed"] as const).map((id) => ({
        id,
        label: id === "open" ? "Pending" : id === "scheduled" ? "Scheduled" : "Completed",
        count: woCounts[id],
      })),
    [woCounts],
  );
  const reqCounts = useMemo(() => {
    const c: Record<RequestBucket, number> = { pending: 0, approved: 0, denied: 0 };
    for (const r of filteredRequests) c[managerServiceRequestBucket(r.status)] += 1;
    return c;
  }, [filteredRequests]);
  const reqTabs = useMemo(
    () =>
      (["pending", "approved", "denied"] as const).map((id) => ({
        id,
        label: id === "pending" ? "Pending" : id === "approved" ? "Approved" : "Denied",
        count: reqCounts[id],
      })),
    [reqCounts],
  );

  const portfolioScopeFilters = (
    <PortalFilterSortSheet
      activeCount={portalFilterActiveCount([
        propertyFilter,
        typeFilter !== "vendors" ? activeResidentFilter : "",
      ])}
      onReset={() => {
        setPropertyFilter("");
        setResidentFilter("");
      }}
      dataAttr="services-filter-sheet-open"
    >
      <PortalPropertyFilterPill
        propertyOptions={filterPropertyOptions}
        propertyValue={propertyFilter}
        onPropertyChange={(nextProperty) => {
          setPropertyFilter(nextProperty);
          setResidentFilter("");
        }}
        residents={typeFilter !== "vendors"}
        residentOptions={residentOptions}
        residentValue={activeResidentFilter}
        onResidentChange={setResidentFilter}
      />
    </PortalFilterSortSheet>
  );

  const renderRequestDetail = (req: ServiceRequest) => {
    return (
      <ManagerServiceRequestDetail
        req={req}
        propertyLabel={resolveRequestPropertyLabel(req)}
        onUpdated={() => setDataTick((t) => t + 1)}
        onApproved={() => router.push(`${basePath}/services/requests/approved`)}
        onDenied={() => router.push(`${basePath}/services/requests/denied`)}
        onCollapsed={() => setExpandedId(null)}
      />
    );
  };

  const servicesPrimaryAction = (
    <PortalSectionActionRow>
      {typeFilter === "vendors" ? (
        <Button
          type="button"
          variant="primary"
          className={`shrink-0 ${PORTAL_HEADER_ACTION_BTN}`}
          onClick={() => vendorsPanelRef.current?.openSettings()}
          data-attr="manager-vendor-settings-open"
        >
          Vendor settings
        </Button>
      ) : null}
      {typeFilter === "requests" ? (
        <Button
          type="button"
          variant="primary"
          className={`shrink-0 ${PORTAL_HEADER_ACTION_BTN}`}
          data-attr="manager-service-request-add"
          onClick={() => setAddRequestOpen(true)}
        >
          Add add-on service
        </Button>
      ) : null}
      {typeFilter === "work-orders" ? (
        <Button
          type="button"
          variant="primary"
          className={`shrink-0 ${PORTAL_HEADER_ACTION_BTN}`}
          data-attr="manager-work-order-add"
          onClick={() => setAddWorkOrderOpen(true)}
        >
          Add work order
        </Button>
      ) : null}
    </PortalSectionActionRow>
  );

  return (
    <ManagerPortalPageShell
      title={typeFilter === "vendors" ? "Vendors" : "Services"}
      compactFilterRow
      mobileHideFilterRow={mobileDetailOpen && typeFilter === "requests"}
      mobileFlush={mobileDetailOpen && typeFilter === "requests"}
    >
      <PortalListControlStack
        className="mb-3"
        filterRow={typeFilter === "vendors" ? undefined : portfolioScopeFilters}
        primaryAction={servicesPrimaryAction}
        destinations={[
          {
            id: "requests",
            label: "Add-on services",
            href: `${basePath}/services/requests/pending`,
            dataAttr: "manager-services-tab-requests",
          },
          {
            id: "work-orders",
            label: "Work orders",
            href: `${basePath}/services/work-orders/open`,
            dataAttr: "manager-services-tab-work-orders",
          },
          {
            id: "vendors",
            label: "Vendors",
            href: `${basePath}/services/vendors`,
            dataAttr: "manager-services-tab-vendors",
          },
        ]}
        activeDestinationId={typeFilter}
        destinationAriaLabel="Services section"
        search={
          typeFilter === "vendors"
            ? undefined
            : {
                value: searchQuery,
                onChange: setSearchQuery,
                placeholder:
                  typeFilter === "work-orders" ? "Search maintenance requests" : "Search add-on services",
                dataAttr:
                  typeFilter === "work-orders" ? "services-work-orders-search" : "services-requests-search",
              }
        }
      />
      <div className="mt-1 space-y-3">
        {typeFilter === "vendors" ? (
          <ManagerVendorsPanel ref={vendorsPanelRef} embedded />
        ) : typeFilter === "work-orders" ? (
          <>
            <DestinationNav
              items={woTabs.map((t) => ({
                id: t.id,
                label: t.label,
                href: `${basePath}/services/work-orders/${t.id}`,
                count: t.count,
              }))}
              activeId={woBucket}
              ariaLabel="Work order status"
            />
            <ManagerWorkOrdersPanel
              allRows={filteredWorkOrders}
              bucket={woBucket}
              workOrderId={workOrderIdProp}
              listBasePath={basePath}
              onAfterSchedule={() => router.push(`${basePath}/services/work-orders/scheduled`)}
            />
          </>
        ) : (
          <>
            <DestinationNav
              items={reqTabs.map((t) => ({
                id: t.id,
                label: t.label,
                href: `${basePath}/services/requests/${t.id}`,
                count: t.count,
              }))}
              activeId={reqBucket}
              ariaLabel="Add-on service status"
            />
            {bucketedRequests.length === 0 ? (
              <PortalDataTableEmpty
                message={filteredRequests.length === 0 ? "No add-on services requested yet." : "No add-on services in this bucket yet."}
                icon="service"
              />
            ) : (
              <PortalListDetailPane
                mobileCompact
                className="max-md:rounded-xl max-md:shadow-[var(--shadow-sm)]"
                detailOpen={mobileDetailOpen && Boolean(selectedRequest)}
                list={
                  <div className={INBOX_LIST_SCROLL}>
                    {bucketedRequests.map((req) => {
                      const id = `request-${req.id}`;
                      const propertyLabel = resolveRequestPropertyLabel(req);
                      const unit = resolveRequestUnit(req);
                      const subtitle = [req.residentName, propertyLabel, unit].filter(Boolean).join(" · ");
                      return (
                        <PortalServiceRecordRow
                          key={id}
                          title={req.offerName}
                          subtitle={subtitle || undefined}
                          statusLabel={reqBucket === "pending" ? "Pending" : reqBucket === "approved" ? "Approved" : "Denied"}
                          statusTone={
                            reqBucket === "approved" ? "success" : reqBucket === "denied" ? "danger" : "warning"
                          }
                          selected={expandedId === id}
                          onOpen={() => {
                            setExpandedId(id);
                            setMobileDetailOpen(true);
                            navigate(serviceRequestDetailHref(basePath, reqBucket, req.id));
                          }}
                          dataAttr="service-request-list-row"
                        />
                      );
                    })}
                  </div>
                }
                detail={
                  selectedRequest ? (
                    <div className="flex h-full min-h-0 flex-col">
                      <PortalDetailHeader
                        title={selectedRequest.offerName}
                        subtitle={selectedRequest.residentName}
                        avatarName={selectedRequest.residentName}
                        onBack={() => {
                          setMobileDetailOpen(false);
                          navigate(serviceRequestListHref(basePath, reqBucket));
                        }}
                        backLabel="Back to services"
                        dataAttrBack="service-request-detail-back"
                      />
                      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2 [-webkit-overflow-scrolling:touch] md:px-3 md:py-3">
                        {renderRequestDetail(selectedRequest)}
                      </div>
                    </div>
                  ) : (
                    <PortalListDetailPlaceholder
                      title="Select a service request"
                      hint="Choose a request from the list to review and approve."
                    />
                  )
                }
              />
            )}
          </>
        )}
      </div>

      <ManagerCreateServiceRequestModal
        open={addRequestOpen}
        onClose={() => setAddRequestOpen(false)}
        managerUserId={userId}
        defaultPropertyId={propertyFilter || undefined}
        onSubmitted={() => {
          setDataTick((t) => t + 1);
          setReqBucket("pending");
        }}
      />

      <ManagerCreateWorkOrderModal
        open={addWorkOrderOpen}
        onClose={() => setAddWorkOrderOpen(false)}
        managerUserId={userId}
        defaultPropertyId={propertyFilter || undefined}
        onSubmitted={(bucket) => {
          setDataTick((t) => t + 1);
          setWoBucket(bucket);
        }}
      />
    </ManagerPortalPageShell>
  );
}
