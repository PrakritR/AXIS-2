"use client";

import Image from "next/image";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatPacificDate } from "@/lib/pacific-time";
import { Select } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { useAppUi } from "@/components/providers/app-ui-provider";
import {
  MANAGER_TABLE_TH,
  ManagerPortalPageShell,
  ManagerPortalStatusPills,
} from "@/components/portal/portal-metrics";
import {
  PORTAL_DATA_TABLE_SCROLL,
  PORTAL_DATA_TABLE_WRAP,
  PortalDataTableEmpty,
  PORTAL_DETAIL_BTN,
  PORTAL_TABLE_DETAIL_CELL,
  PORTAL_TABLE_DETAIL_ROW,
  PORTAL_TABLE_HEAD_ROW,
  PORTAL_TABLE_ROW_TOGGLE_CLASS,
  PORTAL_TABLE_TR,
  PORTAL_TABLE_TD,
  PortalTableDetailActions,
} from "@/components/portal/portal-data-table";
import type { DemoManagerWorkOrderRow, ResidentWorkBucket } from "@/data/demo-portal";
import { usePortalSession } from "@/hooks/use-portal-session";
import {
  MANAGER_WORK_ORDERS_EVENT,
  deleteManagerWorkOrderRow,
  readManagerWorkOrderRows,
  syncManagerWorkOrdersFromServer,
  writeManagerWorkOrderRows,
} from "@/lib/manager-work-orders-storage";
import { readManagerApplicationRows, syncManagerApplicationsFromServer } from "@/lib/manager-applications-storage";
import { readAmenityOffersForManager, readAmenityOffersForProperty, readAllAmenityOffersForProperty, type ManagerAmenityOffer } from "@/lib/manager-amenity-catalog-storage";
import { getPropertyById } from "@/lib/rental-application/data";
import {
  SERVICE_REQUESTS_EVENT,
  createServiceRequest,
  deleteServiceRequest,
  readServiceRequestsForResident,
  submitReturnPhoto,
  hasDeposit,
  type ServiceRequest,
} from "@/lib/service-requests-storage";
import {
  LEASE_PIPELINE_EVENT,
  findLeaseForResidentEmail,
  hasBothLeaseSignatures,
  syncLeasePipelineFromServer,
} from "@/lib/lease-pipeline-storage";

const STATUS_TABS: { id: ResidentWorkBucket; label: string }[] = [
  { id: "open", label: "Open" },
  { id: "scheduled", label: "Scheduled" },
  { id: "completed", label: "Completed" },
];

function priorityClass(p: string) {
  const x = p.toLowerCase();
  if (x === "high") return "bg-rose-50 text-rose-800 ring-1 ring-rose-200/80";
  if (x === "medium") return "bg-amber-50 text-amber-900 ring-1 ring-amber-200/80";
  return "bg-slate-100 text-slate-700 ring-1 ring-slate-200/80";
}

function formatDate(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return formatPacificDate(d, { month: "short", day: "numeric", year: "numeric" });
}

function ServiceStatusBadge({ status }: { status: ServiceRequest["status"] }) {
  if (status === "pending")
    return (
      <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-[10px] font-semibold text-amber-700 ring-1 ring-amber-200">
        Awaiting approval
      </span>
    );
  if (status === "approved")
    return (
      <span className="rounded-full bg-violet-50 px-2.5 py-0.5 text-[10px] font-semibold text-violet-700 ring-1 ring-violet-200">
        Approved
      </span>
    );
  if (status === "denied")
    return (
      <span className="rounded-full bg-rose-50 px-2.5 py-0.5 text-[10px] font-semibold text-rose-700 ring-1 ring-rose-200">
        Denied
      </span>
    );
  if (status === "returned")
    return (
      <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-200">
        Return submitted
      </span>
    );
  return null;
}

function ServiceRequestCard({
  req,
  onReturnPhotoUploaded,
  onDelete,
}: {
  req: ServiceRequest;
  onReturnPhotoUploaded: () => void;
  onDelete: () => void;
}) {
  const { showToast } = useAppUi();
  const returnPhotoRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const needsReturn = hasDeposit(req.deposit);
  // Show checkout procedure once service charge is paid (and item has deposit, so needs return)
  const showCheckout = req.status === "approved" && req.servicePaid && needsReturn && !req.returnPhotoDataUrl;

  async function handleReturnPhoto(files: FileList | null) {
    if (!files?.[0]) return;
    const file = files[0];
    if (!file.type.startsWith("image/")) { showToast("Images only."); return; }
    setUploading(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ""));
        reader.onerror = () => reject(new Error("Read error"));
        reader.readAsDataURL(file);
      });
      submitReturnPhoto(req.id, dataUrl);
      onReturnPhotoUploaded();
      showToast("Return photo submitted! Your manager will review it.");
    } catch {
      showToast("Could not upload photo.");
    } finally {
      setUploading(false);
      if (returnPhotoRef.current) returnPhotoRef.current.value = "";
    }
  }

  function removeRequest() {
    if (!window.confirm("Delete this service request? This cannot be undone.")) return;
    deleteServiceRequest(req.id);
    onDelete();
    showToast("Service request deleted.");
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_1px_4px_rgba(15,23,42,0.06)]">
      <input
        ref={returnPhotoRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(e) => { void handleReturnPhoto(e.target.files); }}
      />
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-slate-900">{req.offerName}</p>
          {req.offerDescription ? (
            <p className="mt-0.5 text-xs text-slate-500">{req.offerDescription}</p>
          ) : null}
        </div>
        <ServiceStatusBadge status={req.status} />
      </div>

      {/* Price / deposit / return date */}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {req.price ? (
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-semibold text-slate-700">
            {req.price}
          </span>
        ) : null}
        {needsReturn ? (
          <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-[10px] font-semibold text-amber-700 ring-1 ring-amber-200">
            Deposit {req.deposit}
          </span>
        ) : null}
        {req.returnByDate ? (
          <span className="rounded-full bg-slate-50 px-2.5 py-0.5 text-[10px] font-semibold text-slate-600 ring-1 ring-slate-200">
            Return by {formatDate(req.returnByDate)}
          </span>
        ) : null}
      </div>

      {req.notes ? (
        <p className="mt-2 text-xs text-slate-500 italic">&ldquo;{req.notes}&rdquo;</p>
      ) : null}

      {/* Charges section (approved) */}
      {req.status === "approved" || req.status === "returned" ? (
        <div className="mt-3 rounded-xl bg-slate-50 p-3">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">Charges</p>
          <div className="space-y-1.5">
            {req.price ? (
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-700">Service fee</span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${req.servicePaid ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" : "bg-amber-50 text-amber-700 ring-1 ring-amber-200"}`}>
                  {req.servicePaid ? `Paid · ${req.price}` : `Pending · ${req.price}`}
                </span>
              </div>
            ) : null}
            {needsReturn ? (
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-700">Deposit (refundable)</span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${req.depositPaid ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" : "bg-amber-50 text-amber-700 ring-1 ring-amber-200"}`}>
                  {req.depositPaid ? `Paid · ${req.deposit}` : `Pending · ${req.deposit}`}
                </span>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Checkout procedure */}
      {showCheckout ? (
        <div className="mt-3 rounded-xl border border-violet-200 bg-violet-50 p-3">
          <p className="text-xs font-bold text-violet-800">Return checklist</p>
          <ol className="mt-2 space-y-1 pl-4 text-xs text-violet-700 list-decimal">
            <li>Clean and prepare the item for return{req.returnByDate ? ` by ${formatDate(req.returnByDate)}` : ""}.</li>
            <li>Take a clear photo showing the item&apos;s current condition.</li>
            <li>Upload the photo below — your manager will review it.</li>
            <li>Your deposit will be refunded once the return is confirmed.</li>
          </ol>
          <Button
            type="button"
            className="mt-3 rounded-full bg-violet-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-60"
            onClick={() => returnPhotoRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? "Uploading…" : "Upload return photo"}
          </Button>
        </div>
      ) : null}

      {/* Return photo submitted */}
      {req.status === "returned" && req.returnPhotoDataUrl ? (
        <div className="mt-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Return photo</p>
          <a href={req.returnPhotoDataUrl} target="_blank" rel="noreferrer" className="mt-2 block w-32 overflow-hidden rounded-xl border border-slate-200">
            <Image
              src={req.returnPhotoDataUrl}
              alt="Return photo"
              width={128}
              height={96}
              className="h-24 w-full object-cover"
              unoptimized
            />
          </a>
          <p className="mt-1.5 text-xs text-slate-500">
            {req.depositPaid
              ? "Deposit refunded — return complete."
              : "Awaiting manager review to refund deposit."}
          </p>
        </div>
      ) : null}

      {/* Denied */}
      {req.status === "denied" ? (
        <div className="mt-3 rounded-xl bg-rose-50 p-3 text-xs text-rose-700">
          {req.managerNote ? (
            <p>Manager note: <span className="font-medium">{req.managerNote}</span></p>
          ) : (
            <p>This request was not approved. Contact your property manager for details.</p>
          )}
        </div>
      ) : null}

      <div className="mt-3 flex justify-end border-t border-slate-100 pt-3">
        <Button
          type="button"
          variant="outline"
          className="rounded-full border-rose-200 px-3 text-xs font-semibold text-rose-700 hover:bg-rose-50"
          onClick={removeRequest}
        >
          Delete request
        </Button>
      </div>
    </div>
  );
}

export function ResidentServicesPanel() {
  const { showToast } = useAppUi();
  const session = usePortalSession();
  const photoInputRef = useRef<HTMLInputElement>(null);

  const [bucket, setBucket] = useState<ResidentWorkBucket>("open");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // modal state
  const [modalMode, setModalMode] = useState<"none" | "maintenance" | "service">("none");

  // maintenance form
  const [mTitle, setMTitle] = useState("");
  const [mCategory, setMCategory] = useState("Plumbing");
  const [mPriority, setMPriority] = useState("Medium");
  const [mArrival, setMArrival] = useState("");
  const [mPhotos, setMPhotos] = useState<string[]>([]);

  // service request form
  const [selectedOffer, setSelectedOffer] = useState<ManagerAmenityOffer | null>(null);
  const [sNotes, setSNotes] = useState("");
  const [sReturnBy, setSReturnBy] = useState("");

  const [allRows, setAllRows] = useState<DemoManagerWorkOrderRow[]>([]);
  const [availableOffers, setAvailableOffers] = useState<ManagerAmenityOffer[]>([]);
  const [serviceRequests, setServiceRequests] = useState<ServiceRequest[]>([]);
  const [srTick, setSrTick] = useState(0);
  const [leaseTick, setLeaseTick] = useState(0);

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
    if (!residentEmail) return null;
    return readManagerApplicationRows().find(
      (r) => r.email?.trim().toLowerCase() === residentEmail,
    ) ?? null;
  }, [residentEmail, allRows]); // Use allRows as dependency since it updates when rows change

  // Memoize offer loading based on resident application data
  const offersForResident = useMemo(() => {
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

    if (managerUserId) {
      const offers = readAmenityOffersForProperty(managerUserId, propertyId).filter(visibleToResident);
      if (offers.length > 0) return offers;
      return readAmenityOffersForManager(managerUserId).filter(visibleToResident);
    } else if (propertyId) {
      return readAllAmenityOffersForProperty(propertyId).filter(visibleToResident);
    }
    return [];
  }, [residentApplication, residentEmail]);

  useEffect(() => {
    setAvailableOffers(offersForResident);
  }, [offersForResident]);

  // Initial data sync — fire syncs sequentially to avoid overwhelming the server/browser
  useEffect(() => {
    const sync = () => setAllRows(readManagerWorkOrderRows());
    sync();
    void syncManagerWorkOrdersFromServer()
      .then(sync)
      .then(() => syncManagerApplicationsFromServer())
      .then(() => syncLeasePipelineFromServer());
    
    // Only listen to work order events; offers are now memoized based on application data
    window.addEventListener(MANAGER_WORK_ORDERS_EVENT, sync);
    return () => {
      window.removeEventListener(MANAGER_WORK_ORDERS_EVENT, sync);
    };
  }, []);

  useEffect(() => {
    reloadServiceRequests();
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
    reloadServiceRequests();
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

  const rows = useMemo(() => myRows.filter((r) => r.bucket === bucket), [myRows, bucket]);

  const counts = useMemo(() => {
    const c: Record<ResidentWorkBucket, number> = { open: 0, scheduled: 0, completed: 0 };
    for (const r of myRows) c[r.bucket] += 1;
    return c;
  }, [myRows]);

  const statusTabs = useMemo(
    () => STATUS_TABS.map(({ id, label }) => ({ id, label, count: counts[id] })),
    [counts],
  );

  // Active service requests (not denied)
  const activeServiceRequests = useMemo(
    () => serviceRequests.filter((r) => r.status !== "denied"),
    [serviceRequests],
  );
  const deniedServiceRequests = useMemo(
    () => serviceRequests.filter((r) => r.status === "denied"),
    [serviceRequests],
  );

  const residentLeaseRow = useMemo(() => {
    void leaseTick;
    if (!residentEmail) return null;
    return findLeaseForResidentEmail(residentEmail);
  }, [leaseTick, residentEmail]);

  const servicesUnlocked = Boolean(residentLeaseRow && hasBothLeaseSignatures(residentLeaseRow));

  useEffect(() => {
    if (!servicesUnlocked && modalMode !== "none") {
      setModalMode("none");
    }
  }, [servicesUnlocked, modalMode]);

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
    setMTitle(""); setMCategory("Plumbing"); setMPriority("Medium"); setMArrival(""); setMPhotos([]);
    if (photoInputRef.current) photoInputRef.current.value = "";
  };
  const resetService = () => { setSelectedOffer(null); setSNotes(""); setSReturnBy(""); };

  function getApplication() {
    return residentApplication || readManagerApplicationRows().find((r) => r.email?.trim().toLowerCase() === residentEmail);
  }

  const submitMaintenance = () => {
    if (!servicesUnlocked) {
      showToast("Services unlock after your lease is fully signed.");
      return;
    }
    if (!mTitle.trim()) { showToast("Add a title first."); return; }
    if (!residentEmail) { showToast("Sign in to submit."); return; }
    const application = getApplication();
    const row: DemoManagerWorkOrderRow & { requestType: string } = {
      id: `REQ-${Date.now()}`,
      requestType: "maintenance",
      propertyName: application?.property || "Assigned house",
      propertyId: application?.assignedPropertyId || application?.propertyId || application?.application?.propertyId,
      assignedPropertyId: application?.assignedPropertyId,
      assignedRoomChoice: application?.assignedRoomChoice || application?.application?.roomChoice1,
      managerUserId: application?.managerUserId ?? null,
      unit: application?.assignedRoomChoice || application?.application?.roomChoice1 || "—",
      title: mTitle.trim(),
      priority: mPriority,
      status: "Submitted",
      bucket: "open",
      description: `${mCategory}: Your request is logged. Maintenance will review and update this thread.`,
      scheduled: "—",
      cost: "—",
      preferredArrival: mArrival.trim() || "Anytime",
      residentName: application?.name,
      residentEmail,
      photoDataUrls: mPhotos,
    };
    writeManagerWorkOrderRows([row, ...readManagerWorkOrderRows()]);
    setAllRows(readManagerWorkOrderRows());
    setExpandedId(row.id);
    showToast("Maintenance request submitted.");
    resetMaintenance();
    setModalMode("none");
  };

  const submitService = () => {
    if (!servicesUnlocked) {
      showToast("Services unlock after your lease is fully signed.");
      return;
    }
    if (!selectedOffer) { showToast("Select a service first."); return; }
    if (!residentEmail) { showToast("Sign in to submit."); return; }
    if (hasDeposit(selectedOffer.deposit) && !sReturnBy.trim()) {
      showToast("Please enter a return-by date.");
      return;
    }
    const application = getApplication();
    const propertyId =
      application?.assignedPropertyId?.trim() ||
      application?.propertyId?.trim() ||
      application?.application?.propertyId?.trim() ||
      "";
    // Resolve managerUserId — try application row, then property, then the selected offer's own field
    let managerUserId = application?.managerUserId?.trim() || "";
    if (!managerUserId && propertyId) {
      managerUserId = getPropertyById(propertyId)?.managerUserId?.trim() || "";
    }
    if (!managerUserId) {
      // Derive from the offer — most reliable when application row lacks managerUserId
      managerUserId = selectedOffer.managerUserId?.trim() || "";
    }
    if (!managerUserId) { showToast("Could not find your property manager. Contact support."); return; }
    createServiceRequest({
      offerId: selectedOffer.id,
      offerName: selectedOffer.name,
      offerDescription: selectedOffer.description,
      price: selectedOffer.price,
      deposit: selectedOffer.deposit,
      residentEmail,
      residentName: application?.name || residentEmail,
      managerUserId,
      propertyId,
      returnByDate: sReturnBy.trim(),
      notes: sNotes.trim(),
    });
    showToast(`${selectedOffer.name} requested — awaiting manager approval.`);
    resetService();
    setModalMode("none");
    reloadServiceRequests();
  };

  return (
    <ManagerPortalPageShell
      title="Requests"
      titleAside={
        <div className="flex shrink-0 gap-2">
          <Button
            type="button"
            variant="outline"
            className="rounded-full"
            disabled={!servicesUnlocked}
            onClick={() => {
              if (!servicesUnlocked) {
                showToast("Services unlock after your lease is fully signed.");
                return;
              }
              setModalMode("maintenance");
            }}
          >
            Report maintenance
          </Button>
          <Button
            type="button"
            className="rounded-full"
            disabled={!servicesUnlocked}
            onClick={() => {
              if (!servicesUnlocked) {
                showToast("Services unlock after your lease is fully signed.");
                return;
              }
              setModalMode("service");
            }}
          >
            Request a service
          </Button>
        </div>
      }
      filterRow={null}
    >
      <input ref={photoInputRef} type="file" accept="image/*" multiple className="sr-only" onChange={(e) => { void onPickPhotos(e.target.files); }} />

      {!servicesUnlocked ? (
        <div className="mb-6 rounded-2xl border border-amber-200/80 bg-amber-50/80 p-4 text-sm text-amber-950">
          Services are locked until your lease is fully signed by you and your manager.
        </div>
      ) : null}

      {/* Active service requests */}
      {activeServiceRequests.length > 0 ? (
        <div className="mb-6">
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Active Services</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {activeServiceRequests.map((req) => (
              <ServiceRequestCard
                key={req.id}
                req={req}
                onReturnPhotoUploaded={reloadServiceRequests}
                onDelete={reloadServiceRequests}
              />
            ))}
          </div>
        </div>
      ) : null}

      {/* Maintenance requests */}
      <div>
        <div className="mb-3 flex items-center gap-3">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Maintenance</p>
          <div className="flex gap-1">
            {statusTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setBucket(tab.id)}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                  bucket === tab.id
                    ? "bg-slate-900 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {tab.label}
                {tab.count > 0 ? ` · ${tab.count}` : ""}
              </button>
            ))}
          </div>
        </div>

        <div className={PORTAL_DATA_TABLE_WRAP}>
          {rows.length === 0 ? (
            <PortalDataTableEmpty
              message={
                myRows.length === 0
                  ? "No maintenance requests yet. Use Report maintenance to get started."
                  : "No requests in this status."
              }
            />
          ) : (
            <div className={PORTAL_DATA_TABLE_SCROLL}>
              <table className="min-w-[700px] w-full border-collapse text-left text-sm">
                <thead>
                  <tr className={PORTAL_TABLE_HEAD_ROW}>
                    <th className={`${MANAGER_TABLE_TH} text-left`}>ID</th>
                    <th className={`${MANAGER_TABLE_TH} text-left`}>Title</th>
                    <th className={`${MANAGER_TABLE_TH} text-left`}>Status</th>
                    <th className={`${MANAGER_TABLE_TH} text-right`}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <Fragment key={row.id}>
                      <tr className={PORTAL_TABLE_TR}>
                        <td className={`${PORTAL_TABLE_TD} font-mono text-xs text-slate-500`}>{row.id}</td>
                        <td className={`${PORTAL_TABLE_TD} font-medium text-slate-900`}>{row.title}</td>
                        <td className={PORTAL_TABLE_TD}>{row.status}</td>
                        <td className={`${PORTAL_TABLE_TD} text-right`}>
                          <Button
                            type="button"
                            variant="outline"
                            className={PORTAL_TABLE_ROW_TOGGLE_CLASS}
                            onClick={() => setExpandedId((c) => (c === row.id ? null : row.id))}
                          >
                            {expandedId === row.id ? "Hide" : "Details"}
                          </Button>
                        </td>
                      </tr>
                      {expandedId === row.id ? (
                        <tr className={PORTAL_TABLE_DETAIL_ROW}>
                          <td colSpan={4} className={`${PORTAL_TABLE_DETAIL_CELL} text-sm text-slate-600`}>
                            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Priority</p>
                            <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${priorityClass(row.priority)}`}>{row.priority}</span>
                            <p className="mt-3 text-xs font-medium uppercase tracking-wide text-slate-400">Preferred arrival</p>
                            <p className="mt-1 font-medium text-slate-800">{row.preferredArrival ?? "Anytime"}</p>
                            <p className="mt-3 text-xs font-medium uppercase tracking-wide text-slate-400">Details</p>
                            <p className="mt-1.5 whitespace-pre-wrap leading-relaxed">{row.description}</p>
                            {row.photoDataUrls?.length ? (
                              <>
                                <p className="mt-3 text-xs font-medium uppercase tracking-wide text-slate-400">Photos</p>
                                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                                  {row.photoDataUrls.map((src, i) => (
                                    <a key={i} href={src} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
                                      <Image src={src} alt={`Photo ${i + 1}`} width={240} height={180} className="h-28 w-full object-cover" unoptimized />
                                    </a>
                                  ))}
                                </div>
                              </>
                            ) : null}
                            {bucket === "open" ? (
                              <PortalTableDetailActions>
                                <Button
                                  type="button"
                                  variant="outline"
                                  className={PORTAL_DETAIL_BTN}
                                  onClick={() => {
                                    deleteManagerWorkOrderRow(row.id);
                                    setAllRows(readManagerWorkOrderRows());
                                    setExpandedId(null);
                                    showToast("Request removed.");
                                  }}
                                >
                                  Cancel request
                                </Button>
                              </PortalTableDetailActions>
                            ) : null}
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Denied service requests (collapsed at bottom) */}
      {deniedServiceRequests.length > 0 ? (
        <details className="mt-6">
          <summary className="cursor-pointer text-xs font-semibold text-slate-400 hover:text-slate-600">
            {deniedServiceRequests.length} denied request{deniedServiceRequests.length !== 1 ? "s" : ""}
          </summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {deniedServiceRequests.map((req) => (
              <ServiceRequestCard
                key={req.id}
                req={req}
                onReturnPhotoUploaded={reloadServiceRequests}
                onDelete={reloadServiceRequests}
              />
            ))}
          </div>
        </details>
      ) : null}

      {/* Maintenance modal */}
      <Modal
        open={modalMode === "maintenance"}
        title="Report maintenance"
        onClose={() => { setModalMode("none"); resetMaintenance(); }}
        panelClassName="relative w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl sm:p-6"
      >
        <p className="text-xs text-slate-500">Describe the issue — your property manager will be notified.</p>
        <div className="mt-4 grid gap-3">
          <div>
            <p className="mb-1 text-[11px] font-medium text-slate-600">Title</p>
            <Input value={mTitle} onChange={(e) => setMTitle(e.target.value)} placeholder="Short summary of the issue" className="bg-white" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="mb-1 text-[11px] font-medium text-slate-600">Category</p>
              <Select value={mCategory} onChange={(e) => setMCategory(e.target.value)} className="bg-white">
                <option>Plumbing</option>
                <option>Electrical</option>
                <option>HVAC</option>
                <option>Appliance</option>
                <option>Access / Locks</option>
                <option>General</option>
              </Select>
            </div>
            <div>
              <p className="mb-1 text-[11px] font-medium text-slate-600">Priority</p>
              <Select value={mPriority} onChange={(e) => setMPriority(e.target.value)} className="bg-white">
                <option>Low</option>
                <option>Medium</option>
                <option>High</option>
              </Select>
            </div>
          </div>
          <div>
            <p className="mb-1 text-[11px] font-medium text-slate-600">Preferred arrival time</p>
            <Input value={mArrival} onChange={(e) => setMArrival(e.target.value)} placeholder='e.g. Weekdays after 5pm — or "anytime"' className="bg-white" />
          </div>
          <div>
            <p className="mb-1 text-[11px] font-medium text-slate-600">Photos (up to 6)</p>
            <Button type="button" variant="outline" className="w-fit rounded-full text-xs" onClick={() => photoInputRef.current?.click()}>
              Attach photos
            </Button>
          </div>
          {mPhotos.length ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {mPhotos.map((src, i) => (
                <div key={i} className="overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
                  <Image src={src} alt={`Photo ${i + 1}`} width={240} height={180} className="h-24 w-full object-cover" unoptimized />
                  <div className="flex justify-end p-2">
                    <Button type="button" variant="outline" className="h-8 rounded-full px-3 text-[11px]" onClick={() => setMPhotos((p) => p.filter((_, j) => j !== i))}>
                      Remove
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
        <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
          <Button type="button" variant="outline" className="rounded-full" onClick={() => { setModalMode("none"); resetMaintenance(); }}>Cancel</Button>
          <Button type="button" className="rounded-full" onClick={submitMaintenance}>Submit</Button>
        </div>
      </Modal>

      {/* Service request modal */}
      <Modal
        open={modalMode === "service"}
        title="Request a service"
        onClose={() => { setModalMode("none"); resetService(); }}
        panelClassName="relative w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl sm:p-6"
      >
        {availableOffers.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-sm font-medium text-slate-700">No services available yet</p>
            <p className="mt-1 text-xs text-slate-500">Your property manager hasn&apos;t added any service offerings. Check back later.</p>
          </div>
        ) : (
          <>
            <p className="text-xs text-slate-500">Select a service from your manager&apos;s catalog. If a deposit is required, you&apos;ll also need to set a return date.</p>
            <div className="mt-4 space-y-2">
              {availableOffers.map((offer) => (
                <button
                  key={offer.id}
                  type="button"
                  onClick={() => { setSelectedOffer((cur) => (cur?.id === offer.id ? null : offer)); setSReturnBy(""); }}
                  className={`w-full rounded-xl border px-4 py-3 text-left transition ${
                    selectedOffer?.id === offer.id
                      ? "border-violet-300 bg-violet-50 ring-1 ring-violet-200"
                      : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900">{offer.name}</p>
                      {offer.description ? <p className="mt-1 text-xs leading-relaxed text-slate-600">{offer.description}</p> : null}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      {offer.price ? (
                        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">{offer.price}</span>
                      ) : null}
                      {hasDeposit(offer.deposit) ? (
                        <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-[10px] font-semibold text-amber-700 ring-1 ring-amber-200">Deposit {offer.deposit}</span>
                      ) : null}
                    </div>
                  </div>
                </button>
              ))}
            </div>

            {selectedOffer ? (
              <div className="mt-4 space-y-3">
                {hasDeposit(selectedOffer.deposit) ? (
                  <div>
                    <p className="mb-1 text-[11px] font-medium text-slate-600">
                      Return by date <span className="text-rose-500">*</span>
                    </p>
                    <Input
                      type="date"
                      value={sReturnBy}
                      onChange={(e) => setSReturnBy(e.target.value)}
                      min={new Date().toISOString().slice(0, 10)}
                      className="bg-white"
                    />
                    <p className="mt-1 text-[10px] text-slate-400">Required — your deposit is held until the item is returned.</p>
                  </div>
                ) : null}
                <div>
                  <p className="mb-1 text-[11px] font-medium text-slate-600">Additional notes (optional)</p>
                  <Input value={sNotes} onChange={(e) => setSNotes(e.target.value)} placeholder="Preferred timing, special instructions…" className="bg-white" />
                </div>
              </div>
            ) : null}
          </>
        )}
        <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
          <Button type="button" variant="outline" className="rounded-full" onClick={() => { setModalMode("none"); resetService(); }}>Cancel</Button>
          {availableOffers.length > 0 ? (
            <Button type="button" className="rounded-full" onClick={submitService} disabled={!selectedOffer}>
              Send request
            </Button>
          ) : null}
        </div>
      </Modal>
    </ManagerPortalPageShell>
  );
}
