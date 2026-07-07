"use client";

import Image from "next/image";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { formatPacificDate } from "@/lib/pacific-time";
import { Select } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { useAppUi } from "@/components/providers/app-ui-provider";
import {
  MANAGER_TABLE_TH,
  ManagerPortalFilterRow,
  ManagerPortalPageShell,
  PORTAL_HEADER_ACTION_BTN,
} from "@/components/portal/portal-metrics";
import {
  PORTAL_DATA_TABLE_SCROLL,
  PORTAL_DATA_TABLE_WRAP,
  PortalDataTableEmpty,
  PORTAL_DETAIL_BTN,
  PORTAL_TABLE_DETAIL_CELL,
  PORTAL_TABLE_DETAIL_ROW,
  PORTAL_TABLE_HEAD_ROW,
  PORTAL_TABLE_TR_EXPANDABLE,
  PORTAL_TABLE_EXPAND_TH,
  PORTAL_TABLE_TD,
  PortalMobileSummaryCard,
  PortalTableDetailActions,
  PortalTableExpandCell,
  createPortalRowExpandClick,
} from "@/components/portal/portal-data-table";
import { PillTabs, TabNav } from "@/components/ui/tabs";
import { PreferredArrivalField } from "@/components/portal/preferred-arrival-field";
import { formatPreferredArrival, parsePreferredArrival } from "@/lib/preferred-arrival";
import type { DemoManagerWorkOrderRow, ResidentWorkBucket } from "@/data/demo-portal";
import { usePortalSession } from "@/hooks/use-portal-session";
import {
  MANAGER_WORK_ORDERS_EVENT,
  deleteManagerWorkOrderRow,
  readManagerWorkOrderRows,
  syncManagerWorkOrdersFromServer,
  updateManagerWorkOrder,
  writeManagerWorkOrderRows,
} from "@/lib/manager-work-orders-storage";
import { readManagerApplicationRows, syncManagerApplicationsFromServer } from "@/lib/manager-applications-storage";
import {
  PROPERTY_PIPELINE_EVENT,
  loadResidentPropertyFromServer,
  syncPropertyPipelineFromServer,
} from "@/lib/demo-property-pipeline";
import type { ManagerListingServiceOption } from "@/lib/manager-listing-submission";
import { normalizeManagerListingSubmissionV1 } from "@/lib/manager-listing-submission";
import { getPropertyById } from "@/lib/rental-application/data";
import { notifyManagerOfResidentSubmission } from "@/lib/resident-manager-notifications";
import { parseMoneyAmount } from "@/lib/household-charges";
import { workOrderCategoryForResidentLabel } from "@/lib/work-order-taxonomy";
import {
  SERVICE_REQUESTS_EVENT,
  createServiceRequest,
  deleteServiceRequest,
  readServiceRequestsForResident,
  syncServiceRequestsFromServer,
  updateServiceRequest,
  hasDeposit,
  isServiceRequestFeePaid,
  CUSTOM_SERVICE_REQUEST_OFFER_ID,
  type ServiceRequest,
} from "@/lib/service-requests-storage";
import {
  LEASE_PIPELINE_EVENT,
  findLeaseForResidentEmail,
  hasBothLeaseSignatures,
  syncLeasePipelineFromServer,
} from "@/lib/lease-pipeline-storage";

export type WorkOrderFilterBucket = "pending" | "scheduled" | "completed";

export const WORK_ORDER_FILTER_TABS: { id: WorkOrderFilterBucket; label: string }[] = [
  { id: "pending", label: "Pending" },
  { id: "scheduled", label: "Scheduled" },
  { id: "completed", label: "Completed" },
];

export function workOrderFilterBucket(row: DemoManagerWorkOrderRow): WorkOrderFilterBucket {
  if (row.bucket === "completed") return "completed";
  if (row.bucket === "scheduled") return "scheduled";
  return "pending";
}

export type RequestStatusBucket = "pending" | "completed" | "denied";

export const REQUEST_STATUS_TABS: { id: RequestStatusBucket; label: string }[] = [
  { id: "pending", label: "Pending" },
  { id: "completed", label: "Completed" },
  { id: "denied", label: "Denied" },
];

/** Bucket a pill label with its count, e.g. "Open · 3" — omits the count when zero. */
export function pillLabelWithCount(label: string, count: number): string {
  return count > 0 ? `${label} ${count}` : label;
}

export type UnifiedItem =
  | { kind: "request"; req: ServiceRequest; sortKey: number }
  | { kind: "work-order"; row: DemoManagerWorkOrderRow; sortKey: number };

// Service requests: pending while awaiting manager action; approved/returned → completed; denied → denied.
export function serviceRequestStatusBucket(req: ServiceRequest): RequestStatusBucket {
  if (req.status === "pending") return "pending";
  if (req.status === "denied") return "denied";
  return "completed";
}

export function unifiedItemStatusBucket(item: UnifiedItem): RequestStatusBucket {
  if (item.kind === "request") return serviceRequestStatusBucket(item.req);
  if (item.row.bucket === "completed") return "completed";
  return "pending";
}

// Restrict photo links to http(s) or inline image data URLs before they reach an
// <a href> / <Image src> sink — inlined as a guard clause at each call site so
// CodeQL's xss-through-dom barrier recognition sees the check (see commit 924bd45
// for the same fix pattern elsewhere).
const SAFE_PHOTO_HREF_RE = /^(?:data:image\/|https?:\/\/)/;

function priorityClass(p: string) {
  const x = p.toLowerCase();
  if (x === "high") return "portal-badge-danger ring-1 ring-[color-mix(in_srgb,currentColor_25%,transparent)]";
  if (x === "medium") return "portal-badge-pending ring-1 ring-[color-mix(in_srgb,currentColor_25%,transparent)]";
  return "bg-accent/30 text-muted ring-1 ring-border";
}

export function formatDate(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return formatPacificDate(d, { month: "short", day: "numeric", year: "numeric" });
}

export function ServiceStatusBadge({ status }: { status: ServiceRequest["status"] }) {
  if (status === "pending") return null;
  if (status === "approved")
    return (
      <span className="rounded-full portal-badge-info px-2.5 py-0.5 text-[10px] font-semibold">
        Approved
      </span>
    );
  if (status === "denied")
    return (
      <span className="rounded-full px-2.5 py-0.5 text-[10px] font-semibold portal-badge-danger ring-1 ring-[color-mix(in_srgb,currentColor_25%,transparent)]">
        Denied
      </span>
    );
  if (status === "returned")
    return (
      <span className="rounded-full px-2.5 py-0.5 text-[10px] font-semibold portal-badge-success ring-1 ring-[color-mix(in_srgb,currentColor_25%,transparent)]">
        Return submitted
      </span>
    );
  return null;
}

const WORK_ORDER_BUCKET_LABEL: Record<ResidentWorkBucket, string> = {
  open: "Pending",
  scheduled: "Scheduled",
  completed: "Completed",
};

export function WorkOrderStatusBadge({ bucket }: { bucket: ResidentWorkBucket }) {
  const cls =
    bucket === "completed"
      ? "portal-badge-success"
      : "portal-badge-info";
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${cls} ring-1 ring-[color-mix(in_srgb,currentColor_25%,transparent)]`}>
      {WORK_ORDER_BUCKET_LABEL[bucket]}
    </span>
  );
}

/** Service fee summary for a request row (payments live on the Payments tab). */
export function requestChargesSummary(req: ServiceRequest): string {
  if (req.price?.trim()) {
    const paid = isServiceRequestFeePaid(req);
    if (req.status === "pending") return `Service fee ${req.price.trim()}`;
    return `Service fee ${req.price.trim()} · ${paid ? "Paid" : "Pending"}`;
  }
  if (req.priceLimit?.trim()) return `Price limit ${req.priceLimit.trim()}`;
  return "—";
}

export function ServiceRequestCard({
  req,
  onDelete,
  onEdit,
}: {
  req: ServiceRequest;
  onDelete: () => void;
  onEdit: () => void;
}) {
  const { showToast } = useAppUi();

  function removeRequest() {
    if (!window.confirm("Delete this service request? This cannot be undone.")) return;
    deleteServiceRequest(req.id);
    onDelete();
    showToast("Request deleted.");
  }

  const feePaid = isServiceRequestFeePaid(req);

  return (
    <>
      {req.offerDescription ? (
        <>
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Description</p>
          <p className="mt-1.5 text-sm whitespace-pre-wrap leading-relaxed">{req.offerDescription}</p>
        </>
      ) : null}
      {req.price ? (
        <>
          <p className="mt-3 text-xs font-medium uppercase tracking-wide text-muted">Service fee</p>
          <p className="mt-1 text-sm font-medium text-foreground">{req.price}</p>
        </>
      ) : req.priceLimit?.trim() ? (
        <>
          <p className="mt-3 text-xs font-medium uppercase tracking-wide text-muted">Price limit</p>
          <p className="mt-1 text-sm font-medium text-foreground">{req.priceLimit.trim()}</p>
          {req.status === "pending" ? (
            <p className="mt-1 text-xs text-muted">Your manager will confirm the final price before approving.</p>
          ) : null}
        </>
      ) : null}
      {hasDeposit(req.deposit) ? (
        <>
          <p className="mt-3 text-xs font-medium uppercase tracking-wide text-muted">Deposit</p>
          <p className="mt-1 text-sm font-medium text-foreground">{req.deposit}</p>
        </>
      ) : null}
      {req.notes ? (
        <>
          <p className="mt-3 text-xs font-medium uppercase tracking-wide text-muted">Notes</p>
          <p className="mt-1.5 text-sm whitespace-pre-wrap leading-relaxed">{req.notes}</p>
        </>
      ) : null}

      {req.status === "approved" && req.price?.trim() && !feePaid ? (
        <p className="mt-3 text-xs text-muted">
          Pay the service fee under <span className="font-medium text-foreground">Payments</span> when your manager approves the final amount.
        </p>
      ) : null}

      {req.status === "returned" && req.returnPhotoDataUrl ? (
        <>
          <p className="mt-3 text-xs font-medium uppercase tracking-wide text-muted">Return photo</p>
          <a href={req.returnPhotoDataUrl} target="_blank" rel="noreferrer" className="mt-2 block w-32 overflow-hidden rounded-xl border border-border">
            <Image
              src={req.returnPhotoDataUrl}
              alt="Return photo"
              width={128}
              height={96}
              className="h-24 w-full object-cover"
              unoptimized
            />
          </a>
          <p className="mt-1.5 text-xs text-muted">
            {req.depositPaid
              ? "Deposit refunded — return complete."
              : "Awaiting manager review to refund deposit."}
          </p>
        </>
      ) : null}

      {req.status === "denied" ? (
        <>
          <p className="mt-3 text-xs font-medium uppercase tracking-wide text-muted">Manager note</p>
          <p className="mt-1.5 text-sm text-muted">
            {req.managerNote ?? "This request was not approved. Contact your property manager for details."}
          </p>
        </>
      ) : null}

      <PortalTableDetailActions>
        {req.status === "pending" ? (
          <Button
            type="button"
            variant="outline"
            className={PORTAL_DETAIL_BTN}
            data-attr="resident-service-request-edit"
            onClick={onEdit}
          >
            Edit request
          </Button>
        ) : null}
        <Button
          type="button"
          variant="outline"
          className={PORTAL_DETAIL_BTN}
          onClick={removeRequest}
        >
          Delete request
        </Button>
      </PortalTableDetailActions>
    </>
  );
}

export function WorkOrderDetail({
  row,
  onEdit,
  onCancel,
}: {
  row: DemoManagerWorkOrderRow;
  onEdit: () => void;
  onCancel: () => void;
}) {
  const canModify = row.bucket === "open";
  return (
    <>
      <p className="text-xs font-medium uppercase tracking-wide text-muted">Priority</p>
      <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${priorityClass(row.priority)}`}>{row.priority}</span>
      <p className="mt-3 text-xs font-medium uppercase tracking-wide text-muted">Preferred arrival</p>
      <p className="mt-1 text-sm font-medium text-foreground">{row.preferredArrival ?? "Anytime"}</p>
      <p className="mt-3 text-xs font-medium uppercase tracking-wide text-muted">Details</p>
      <p className="mt-1.5 text-sm whitespace-pre-wrap leading-relaxed">{row.description}</p>
      {row.scheduled && row.scheduled !== "—" ? (
        <>
          <p className="mt-3 text-xs font-medium uppercase tracking-wide text-muted">Visit</p>
          <p className="mt-1 text-sm font-medium text-foreground">{row.scheduled}</p>
        </>
      ) : null}
      {row.cost && row.cost !== "—" ? (
        <>
          <p className="mt-3 text-xs font-medium uppercase tracking-wide text-muted">Cost</p>
          <p className="mt-1 text-sm font-medium text-foreground">{row.cost}</p>
        </>
      ) : null}
      {row.photoDataUrls?.length ? (
        <>
          <p className="mt-3 text-xs font-medium uppercase tracking-wide text-muted">Photos</p>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {row.photoDataUrls.map((src, i) => {
              const trimmed = src.trim();
              if (!SAFE_PHOTO_HREF_RE.test(trimmed)) return null;
              return (
                <a key={i} href={trimmed} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl border border-border bg-accent/30">
                  <Image src={trimmed} alt={`Photo ${i + 1}`} width={240} height={180} className="h-28 w-full object-cover" unoptimized />
                </a>
              );
            })}
          </div>
        </>
      ) : null}
      {canModify ? (
        <PortalTableDetailActions>
          <Button
            type="button"
            variant="outline"
            className={PORTAL_DETAIL_BTN}
            data-attr="resident-work-order-edit"
            onClick={onEdit}
          >
            Edit request
          </Button>
          <Button
            type="button"
            variant="outline"
            className={PORTAL_DETAIL_BTN}
            onClick={onCancel}
          >
            Cancel work order
          </Button>
        </PortalTableDetailActions>
      ) : null}
    </>
  );
}

export function ResidentServicesPanel({
  tabId,
  basePath,
}: {
  tabId: "requests" | "work-orders";
  basePath: string;
}) {
  const { showToast } = useAppUi();
  const session = usePortalSession();
  const photoInputRef = useRef<HTMLInputElement>(null);

  const [workOrderFilter, setWorkOrderFilter] = useState<WorkOrderFilterBucket>("pending");
  const [requestsFilter, setRequestsFilter] = useState<RequestStatusBucket>("pending");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const activeTab = tabId;

  // modal state
  const [modalMode, setModalMode] = useState<"none" | "maintenance" | "service">("none");

  // edit modals (resident edits their own items)
  const [editingRequest, setEditingRequest] = useState<ServiceRequest | null>(null);
  const [eNotes, setENotes] = useState("");
  const [editingWorkOrder, setEditingWorkOrder] = useState<DemoManagerWorkOrderRow | null>(null);
  const [wTitle, setWTitle] = useState("");
  const [wPriority, setWPriority] = useState("Medium");
  const [wArrivalPreset, setWArrivalPreset] = useState("Anytime");
  const [wArrivalCustom, setWArrivalCustom] = useState("");
  const [wDetails, setWDetails] = useState("");

  // maintenance form
  const [mTitle, setMTitle] = useState("");
  const [mCategory, setMCategory] = useState("Plumbing");
  const [mPriority, setMPriority] = useState("Medium");
  const [mArrivalPreset, setMArrivalPreset] = useState("Anytime");
  const [mArrivalCustom, setMArrivalCustom] = useState("");
  const [mPhotos, setMPhotos] = useState<string[]>([]);

  // service request form
  const [serviceMode, setServiceMode] = useState<"catalog" | "custom">("catalog");
  const [selectedOffer, setSelectedOffer] = useState<ManagerListingServiceOption | null>(null);
  const [customTitle, setCustomTitle] = useState("");
  const [customDescription, setCustomDescription] = useState("");
  const [customPriceLimit, setCustomPriceLimit] = useState("");
  const [sNotes, setSNotes] = useState("");
  const [maintenanceSubmitting, setMaintenanceSubmitting] = useState(false);
  const [serviceSubmitting, setServiceSubmitting] = useState(false);

  const [allRows, setAllRows] = useState<DemoManagerWorkOrderRow[]>([]);
  const [serviceRequests, setServiceRequests] = useState<ServiceRequest[]>([]);
  const [srTick, setSrTick] = useState(0);
  const [leaseTick, setLeaseTick] = useState(0);
  const [appTick, setAppTick] = useState(0);
  const [propertyTick, setPropertyTick] = useState(0);

  const residentEmail = session.email?.trim().toLowerCase() ?? "";

  function reloadServiceRequests() {
    if (!residentEmail) {
      setServiceRequests([]);
      return;
    }
    setServiceRequests(readServiceRequestsForResident(residentEmail));
  }

  // Memoize application lookup to avoid redundant scans
  const residentApplication = useMemo(() => {
    void allRows;
    void appTick;
    if (!residentEmail) return null;
    return readManagerApplicationRows().find(
      (r) => r.email?.trim().toLowerCase() === residentEmail,
    ) ?? null;
  }, [residentEmail, allRows, appTick]);

  // Memoize offer loading based on resident application data
  const offersForResident = useMemo(() => {
    void propertyTick;
    if (!residentApplication) return [];
    const propertyId =
      residentApplication.assignedPropertyId?.trim() ||
      residentApplication.propertyId?.trim() ||
      residentApplication.application?.propertyId?.trim() ||
      "";
    let managerUserId = residentApplication.managerUserId?.trim() || "";
    if (!managerUserId && propertyId) {
      managerUserId = getPropertyById(propertyId)?.managerUserId?.trim() || "";
    }

    const visibleToResident = (o: { available: boolean; residentEmails?: string[] }) => {
      if (!o.available) return false;
      if (!o.residentEmails?.length) return true;
      return o.residentEmails.some((e) => e.trim().toLowerCase() === residentEmail);
    };

    if (!propertyId) return [];

    if (!managerUserId) return [];
    const property = getPropertyById(propertyId);
    if (!property?.listingSubmission || property.listingSubmission.v !== 1) return [];
    const options = normalizeManagerListingSubmissionV1(property.listingSubmission).serviceRequestOptions ?? [];
    return options.filter(visibleToResident);
  }, [propertyTick, residentApplication, residentEmail]);

  const availableOffers = offersForResident;

  // Initial data sync — fire syncs sequentially to avoid overwhelming the server/browser
  useEffect(() => {
    const sync = () => setAllRows(readManagerWorkOrderRows());
    const onProperty = () => setPropertyTick((t) => t + 1);
    queueMicrotask(() => sync());
    void syncManagerWorkOrdersFromServer()
      .then(sync)
      .then(() => syncManagerApplicationsFromServer())
      .then(() => setAppTick((t) => t + 1))
      .then(() => syncPropertyPipelineFromServer())
      .then(() => setPropertyTick((t) => t + 1))
      .then(() => syncLeasePipelineFromServer())
      // The resident/admin-scoped sync above never returns a resident's own
      // property (it's scoped to properties the caller manages), so hydrate
      // it separately — needed for e.g. manager-offered service requests.
      .then(() => loadResidentPropertyFromServer())
      .then(() => setPropertyTick((t) => t + 1));
    
    window.addEventListener(MANAGER_WORK_ORDERS_EVENT, sync);
    window.addEventListener(PROPERTY_PIPELINE_EVENT, onProperty);
    return () => {
      window.removeEventListener(MANAGER_WORK_ORDERS_EVENT, sync);
      window.removeEventListener(PROPERTY_PIPELINE_EVENT, onProperty);
    };
  }, []);

  useEffect(() => {
    queueMicrotask(() => reloadServiceRequests());
    void syncServiceRequestsFromServer();
    const onSr = () => setSrTick((t) => t + 1);
    window.addEventListener(SERVICE_REQUESTS_EVENT, onSr);
    return () => {
      window.removeEventListener(SERVICE_REQUESTS_EVENT, onSr);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [residentEmail]);

  useEffect(() => {
    const onLease = () => setLeaseTick((t) => t + 1);
    window.addEventListener(LEASE_PIPELINE_EVENT, onLease);
    return () => {
      window.removeEventListener(LEASE_PIPELINE_EVENT, onLease);
    };
  }, []);

  useEffect(() => {
    queueMicrotask(() => reloadServiceRequests());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [srTick]);

  // Only show maintenance work orders (not old service type rows)
  const myRows = useMemo(() => {
    if (!residentEmail) return [];
    return allRows.filter(
      (r) =>
        r.residentEmail?.trim().toLowerCase() === residentEmail &&
        (r as DemoManagerWorkOrderRow & { requestType?: string }).requestType !== "service",
    );
  }, [allRows, residentEmail]);

  const rows = useMemo(
    () => myRows.filter((r) => workOrderFilterBucket(r) === workOrderFilter),
    [myRows, workOrderFilter],
  );

  const workOrderFilterCounts = useMemo(() => {
    const c: Record<WorkOrderFilterBucket, number> = { pending: 0, scheduled: 0, completed: 0 };
    for (const r of myRows) c[workOrderFilterBucket(r)] += 1;
    return c;
  }, [myRows]);

  const sortedRequests = useMemo(
    () =>
      [...serviceRequests].sort((a, b) => {
        const ta = new Date(a.requestedAt).getTime();
        const tb = new Date(b.requestedAt).getTime();
        return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0);
      }),
    [serviceRequests],
  );

  const requestsCounts = useMemo(() => {
    const c: Record<RequestStatusBucket, number> = { pending: 0, completed: 0, denied: 0 };
    for (const req of sortedRequests) c[serviceRequestStatusBucket(req)] += 1;
    return c;
  }, [sortedRequests]);

  const filteredRequests = useMemo(
    () => sortedRequests.filter((req) => serviceRequestStatusBucket(req) === requestsFilter),
    [sortedRequests, requestsFilter],
  );

  function openRequestEdit(req: ServiceRequest) {
    setEditingRequest(req);
    setENotes(req.notes);
  }

  function saveRequestEdit() {
    if (!editingRequest) return;
    updateServiceRequest(editingRequest.id, {
      notes: eNotes.trim(),
    });
    setEditingRequest(null);
    reloadServiceRequests();
    showToast("Request updated.");
  }

  function openWorkOrderEdit(row: DemoManagerWorkOrderRow) {
    setEditingWorkOrder(row);
    setWTitle(row.title);
    setWPriority(row.priority || "Medium");
    const parsed = parsePreferredArrival(row.preferredArrival);
    setWArrivalPreset(parsed.preset);
    setWArrivalCustom(parsed.custom);
    setWDetails(row.description);
  }

  function saveWorkOrderEdit() {
    if (!editingWorkOrder) return;
    if (!wTitle.trim()) {
      showToast("Add a title first.");
      return;
    }
    updateManagerWorkOrder(editingWorkOrder.id, (r) => ({
      ...r,
      title: wTitle.trim(),
      priority: wPriority,
      preferredArrival: formatPreferredArrival(wArrivalPreset, wArrivalCustom),
      description: wDetails.trim() || r.description,
    }));
    setAllRows(readManagerWorkOrderRows());
    setEditingWorkOrder(null);
    showToast("Work order updated.");
  }

  function cancelWorkOrder(id: string) {
    if (!window.confirm("Cancel this work order? This cannot be undone.")) return;
    deleteManagerWorkOrderRow(id);
    setAllRows(readManagerWorkOrderRows());
    setExpandedId(null);
    showToast("Work order removed.");
  }

  const residentLeaseRow = useMemo(() => {
    void leaseTick;
    if (!residentEmail) return null;
    return findLeaseForResidentEmail(residentEmail);
  }, [leaseTick, residentEmail]);

  const servicesUnlocked = Boolean(residentLeaseRow && hasBothLeaseSignatures(residentLeaseRow));

  if (!servicesUnlocked && modalMode !== "none") {
    setModalMode("none");
  }

  const fileToDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
      reader.readAsDataURL(file);
    });

  const onPickPhotos = async (files: FileList | null) => {
    if (!files?.length) return;
    const remaining = 6 - mPhotos.length;
    if (remaining <= 0) { showToast("Up to 6 photos."); return; }
    const next = [...mPhotos];
    for (let i = 0; i < Math.min(files.length, remaining); i++) {
      const file = files[i];
      if (!file) continue;
      if (!file.type.startsWith("image/")) { showToast("Images only."); return; }
      next.push(await fileToDataUrl(file));
    }
    setMPhotos(next);
  };

  const resetMaintenance = () => {
    setMTitle("");
    setMCategory("Plumbing");
    setMPriority("Medium");
    setMArrivalPreset("Anytime");
    setMArrivalCustom("");
    setMPhotos([]);
    if (photoInputRef.current) photoInputRef.current.value = "";
  };
  const resetService = () => {
    setServiceMode(availableOffers.length > 0 ? "catalog" : "custom");
    setSelectedOffer(null);
    setCustomTitle("");
    setCustomDescription("");
    setCustomPriceLimit("");
    setSNotes("");
  };

  function getApplication() {
    return residentApplication || readManagerApplicationRows().find((r) => r.email?.trim().toLowerCase() === residentEmail);
  }

  const submitMaintenance = async () => {
    if (maintenanceSubmitting) return;
    if (!servicesUnlocked) {
      showToast("Services unlock after your lease is fully signed.");
      return;
    }
    if (!mTitle.trim()) { showToast("Add a title first."); return; }
    if (!residentEmail) { showToast("Sign in to submit."); return; }
    setMaintenanceSubmitting(true);
    try {
    const application = getApplication();
    const propertyId =
      application?.assignedPropertyId?.trim() ||
      application?.propertyId?.trim() ||
      application?.application?.propertyId?.trim() ||
      "";
    let managerUserId = application?.managerUserId?.trim() || "";
    if (!managerUserId && propertyId) {
      managerUserId = getPropertyById(propertyId)?.managerUserId?.trim() || "";
    }
    if (!managerUserId) {
      showToast("Could not find your property manager. Contact support.");
      return;
    }
    const propertyLabel =
      application?.property ||
      getPropertyById(propertyId)?.address.split(",")[0]?.trim() ||
      "Assigned house";
    const row: DemoManagerWorkOrderRow & { requestType: string } = {
      id: `REQ-${Date.now()}`,
      requestType: "maintenance",
      propertyName: propertyLabel,
      propertyId,
      assignedPropertyId: application?.assignedPropertyId,
      assignedRoomChoice: application?.assignedRoomChoice || application?.application?.roomChoice1,
      managerUserId,
      unit: application?.assignedRoomChoice || application?.application?.roomChoice1 || "—",
      title: mTitle.trim(),
      priority: mPriority,
      status: "Submitted",
      bucket: "open",
      category: workOrderCategoryForResidentLabel(mCategory),
      description: `${mCategory}: Your request is logged. Maintenance will review and update this thread.`,
      scheduled: "—",
      cost: "—",
      preferredArrival: formatPreferredArrival(mArrivalPreset, mArrivalCustom),
      residentName: application?.name,
      residentEmail,
      photoDataUrls: mPhotos,
    };
    writeManagerWorkOrderRows([row, ...readManagerWorkOrderRows()]);
    setAllRows(readManagerWorkOrderRows());
    setExpandedId(row.id);
    const notifyResult = await notifyManagerOfResidentSubmission({
      managerUserId,
      residentName: application?.name || residentEmail,
      residentEmail,
      propertyName: propertyLabel,
      propertyId,
      title: row.title,
      kind: "work-order",
      details: [
        `Request ID: ${row.id}`,
        `Category: ${mCategory}`,
        `Priority: ${mPriority}`,
        `Preferred arrival: ${row.preferredArrival ?? "Anytime"}`,
        `Details: ${row.description}`,
        mPhotos.length > 0 ? `Attached photos: ${mPhotos.length}` : "",
      ],
    });
    showToast("Maintenance request submitted.");
    if (!notifyResult.ok) {
      showToast("Request submitted, but manager notification could not be sent.");
    }
    resetMaintenance();
    setModalMode("none");
    } finally {
      setMaintenanceSubmitting(false);
    }
  };

  const submitService = async () => {
    if (serviceSubmitting) return;
    if (!servicesUnlocked) {
      showToast("Services unlock after your lease is fully signed.");
      return;
    }
    if (!residentEmail) { showToast("Sign in to submit."); return; }

    const isCustom = serviceMode === "custom" || availableOffers.length === 0;
    if (isCustom) {
      if (!customTitle.trim()) { showToast("Add a title for your request."); return; }
      const limitAmount = parseMoneyAmount(customPriceLimit.trim());
      if (!Number.isFinite(limitAmount) || limitAmount <= 0) {
        showToast("Enter a valid price limit.");
        return;
      }
    } else {
      if (!selectedOffer) { showToast("Select a service first."); return; }
    }

    setServiceSubmitting(true);
    try {
    const application = getApplication();
    const propertyId =
      application?.assignedPropertyId?.trim() ||
      application?.propertyId?.trim() ||
      application?.application?.propertyId?.trim() ||
      "";
    if (!propertyId) {
      showToast("No property assignment found. Contact support.");
      return;
    }
    let managerUserId = application?.managerUserId?.trim() || "";
    if (!managerUserId && propertyId) {
      managerUserId = getPropertyById(propertyId)?.managerUserId?.trim() || "";
    }
    if (!managerUserId) { showToast("Could not find your property manager. Contact support."); return; }

    let offerId: string;
    let offerName: string;
    let offerDescription: string;
    let price: string;
    let priceLimit: string | undefined;
    let deposit: string;
    let notifyTitle: string;
    let notifyDetails: string[];

    if (isCustom) {
      const limitLabel = customPriceLimit.trim().startsWith("$")
        ? customPriceLimit.trim()
        : `$${parseMoneyAmount(customPriceLimit.trim())}`;
      offerId = CUSTOM_SERVICE_REQUEST_OFFER_ID;
      offerName = customTitle.trim();
      offerDescription = customDescription.trim();
      price = "";
      priceLimit = limitLabel;
      deposit = "";
      notifyTitle = offerName;
      notifyDetails = [
        "Custom request",
        `Price limit: ${limitLabel}`,
        offerDescription ? `Details: ${offerDescription}` : "",
        sNotes.trim() ? `Resident notes: ${sNotes.trim()}` : "",
      ];
    } else {
      const currentOffer = availableOffers.find((offer) => offer.id === selectedOffer!.id) ?? null;
      if (!currentOffer) {
        showToast("That request option is no longer available. Please choose another.");
        setSelectedOffer(null);
        return;
      }
      offerId = currentOffer.id;
      offerName = currentOffer.name;
      offerDescription = currentOffer.description;
      price = currentOffer.price;
      deposit = currentOffer.deposit;
      notifyTitle = currentOffer.name;
      notifyDetails = [
        `Offer: ${currentOffer.name}`,
        currentOffer.description ? `Offer details: ${currentOffer.description}` : "",
        currentOffer.price ? `Price: ${currentOffer.price}` : "",
        hasDeposit(currentOffer.deposit) ? `Deposit: ${currentOffer.deposit}` : "",
        sNotes.trim() ? `Resident notes: ${sNotes.trim()}` : "",
      ];
    }

    const createdRequest = createServiceRequest({
      offerId,
      offerName,
      offerDescription,
      price,
      priceLimit,
      deposit,
      residentEmail,
      residentName: application?.name || residentEmail,
      managerUserId,
      propertyId,
      returnByDate: "",
      notes: sNotes.trim(),
    });
    const propertyLabel =
      application?.property ||
      getPropertyById(propertyId)?.address.split(",")[0]?.trim() ||
      "Assigned house";
    const notifyResult = await notifyManagerOfResidentSubmission({
      managerUserId,
      residentName: application?.name || residentEmail,
      residentEmail,
      propertyName: propertyLabel,
      propertyId,
      title: notifyTitle,
      kind: "service-request",
      details: [`Request ID: ${createdRequest.id}`, ...notifyDetails.filter(Boolean)],
    });
    showToast(`${notifyTitle} requested — awaiting manager approval.`);
    if (!notifyResult.ok) {
      showToast("Request submitted, but manager notification could not be sent.");
    }
    resetService();
    setModalMode("none");
    reloadServiceRequests();
    } finally {
      setServiceSubmitting(false);
    }
  };

  return (
    <ManagerPortalPageShell
      title="Services"
      titleAside={
        activeTab === "work-orders" ? (
          <Button
            type="button"
            className={`rounded-full ${PORTAL_HEADER_ACTION_BTN}`}
            disabled={!servicesUnlocked}
            onClick={() => {
              if (!servicesUnlocked) {
                showToast("Services unlock after your lease is fully signed.");
                return;
              }
              setModalMode("maintenance");
            }}
          >
            Report
          </Button>
        ) : (
          <Button
            type="button"
            className={`rounded-full ${PORTAL_HEADER_ACTION_BTN}`}
            disabled={!servicesUnlocked}
            onClick={() => {
              if (!servicesUnlocked) {
                showToast("Services unlock after your lease is fully signed.");
                return;
              }
              setServiceMode(availableOffers.length > 0 ? "catalog" : "custom");
              setModalMode("service");
            }}
          >
            Submit request
          </Button>
        )
      }
      filterRow={
        <ManagerPortalFilterRow>
          <TabNav
            activeId={activeTab}
            items={[
              { id: "requests", label: "Requests", href: `${basePath}/services/requests` },
              { id: "work-orders", label: "Work orders", href: `${basePath}/services/work-orders` },
            ]}
          />
        </ManagerPortalFilterRow>
      }
    >
      <input ref={photoInputRef} type="file" accept="image/*" multiple className="sr-only" onChange={(e) => { void onPickPhotos(e.target.files); }} />

      {!servicesUnlocked ? (
        <div className="glass-card mb-4 rounded-2xl px-4 py-4 text-sm text-muted [html[data-native]_&]:hidden">
          <p className="font-medium text-foreground">Services unlock after your lease is fully signed</p>
          <p className="mt-1">Maintenance and service requests become available once you and your manager have both signed.</p>
        </div>
      ) : null}

      {activeTab === "requests" ? (
        <div>
          <div className="mb-3 w-fit max-w-full">
            <PillTabs
              items={REQUEST_STATUS_TABS.map(({ id, label }) => ({
                id,
                label: pillLabelWithCount(label, requestsCounts[id]),
              }))}
              activeId={requestsFilter}
              onChange={(id) => setRequestsFilter(id as RequestStatusBucket)}
            />
          </div>

          {sortedRequests.length === 0 ? (
            <PortalDataTableEmpty message="No service requests yet." icon="service" />
          ) : filteredRequests.length === 0 ? (
            <PortalDataTableEmpty message="No requests in this status yet." icon="service" />
          ) : (
        <>
        <div className="space-y-2 lg:hidden">
          {filteredRequests.map((req) => {
            const rowId = `request-${req.id}`;
            const expanded = expandedId === rowId;
            return (
              <PortalMobileSummaryCard
                key={rowId}
                title={req.offerName}
                expanded={expanded}
                onClick={() => setExpandedId((c) => (c === rowId ? null : rowId))}
              >
                {expanded ? (
                  <ServiceRequestCard
                    req={req}
                    onDelete={reloadServiceRequests}
                    onEdit={() => openRequestEdit(req)}
                  />
                ) : null}
              </PortalMobileSummaryCard>
            );
          })}
        </div>
        <div className={`${PORTAL_DATA_TABLE_WRAP} hidden lg:block`}>
            <div className={PORTAL_DATA_TABLE_SCROLL}>
              <table className="w-full table-fixed border-collapse text-left text-sm">
                <thead>
                  <tr className={PORTAL_TABLE_HEAD_ROW}>
                    <th className={`${MANAGER_TABLE_TH} text-left`}>Title</th>
                    <th className={PORTAL_TABLE_EXPAND_TH}>
                      <span className="sr-only">Expand</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRequests.map((req) => {
                    const rowId = `request-${req.id}`;
                    return (
                      <Fragment key={rowId}>
                        <tr
                          className={PORTAL_TABLE_TR_EXPANDABLE}
                          onClick={createPortalRowExpandClick(() =>
                            setExpandedId((c) => (c === rowId ? null : rowId)),
                          )}
                          aria-expanded={expandedId === rowId}
                        >
                          <td className={`${PORTAL_TABLE_TD} font-medium text-foreground`}>{req.offerName}</td>
                          <PortalTableExpandCell expanded={expandedId === rowId} />
                        </tr>
                        {expandedId === rowId ? (
                          <tr className={PORTAL_TABLE_DETAIL_ROW}>
                            <td colSpan={2} className={PORTAL_TABLE_DETAIL_CELL}>
                              <ServiceRequestCard
                                req={req}
                                onDelete={reloadServiceRequests}
                                onEdit={() => openRequestEdit(req)}
                              />
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
        </>
          )}
        </div>
      ) : (
        <div>
          <div className="mb-3 w-fit max-w-full">
            <PillTabs
              items={WORK_ORDER_FILTER_TABS.map(({ id, label }) => ({
                id,
                label: pillLabelWithCount(label, workOrderFilterCounts[id]),
              }))}
              activeId={workOrderFilter}
              onChange={(id) => setWorkOrderFilter(id as WorkOrderFilterBucket)}
            />
          </div>

          {rows.length === 0 ? (
            <PortalDataTableEmpty
              icon="work-order"
              message={
                myRows.length === 0 ? "No work orders yet." : "No work orders in this status yet."
              }
            />
          ) : (
            <>
            <div className="space-y-2 lg:hidden">
              {rows.map((row) => {
                const expanded = expandedId === row.id;
                return (
                  <PortalMobileSummaryCard
                    key={row.id}
                    title={row.title}
                    expanded={expanded}
                    onClick={() => setExpandedId((c) => (c === row.id ? null : row.id))}
                  >
                    {expanded ? (
                      <WorkOrderDetail
                        row={row}
                        onEdit={() => openWorkOrderEdit(row)}
                        onCancel={() => cancelWorkOrder(row.id)}
                      />
                    ) : null}
                  </PortalMobileSummaryCard>
                );
              })}
            </div>
            <div className={`${PORTAL_DATA_TABLE_WRAP} hidden lg:block`}>
              <div className={PORTAL_DATA_TABLE_SCROLL}>
                <table className="w-full table-fixed border-collapse text-left text-sm">
                  <thead>
                    <tr className={PORTAL_TABLE_HEAD_ROW}>
                      <th className={`${MANAGER_TABLE_TH} text-left`}>Title</th>
                      <th className={PORTAL_TABLE_EXPAND_TH}>
                        <span className="sr-only">Expand</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <Fragment key={row.id}>
                        <tr
                          className={PORTAL_TABLE_TR_EXPANDABLE}
                          onClick={createPortalRowExpandClick(() =>
                            setExpandedId((c) => (c === row.id ? null : row.id)),
                          )}
                          aria-expanded={expandedId === row.id}
                        >
                          <td className={`${PORTAL_TABLE_TD} font-medium text-foreground`}>{row.title}</td>
                          <PortalTableExpandCell expanded={expandedId === row.id} />
                        </tr>
                        {expandedId === row.id ? (
                          <tr className={PORTAL_TABLE_DETAIL_ROW}>
                            <td colSpan={2} className={`${PORTAL_TABLE_DETAIL_CELL} text-sm text-muted`}>
                              <WorkOrderDetail
                                row={row}
                                onEdit={() => openWorkOrderEdit(row)}
                                onCancel={() => cancelWorkOrder(row.id)}
                              />
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            </>
          )}
        </div>
      )}

      {/* Maintenance modal */}
      <Modal
        open={modalMode === "maintenance"}
        title="Report maintenance"
        onClose={() => { setModalMode("none"); resetMaintenance(); }}
        panelClassName="max-w-lg"
      >
        <p className="text-xs text-muted">Describe the issue — your property manager will be notified.</p>
        <div className="mt-4 grid gap-3">
          <div>
            <p className="mb-1 text-[11px] font-medium text-muted">Title</p>
            <Input value={mTitle} onChange={(e) => setMTitle(e.target.value)} placeholder="Short summary of the issue" className="bg-card" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="mb-1 text-[11px] font-medium text-muted">Category</p>
              <Select value={mCategory} onChange={(e) => setMCategory(e.target.value)} className="bg-card">
                <option>Plumbing</option>
                <option>Electrical</option>
                <option>HVAC</option>
                <option>Appliance</option>
                <option>Access / Locks</option>
                <option>General</option>
              </Select>
            </div>
            <div>
              <p className="mb-1 text-[11px] font-medium text-muted">Priority</p>
              <Select value={mPriority} onChange={(e) => setMPriority(e.target.value)} className="bg-card">
                <option>Low</option>
                <option>Medium</option>
                <option>High</option>
              </Select>
            </div>
          </div>
          <PreferredArrivalField
            preset={mArrivalPreset}
            custom={mArrivalCustom}
            onPresetChange={setMArrivalPreset}
            onCustomChange={setMArrivalCustom}
          />
          <div>
            <p className="mb-1 text-[11px] font-medium text-muted">Photos (up to 6)</p>
            <Button type="button" variant="outline" className="w-fit rounded-full text-xs" onClick={() => photoInputRef.current?.click()}>
              Attach photos
            </Button>
          </div>
          {mPhotos.length ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {mPhotos.map((src, i) => (
                <div key={i} className="overflow-hidden rounded-xl border border-border bg-accent/30">
                  <Image src={src} alt={`Photo ${i + 1}`} width={240} height={180} className="h-24 w-full object-cover" unoptimized />
                  <div className="flex justify-start p-2">
                    <Button type="button" variant="outline" className="h-8 rounded-full px-3 text-[11px]" onClick={() => setMPhotos((p) => p.filter((_, j) => j !== i))}>
                      Remove
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
        <div className="mt-6 flex flex-wrap justify-start gap-2 border-t border-border pt-4">
          <Button type="button" className="rounded-full" onClick={() => { void submitMaintenance(); }} disabled={maintenanceSubmitting}>
            {maintenanceSubmitting ? "Submitting…" : "Submit"}
          </Button>
        </div>
      </Modal>

      {/* Request modal */}
      <Modal
        open={modalMode === "service"}
        title="Submit request"
        onClose={() => { setModalMode("none"); resetService(); }}
        panelClassName="max-w-lg"
      >
        {availableOffers.length > 0 ? (
          <div className="mb-4 w-fit max-w-full">
            <PillTabs
              items={[
                { id: "catalog", label: "Catalog" },
                { id: "custom", label: "Custom request" },
              ]}
              activeId={serviceMode}
              onChange={(id) => {
                setServiceMode(id as "catalog" | "custom");
                setSelectedOffer(null);
              }}
            />
          </div>
        ) : null}

        {serviceMode === "catalog" && availableOffers.length > 0 ? (
          <>
            <p className="text-xs text-muted">Select a request option from your manager&apos;s catalog.</p>
            <div className="mt-4 space-y-2">
              {availableOffers.map((offer) => (
                <button
                  key={offer.id}
                  type="button"
                  onClick={() => { setSelectedOffer((cur) => (cur?.id === offer.id ? null : offer)); }}
                  className={`w-full rounded-xl border px-4 py-3 text-left transition ${
                    selectedOffer?.id === offer.id
                      ? "border-primary/30 bg-accent/30 ring-1 ring-primary/20"
                      : "border-border bg-card hover:border-border hover:bg-accent/30"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-foreground">{offer.name}</p>
                      {offer.description ? <p className="mt-1 text-xs leading-relaxed text-muted">{offer.description}</p> : null}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      {offer.price ? (
                        <span className="rounded-full bg-accent/30 px-2.5 py-0.5 text-xs font-semibold text-muted">{offer.price}</span>
                      ) : null}
                      {hasDeposit(offer.deposit) ? (
                        <span className="rounded-full px-2.5 py-0.5 text-[10px] font-semibold portal-badge-pending ring-1 ring-[color-mix(in_srgb,currentColor_25%,transparent)]">Deposit {offer.deposit}</span>
                      ) : null}
                    </div>
                  </div>
                </button>
              ))}
            </div>

            {selectedOffer ? (
              <div className="mt-4 space-y-3">
                <div>
                  <p className="mb-1 text-[11px] font-medium text-muted">Additional notes (optional)</p>
                  <Input value={sNotes} onChange={(e) => setSNotes(e.target.value)} placeholder="Preferred timing, special instructions…" className="bg-card" />
                </div>
              </div>
            ) : null}
          </>
        ) : (
          <>
            <p className="text-xs text-muted">
              Describe what you need and your max budget. Your manager will set the final price and approve the request.
            </p>
            <div className="mt-4 space-y-3">
              <div>
                <p className="mb-1 text-[11px] font-medium text-muted">
                  Request title <span className="text-rose-500">*</span>
                </p>
                <Input
                  value={customTitle}
                  onChange={(e) => setCustomTitle(e.target.value)}
                  placeholder="e.g. Extra storage bin"
                  className="bg-card"
                />
              </div>
              <div>
                <p className="mb-1 text-[11px] font-medium text-muted">Details (optional)</p>
                <Textarea
                  value={customDescription}
                  onChange={(e) => setCustomDescription(e.target.value)}
                  placeholder="Size, timing, or other details…"
                  className="min-h-[72px] bg-card"
                />
              </div>
              <div>
                <p className="mb-1 text-[11px] font-medium text-muted">
                  Price limit <span className="text-rose-500">*</span>
                </p>
                <Input
                  value={customPriceLimit}
                  onChange={(e) => setCustomPriceLimit(e.target.value)}
                  placeholder="$50"
                  inputMode="decimal"
                  className="bg-card"
                />
                <p className="mt-1 text-[10px] text-muted">Maximum you&apos;re willing to pay — your manager confirms the final amount.</p>
              </div>
              <div>
                <p className="mb-1 text-[11px] font-medium text-muted">Additional notes (optional)</p>
                <Input value={sNotes} onChange={(e) => setSNotes(e.target.value)} placeholder="Anything else your manager should know…" className="bg-card" />
              </div>
            </div>
          </>
        )}

        <div className="mt-6 flex flex-wrap justify-start gap-2 border-t border-border pt-4">
          <Button
            type="button"
            className="rounded-full"
            onClick={() => { void submitService(); }}
            disabled={
              serviceSubmitting ||
              (serviceMode === "catalog" && availableOffers.length > 0
                ? !selectedOffer
                : !customTitle.trim() || !customPriceLimit.trim())
            }
          >
            {serviceSubmitting ? "Sending…" : "Send request"}
          </Button>
        </div>
      </Modal>

      {/* Edit service request modal */}
      <Modal
        open={editingRequest !== null}
        title="Edit request"
        onClose={() => setEditingRequest(null)}
        panelClassName="max-w-lg"
      >
        {editingRequest ? (
          <>
            <p className="text-xs text-muted">
              Update the details of your <span className="font-semibold text-foreground">{editingRequest.offerName}</span> request.
              Pricing is set by your manager and can&apos;t be changed here.
            </p>
            <div className="mt-4 grid gap-3">
              <div>
                <p className="mb-1 text-[11px] font-medium text-muted">Notes</p>
                <Textarea
                  value={eNotes}
                  onChange={(e) => setENotes(e.target.value)}
                  placeholder="Preferred timing, special instructions…"
                  rows={3}
                  className="bg-card"
                />
              </div>
            </div>
          </>
        ) : null}
        <div className="mt-6 flex flex-wrap justify-start gap-2 border-t border-border pt-4">
          <Button type="button" className="rounded-full" data-attr="resident-service-request-edit-save" onClick={saveRequestEdit}>
            Save changes
          </Button>
        </div>
      </Modal>

      {/* Edit work order modal */}
      <Modal
        open={editingWorkOrder !== null}
        title="Edit work order"
        onClose={() => setEditingWorkOrder(null)}
        panelClassName="max-w-lg"
      >
        <p className="text-xs text-muted">Update your maintenance request — your property manager sees these changes.</p>
        <div className="mt-4 grid gap-3">
          <div>
            <p className="mb-1 text-[11px] font-medium text-muted">Title</p>
            <Input value={wTitle} onChange={(e) => setWTitle(e.target.value)} placeholder="Short summary of the issue" className="bg-card" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="mb-1 text-[11px] font-medium text-muted">Priority</p>
              <Select value={wPriority} onChange={(e) => setWPriority(e.target.value)} className="bg-card">
                <option>Low</option>
                <option>Medium</option>
                <option>High</option>
              </Select>
            </div>
            <PreferredArrivalField
              preset={wArrivalPreset}
              custom={wArrivalCustom}
              onPresetChange={setWArrivalPreset}
              onCustomChange={setWArrivalCustom}
            />
          </div>
          <div>
            <p className="mb-1 text-[11px] font-medium text-muted">Details</p>
            <Textarea
              value={wDetails}
              onChange={(e) => setWDetails(e.target.value)}
              placeholder="Describe the issue"
              rows={4}
              className="bg-card"
            />
          </div>
        </div>
        <div className="mt-6 flex flex-wrap justify-start gap-2 border-t border-border pt-4">
          <Button type="button" className="rounded-full" data-attr="resident-work-order-edit-save" onClick={saveWorkOrderEdit}>
            Save changes
          </Button>
        </div>
      </Modal>
    </ManagerPortalPageShell>
  );
}
