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

const TABS: { id: ResidentWorkBucket; label: string }[] = [
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

export function ResidentWorkOrdersPanel() {
  const { showToast } = useAppUi();
  const session = usePortalSession();
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [bucket, setBucket] = useState<ResidentWorkBucket>("open");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("Plumbing");
  const [priority, setPriority] = useState("Medium");
  const [preferredArrival, setPreferredArrival] = useState("");
  const [photoDataUrls, setPhotoDataUrls] = useState<string[]>([]);
  const [allWorkOrders, setAllWorkOrders] = useState<DemoManagerWorkOrderRow[]>([]);
  const residentEmail = session.email?.trim().toLowerCase() ?? "";

  useEffect(() => {
    const sync = () => setAllWorkOrders(readManagerWorkOrderRows());
    sync();
    void syncManagerWorkOrdersFromServer().then(sync);
    void syncManagerApplicationsFromServer();
    window.addEventListener(MANAGER_WORK_ORDERS_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(MANAGER_WORK_ORDERS_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const allRows = useMemo(() => {
    if (!residentEmail) return [];
    return allWorkOrders.filter((row) => row.residentEmail?.trim().toLowerCase() === residentEmail);
  }, [allWorkOrders, residentEmail]);

  const rows = useMemo(() => allRows.filter((r) => r.bucket === bucket), [allRows, bucket]);

  const counts = useMemo(() => {
    const c: Record<ResidentWorkBucket, number> = { open: 0, scheduled: 0, completed: 0 };
    for (const r of allRows) c[r.bucket] += 1;
    return c;
  }, [allRows]);

  const statusTabs = useMemo(
    () => TABS.map(({ id, label }) => ({ id, label, count: counts[id] })),
    [counts],
  );

  const resetCreateForm = () => {
    setTitle("");
    setCategory("Plumbing");
    setPriority("Medium");
    setPreferredArrival("");
    setPhotoDataUrls([]);
    if (photoInputRef.current) photoInputRef.current.value = "";
  };

  const fileToDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
      reader.readAsDataURL(file);
    });

  const onPickPhotos = async (files: FileList | null) => {
    if (!files?.length) return;
    const remaining = 6 - photoDataUrls.length;
    if (remaining <= 0) {
      showToast("You can attach up to 6 photos.");
      return;
    }
    const next = [...photoDataUrls];
    for (let i = 0; i < Math.min(files.length, remaining); i += 1) {
      const file = files[i];
      if (!file) continue;
      if (!file.type.startsWith("image/")) {
        showToast("Only image files can be attached.");
        return;
      }
      const dataUrl = await fileToDataUrl(file);
      next.push(dataUrl);
    }
    setPhotoDataUrls(next);
  };

  const submitNew = () => {
    if (!title.trim()) {
      showToast("Add a short title first.");
      return;
    }
    if (!residentEmail) {
      showToast("Sign in to submit a work order.");
      return;
    }
    const application = readManagerApplicationRows().find((row) => row.email?.trim().toLowerCase() === residentEmail);
    const prefLabel = preferredArrival.trim() || "Anytime";
    const row: DemoManagerWorkOrderRow = {
      id: `WO-${Date.now()}`,
      propertyName: application?.property || "Assigned house",
      propertyId: application?.assignedPropertyId || application?.propertyId || application?.application?.propertyId,
      assignedPropertyId: application?.assignedPropertyId,
      assignedRoomChoice: application?.assignedRoomChoice || application?.application?.roomChoice1,
      managerUserId: application?.managerUserId ?? null,
      unit: application?.assignedRoomChoice || application?.application?.roomChoice1 || "—",
      title: title.trim(),
      priority,
      status: "Submitted",
      bucket: "open",
      description:
        `${category}: Your request is logged. Maintenance will review and update this thread — open Details anytime for notes.`,
      scheduled: "—",
      cost: "—",
      preferredArrival: prefLabel,
      residentName: application?.name,
      residentEmail,
      photoDataUrls,
    };
    writeManagerWorkOrderRows([row, ...readManagerWorkOrderRows()]);
    setAllWorkOrders(readManagerWorkOrderRows());
    setExpandedId(row.id);
    showToast("Work order added to your open requests.");
    resetCreateForm();
    setCreateOpen(false);
  };

  return (
    <ManagerPortalPageShell
      title="Work orders"
      titleAside={
        <Button type="button" className="shrink-0 rounded-full" onClick={() => setCreateOpen(true)}>
          Create work order
        </Button>
      }
      filterRow={
        <ManagerPortalStatusPills tabs={statusTabs} activeId={bucket} onChange={(id) => setBucket(id as ResidentWorkBucket)} />
      }
    >
      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        onChange={(e) => {
          void onPickPhotos(e.target.files);
        }}
      />
      <div className={PORTAL_DATA_TABLE_WRAP}>
        {rows.length === 0 ? (
          <PortalDataTableEmpty
            message={
              allRows.length === 0
                ? "No work orders yet. Use Create work order to submit a request."
                : "No work orders in this status."
            }
          />
        ) : (
          <div className={PORTAL_DATA_TABLE_SCROLL}>
            <table className="min-w-[720px] w-full border-collapse text-left text-sm">
              <thead>
                <tr className={PORTAL_TABLE_HEAD_ROW}>
                  <th className={`${MANAGER_TABLE_TH} text-left`}>ID</th>
                  <th className={`${MANAGER_TABLE_TH} text-left`}>Title</th>
                  <th className={`${MANAGER_TABLE_TH} text-left`}>Category</th>
                  <th className={`${MANAGER_TABLE_TH} text-left`}>Priority</th>
                  <th className={`${MANAGER_TABLE_TH} text-left`}>Status</th>
                  <th className={`${MANAGER_TABLE_TH} text-left`}>Cost</th>
                  <th className={`${MANAGER_TABLE_TH} text-right`}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row: DemoManagerWorkOrderRow) => (
                  <Fragment key={row.id}>
                    <tr className={PORTAL_TABLE_TR}>
                      <td className={`${PORTAL_TABLE_TD} font-mono text-xs text-slate-600`}>{row.id}</td>
                      <td className={`${PORTAL_TABLE_TD} font-medium text-slate-900`}>{row.title}</td>
                      <td className={PORTAL_TABLE_TD}>{row.description.split(":")[0] || "General"}</td>
                      <td className={PORTAL_TABLE_TD}>
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${priorityClass(row.priority)}`}>
                          {row.priority}
                        </span>
                      </td>
                      <td className={PORTAL_TABLE_TD}>{row.status}</td>
                      <td className={PORTAL_TABLE_TD}>{row.cost !== "—" && row.cost.trim() ? row.cost : "—"}</td>
                      <td className={`${PORTAL_TABLE_TD} text-right`}>
                        <Button
                          type="button"
                          variant="outline"
                          className={PORTAL_TABLE_ROW_TOGGLE_CLASS}
                          onClick={() => setExpandedId((cur) => (cur === row.id ? null : row.id))}
                        >
                          {expandedId === row.id ? "Hide" : "Details"}
                        </Button>
                      </td>
                    </tr>
                    {expandedId === row.id ? (
                      <tr className={PORTAL_TABLE_DETAIL_ROW}>
                        <td colSpan={7} className={`${PORTAL_TABLE_DETAIL_CELL} text-sm text-slate-600`}>
                          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Preferred arrival</p>
                          <p className="mt-1 font-medium text-slate-800">{row.preferredArrival ?? "Anytime"}</p>
                          <p className="mt-3 text-xs font-medium uppercase tracking-wide text-slate-400">Estimated cost</p>
                          <p className="mt-1">{row.cost !== "—" && row.cost.trim() ? row.cost : "Not set yet"}</p>
                          <p className="mt-3 text-xs font-medium uppercase tracking-wide text-slate-400">Description</p>
                          <p className="mt-1.5 leading-relaxed">{row.description}</p>
                          {row.photoDataUrls?.length ? (
                            <>
                              <p className="mt-3 text-xs font-medium uppercase tracking-wide text-slate-400">Photos</p>
                              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                                {row.photoDataUrls.map((src, index) => (
                                  <a
                                    key={`${row.id}-photo-${index}`}
                                    href={src}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="block overflow-hidden rounded-xl border border-slate-200 bg-slate-100"
                                  >
                                    <Image
                                      src={src}
                                      alt={`Work order photo ${index + 1}`}
                                      width={240}
                                      height={180}
                                      className="h-28 w-full object-cover"
                                      unoptimized
                                    />
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
                                  setAllWorkOrders(readManagerWorkOrderRows());
                                  setExpandedId(null);
                                  showToast("Work order removed.");
                                }}
                              >
                                Delete request
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

      <Modal open={createOpen} title="Create work order" onClose={() => setCreateOpen(false)} panelClassName="relative w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl sm:p-6">
        <p className="text-xs text-slate-500">New requests appear in Open; open Details on a row for notes and updates.</p>
        <div className="mt-4 grid gap-3">
          <div>
            <p className="mb-1 text-[11px] font-medium text-slate-600">Title</p>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Short summary of the issue" className="bg-white" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="mb-1 text-[11px] font-medium text-slate-600">Category</p>
              <Select value={category} onChange={(e) => setCategory(e.target.value)} className="bg-white">
                <option>Plumbing</option>
                <option>Electrical</option>
                <option>HVAC</option>
                <option>General</option>
                <option>Access</option>
              </Select>
            </div>
            <div>
              <p className="mb-1 text-[11px] font-medium text-slate-600">Priority</p>
              <Select value={priority} onChange={(e) => setPriority(e.target.value)} className="bg-white">
                <option>Low</option>
                <option>Medium</option>
                <option>High</option>
              </Select>
            </div>
          </div>
          <div>
            <p className="mb-1 text-[11px] font-medium text-slate-600">Preferred arrival time</p>
            <Input
              value={preferredArrival}
              onChange={(e) => setPreferredArrival(e.target.value)}
              placeholder='e.g. Weekdays after 5pm — or write "anytime"'
              className="bg-white"
            />
          </div>
          <p className="text-xs text-slate-500">Attach up to 6 photos to help maintenance understand the issue.</p>
          <Button type="button" variant="outline" className="w-fit rounded-full text-xs" onClick={() => photoInputRef.current?.click()}>
            Add photos
          </Button>
          {photoDataUrls.length ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {photoDataUrls.map((src, index) => (
                <div key={`new-photo-${index}`} className="overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
                  <Image
                    src={src}
                    alt={`Selected work order photo ${index + 1}`}
                    width={240}
                    height={180}
                    className="h-24 w-full object-cover"
                    unoptimized
                  />
                  <div className="flex justify-end p-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-8 rounded-full px-3 text-[11px]"
                      onClick={() => setPhotoDataUrls((current) => current.filter((_, i) => i !== index))}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
        <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
          <Button type="button" variant="outline" className="rounded-full" onClick={() => setCreateOpen(false)}>
            Cancel
          </Button>
          <Button type="button" className="rounded-full" onClick={submitNew}>
            Submit
          </Button>
        </div>
      </Modal>
    </ManagerPortalPageShell>
  );
}
