"use client";

import Image from "next/image";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { readAmenityOffersForManager, type ManagerAmenityOffer } from "@/lib/manager-amenity-catalog-storage";

const STATUS_TABS: { id: ResidentWorkBucket; label: string }[] = [
  { id: "open", label: "Open" },
  { id: "scheduled", label: "Scheduled" },
  { id: "completed", label: "Completed" },
];

type RequestType = "maintenance" | "service";

function TypeBadge({ type }: { type: RequestType }) {
  if (type === "service")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-semibold ring-1 ring-violet-200/80 text-violet-700">
        Service
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold ring-1 ring-slate-200/80 text-slate-600">
      Maintenance
    </span>
  );
}

function priorityClass(p: string) {
  const x = p.toLowerCase();
  if (x === "high") return "bg-rose-50 text-rose-800 ring-1 ring-rose-200/80";
  if (x === "medium") return "bg-amber-50 text-amber-900 ring-1 ring-amber-200/80";
  return "bg-slate-100 text-slate-700 ring-1 ring-slate-200/80";
}

function rowType(row: DemoManagerWorkOrderRow): RequestType {
  return (row as DemoManagerWorkOrderRow & { requestType?: string }).requestType === "service"
    ? "service"
    : "maintenance";
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

  const [allRows, setAllRows] = useState<DemoManagerWorkOrderRow[]>([]);
  const [availableOffers, setAvailableOffers] = useState<ManagerAmenityOffer[]>([]);

  const residentEmail = session.email?.trim().toLowerCase() ?? "";

  useEffect(() => {
    const sync = () => setAllRows(readManagerWorkOrderRows());
    sync();
    void syncManagerWorkOrdersFromServer().then(sync);
    void syncManagerApplicationsFromServer().then(() => {
      const application = readManagerApplicationRows().find(
        (r) => r.email?.trim().toLowerCase() === residentEmail,
      );
      if (application?.managerUserId) {
        setAvailableOffers(
          readAmenityOffersForManager(application.managerUserId).filter((o) => o.available),
        );
      }
    });
    window.addEventListener(MANAGER_WORK_ORDERS_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(MANAGER_WORK_ORDERS_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [residentEmail]);

  const myRows = useMemo(() => {
    if (!residentEmail) return [];
    return allRows.filter((r) => r.residentEmail?.trim().toLowerCase() === residentEmail);
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

  const resetMaintenance = () => { setMTitle(""); setMCategory("Plumbing"); setMPriority("Medium"); setMArrival(""); setMPhotos([]); if (photoInputRef.current) photoInputRef.current.value = ""; };
  const resetService = () => { setSelectedOffer(null); setSNotes(""); };

  function getApplication() {
    return readManagerApplicationRows().find((r) => r.email?.trim().toLowerCase() === residentEmail);
  }

  const submitMaintenance = () => {
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
    if (!selectedOffer) { showToast("Select a service first."); return; }
    if (!residentEmail) { showToast("Sign in to submit."); return; }
    const application = getApplication();
    const row: DemoManagerWorkOrderRow & { requestType: string } = {
      id: `SVC-${Date.now()}`,
      requestType: "service",
      propertyName: application?.property || "Assigned house",
      propertyId: application?.assignedPropertyId || application?.propertyId || application?.application?.propertyId,
      assignedPropertyId: application?.assignedPropertyId,
      assignedRoomChoice: application?.assignedRoomChoice || application?.application?.roomChoice1,
      managerUserId: application?.managerUserId ?? null,
      unit: application?.assignedRoomChoice || application?.application?.roomChoice1 || "—",
      title: selectedOffer.name,
      priority: "Low",
      status: "Requested",
      bucket: "open",
      description: `${selectedOffer.category}: ${selectedOffer.description}${sNotes.trim() ? `\n\nResident note: ${sNotes.trim()}` : ""}`,
      scheduled: "—",
      cost: selectedOffer.price || "—",
      preferredArrival: "Anytime",
      residentName: application?.name,
      residentEmail,
      photoDataUrls: [],
    };
    writeManagerWorkOrderRows([row, ...readManagerWorkOrderRows()]);
    setAllRows(readManagerWorkOrderRows());
    setExpandedId(row.id);
    showToast(`${selectedOffer.name} requested.`);
    resetService();
    setModalMode("none");
  };

  return (
    <ManagerPortalPageShell
      title="Requests"
      titleAside={
        <div className="flex shrink-0 gap-2">
          <Button type="button" variant="outline" className="rounded-full" onClick={() => setModalMode("maintenance")}>
            Report maintenance
          </Button>
          <Button type="button" className="rounded-full" onClick={() => setModalMode("service")}>
            Request a service
          </Button>
        </div>
      }
      filterRow={
        <ManagerPortalStatusPills tabs={statusTabs} activeId={bucket} onChange={(id) => setBucket(id as ResidentWorkBucket)} />
      }
    >
      <input ref={photoInputRef} type="file" accept="image/*" multiple className="sr-only" onChange={(e) => { void onPickPhotos(e.target.files); }} />

      <div className={PORTAL_DATA_TABLE_WRAP}>
        {rows.length === 0 ? (
          <PortalDataTableEmpty
            message={
              myRows.length === 0
                ? "No requests yet. Use Report maintenance or Request a service to get started."
                : "No requests in this status."
            }
          />
        ) : (
          <div className={PORTAL_DATA_TABLE_SCROLL}>
            <table className="min-w-[740px] w-full border-collapse text-left text-sm">
              <thead>
                <tr className={PORTAL_TABLE_HEAD_ROW}>
                  <th className={`${MANAGER_TABLE_TH} text-left`}>ID</th>
                  <th className={`${MANAGER_TABLE_TH} text-left`}>Type</th>
                  <th className={`${MANAGER_TABLE_TH} text-left`}>Title</th>
                  <th className={`${MANAGER_TABLE_TH} text-left`}>Status</th>
                  <th className={`${MANAGER_TABLE_TH} text-left`}>Cost</th>
                  <th className={`${MANAGER_TABLE_TH} text-right`}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <Fragment key={row.id}>
                    <tr className={PORTAL_TABLE_TR}>
                      <td className={`${PORTAL_TABLE_TD} font-mono text-xs text-slate-500`}>{row.id}</td>
                      <td className={PORTAL_TABLE_TD}><TypeBadge type={rowType(row)} /></td>
                      <td className={`${PORTAL_TABLE_TD} font-medium text-slate-900`}>{row.title}</td>
                      <td className={PORTAL_TABLE_TD}>{row.status}</td>
                      <td className={PORTAL_TABLE_TD}>{row.cost !== "—" && row.cost.trim() ? row.cost : "—"}</td>
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
                        <td colSpan={6} className={`${PORTAL_TABLE_DETAIL_CELL} text-sm text-slate-600`}>
                          {rowType(row) === "maintenance" ? (
                            <>
                              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Priority</p>
                              <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${priorityClass(row.priority)}`}>{row.priority}</span>
                              <p className="mt-3 text-xs font-medium uppercase tracking-wide text-slate-400">Preferred arrival</p>
                              <p className="mt-1 font-medium text-slate-800">{row.preferredArrival ?? "Anytime"}</p>
                            </>
                          ) : (
                            <>
                              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Service</p>
                              <p className="mt-1 font-medium text-slate-800">{row.title}</p>
                            </>
                          )}
                          <p className="mt-3 text-xs font-medium uppercase tracking-wide text-slate-400">Estimated cost</p>
                          <p className="mt-1">{row.cost !== "—" && row.cost.trim() ? row.cost : "Not set yet"}</p>
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
            <p className="text-xs text-slate-500">Select a service from your manager&apos;s catalog and we&apos;ll send them the request.</p>
            <div className="mt-4 space-y-2">
              {availableOffers.map((offer) => (
                <button
                  key={offer.id}
                  type="button"
                  onClick={() => setSelectedOffer((cur) => (cur?.id === offer.id ? null : offer))}
                  className={`w-full rounded-xl border px-4 py-3 text-left transition ${
                    selectedOffer?.id === offer.id
                      ? "border-violet-300 bg-violet-50 ring-1 ring-violet-200"
                      : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900">{offer.name}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{offer.category}</p>
                      {offer.description ? <p className="mt-1 text-xs leading-relaxed text-slate-600">{offer.description}</p> : null}
                    </div>
                    {offer.price ? (
                      <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                        {offer.price}
                      </span>
                    ) : null}
                  </div>
                  {selectedOffer?.id === offer.id ? (
                    <div className="mt-2 flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-violet-500" />
                      <span className="text-[11px] font-semibold text-violet-700">Selected</span>
                    </div>
                  ) : null}
                </button>
              ))}
            </div>
            {selectedOffer ? (
              <div className="mt-3">
                <p className="mb-1 text-[11px] font-medium text-slate-600">Additional notes (optional)</p>
                <Input value={sNotes} onChange={(e) => setSNotes(e.target.value)} placeholder="Preferred timing, special instructions…" className="bg-white" />
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
