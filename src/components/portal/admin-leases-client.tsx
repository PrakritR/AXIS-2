"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AxisHeaderMarkTile } from "@/components/brand/axis-logo";
import { Button } from "@/components/ui/button";
import { useAppUi } from "@/components/providers/app-ui-provider";
import type { AdminLeaseBucketIndex } from "@/lib/demo-admin-leases";
import { PortalPropertyFilterPill } from "@/components/portal/manager-section-shell";
import {
  LEASE_PIPELINE_EVENT,
  appendLeaseThreadMessage,
  downloadLeaseFromRow,
  generateLeaseHtmlForRow,
  managerUploadLeasePdf,
  readLeasePipeline,
  updateLeasePipelineRow,
  type LeasePipelineRow,
} from "@/lib/lease-pipeline-storage";
import { PROPERTY_PIPELINE_EVENT } from "@/lib/demo-property-pipeline";
import { rentSummaryFromApplication } from "@/lib/generated-lease";
import { LeaseDocumentPreview } from "@/components/portal/lease-document-preview";
import { MANAGER_TABLE_TH, PORTAL_SECTION_SURFACE } from "@/components/portal/portal-metrics";
import { PORTAL_DATA_TABLE_WRAP, PORTAL_DATA_TABLE_SCROLL, PORTAL_TABLE_DETAIL_ROW, PORTAL_TABLE_TR } from "@/components/portal/portal-data-table";

function naturalLabelSort(a: string, b: string) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

function DocIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Z" />
      <path d="M14 2v6h6" />
      <path d="M8 13h8M8 17h8" />
    </svg>
  );
}

function StatusPill({ bucket }: { bucket: AdminLeaseBucketIndex }) {
  const map: Record<number, { label: string; cls: string; dot: string }> = {
    0: {
      label: "Manager review",
      cls: "border-amber-200/90 bg-amber-50 text-amber-950",
      dot: "bg-amber-500",
    },
    1: {
      label: "Admin review",
      cls: "border-sky-200/90 bg-sky-50 text-sky-950",
      dot: "bg-sky-500",
    },
    2: {
      label: "With resident",
      cls: "border-violet-200/90 bg-violet-50 text-violet-950",
      dot: "bg-violet-500",
    },
    3: {
      label: "Signed",
      cls: "border-emerald-200/90 bg-emerald-50 text-emerald-900",
      dot: "bg-emerald-500",
    },
  };
  const s = map[bucket] ?? map[0]!;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${s.cls}`}
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${s.dot}`} aria-hidden />
      {s.label}
    </span>
  );
}

function bucketToPillIndex(b: LeasePipelineRow["bucket"]): AdminLeaseBucketIndex {
  switch (b) {
    case "manager":
      return 0;
    case "admin":
      return 1;
    case "resident":
      return 2;
    case "signed":
      return 3;
    default:
      return 0;
  }
}

function safeReadLeasePipeline(): LeasePipelineRow[] {
  try {
    return readLeasePipeline();
  } catch {
    return [];
  }
}

function LeasePipelineAdminDetail({
  row,
  onSaved,
  showToast,
}: {
  row: LeasePipelineRow;
  onSaved: () => void;
  showToast: (m: string) => void;
}) {
  /** Generate, upload, send back to manager, and thread replies only when manager submitted this lease for admin review. */
  const adminWorkflowEnabled = row.bucket === "admin";

  const fileRef = useRef<HTMLInputElement>(null);
  const [reply, setReply] = useState("");

  const onPickFile: React.ChangeEventHandler<HTMLInputElement> = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const res = await managerUploadLeasePdf(row.id, file);
    if (res.ok) {
      showToast("Lease PDF saved.");
      onSaved();
    } else showToast(res.error ?? "Upload failed.");
  };

  return (
    <div className="max-h-[min(70vh,520px)] space-y-4 overflow-y-auto pr-1">
      {(row.notes ?? "").trim() ? (
        <p className="text-sm text-slate-700">
          <span className="font-semibold text-slate-800">Internal notes: </span>
          {(row.notes ?? "").trim()}
        </p>
      ) : null}

      {(row.thread ?? []).length ? (
        <div className="rounded-2xl border border-slate-200/90 bg-slate-50/60 px-3 py-2">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">Thread</p>
          <ul className="mt-2 max-h-36 space-y-2 overflow-y-auto text-sm">
            {(row.thread ?? []).map((m) => (
              <li key={m.id} className="rounded-lg bg-white px-2 py-1.5 shadow-sm ring-1 ring-slate-100">
                <span className="font-semibold capitalize">{m.role}</span>
                <span className="text-xs text-slate-400"> · {new Date(m.at).toLocaleString()}</span>
                <p className="mt-0.5 whitespace-pre-wrap text-slate-700">{m.body}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <LeaseDocumentPreview
        row={row}
        emptyHint="No application answers on file to build a preview — managers must link an approved application."
      />

      {!adminWorkflowEnabled ? (
        <p className="rounded-2xl border border-slate-200/90 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          <span className="font-semibold text-slate-800">View only.</span> Admin can generate drafts, upload a PDF, send back to the
          manager, and reply in the thread only when the lease is in <strong>Admin review</strong> (after the manager requests admin review).
          At other stages, work continues in the manager or resident portal.
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          className="rounded-full"
          onClick={() => {
            downloadLeaseFromRow(row);
            showToast("Download started.");
          }}
        >
          Download lease
        </Button>
        {adminWorkflowEnabled ? (
          <>
            <Button
              type="button"
              variant="outline"
              className="rounded-full"
              onClick={() => {
                const res = generateLeaseHtmlForRow(row.id);
                if (res.ok === true) {
                  showToast(`Regenerated draft v${res.version}.`);
                  onSaved();
                } else showToast(res.error ?? "Could not generate.");
              }}
            >
              Generate from application
            </Button>
            <input ref={fileRef} type="file" accept="application/pdf" className="hidden" onChange={onPickFile} />
            <Button type="button" variant="outline" className="rounded-full" onClick={() => fileRef.current?.click()}>
              Upload PDF
            </Button>
            <Button
              type="button"
              className="rounded-full"
              onClick={() => {
                appendLeaseThreadMessage(row.id, "admin", "Returned to manager for updates.");
                if (updateLeasePipelineRow(row.id, { bucket: "manager" })) {
                  showToast("Sent back to manager.");
                  onSaved();
                }
              }}
            >
              Send to manager
            </Button>
          </>
        ) : null}
      </div>

      <p className="mt-3 max-w-xl text-xs leading-relaxed text-slate-500">
        {adminWorkflowEnabled ? (
          <>
            Residents receive the lease from the manager portal. Post notes below if needed, then send the draft back to the manager — they
            release it to residents when ready.
          </>
        ) : (
          <>This lease is not awaiting admin review. Work continues in the manager or resident portal.</>
        )}
      </p>

      {adminWorkflowEnabled ? (
        <div>
          <label htmlFor={`admin-reply-${row.id}`} className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">
            Reply to thread
          </label>
          <textarea
            id={`admin-reply-${row.id}`}
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            rows={3}
            className="mt-2 w-full resize-none rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/30"
            placeholder="Visible to manager and resident on their lease views…"
          />
          <Button
            type="button"
            variant="outline"
            className="mt-2 rounded-full"
            onClick={() => {
              const t = reply.trim();
              if (!t) {
                showToast("Enter a message.");
                return;
              }
              if (appendLeaseThreadMessage(row.id, "admin", t)) {
                setReply("");
                showToast("Reply posted.");
                onSaved();
              }
            }}
          >
            Post reply
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function AdminLeasesClient() {
  const { showToast } = useAppUi();
  const [propertyFilter, setPropertyFilter] = useState("");
  const [tick, setTick] = useState(0);
  const [expandedLeaseId, setExpandedLeaseId] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setTick((t) => t + 1);
    showToast("Refreshed leases.");
  }, [showToast]);

  useEffect(() => {
    const on = () => setTick((t) => t + 1);
    window.addEventListener(LEASE_PIPELINE_EVENT, on);
    window.addEventListener(PROPERTY_PIPELINE_EVENT, on);
    window.addEventListener("storage", on);
    return () => {
      window.removeEventListener(LEASE_PIPELINE_EVENT, on);
      window.removeEventListener(PROPERTY_PIPELINE_EVENT, on);
      window.removeEventListener("storage", on);
    };
  }, []);

  const allRows = useMemo(() => {
    void tick;
    return safeReadLeasePipeline();
  }, [tick]);
  const adminReviewRows = useMemo(() => allRows.filter((row) => row.bucket === "admin"), [allRows]);
  const propertyOptions = useMemo(
    () =>
      [...new Set(adminReviewRows.map((row) => row.unit).filter((unit) => unit && unit !== "—"))]
        .sort(naturalLabelSort)
        .map((unit) => ({ id: unit, label: unit })),
    [adminReviewRows],
  );

  const selectedPropertyFilter = propertyOptions.some((option) => option.id === propertyFilter) ? propertyFilter : "";

  const rows = useMemo(() => {
    return adminReviewRows.filter((r) => !selectedPropertyFilter || r.unit === selectedPropertyFilter);
  }, [adminReviewRows, selectedPropertyFilter]);

  const visibleExpandedLeaseId = expandedLeaseId && rows.some((r) => r.id === expandedLeaseId) ? expandedLeaseId : null;

  return (
    <div className={PORTAL_SECTION_SURFACE}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Leases</h1>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <PortalPropertyFilterPill
            propertyOptions={propertyOptions}
            propertyValue={selectedPropertyFilter}
            onPropertyChange={setPropertyFilter}
          />
          <Button type="button" variant="outline" className="shrink-0 rounded-full" onClick={refresh}>
            Refresh
          </Button>
        </div>
      </div>

      <div className={`${PORTAL_DATA_TABLE_WRAP} mt-5`}>
        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center bg-slate-50/30 px-4 py-16 text-center sm:py-20">
            <AxisHeaderMarkTile>
              <DocIcon className="h-[26px] w-[26px]" />
            </AxisHeaderMarkTile>
            <p className="mt-4 text-sm font-medium text-slate-500">
              {adminReviewRows.length === 0 ? "No leases awaiting admin review." : "No leases match this property filter."}
            </p>
          </div>
        ) : (
          <div className={PORTAL_DATA_TABLE_SCROLL}>
            <table className="w-full min-w-[640px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200/90 bg-white">
                  <th className={`${MANAGER_TABLE_TH} text-left`}>Lease</th>
                  <th className={`${MANAGER_TABLE_TH} text-left`}>Rent</th>
                  <th className={`${MANAGER_TABLE_TH} text-left`}>Status</th>
                  <th className={`${MANAGER_TABLE_TH} text-right`}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const rentLabel = rentSummaryFromApplication(row.application);
                  return (
                  <Fragment key={row.id}>
                    <tr className={PORTAL_TABLE_TR}>
                      <td className="px-5 py-4 align-middle">
                        <p className="font-semibold text-slate-900">{row.unit || "—"}</p>
                        <p className="mt-0.5 text-sm text-slate-500">{row.residentName || "—"}</p>
                      </td>
                      <td className="px-5 py-4 align-middle">
                        <p className="font-semibold text-slate-900">{rentLabel ?? "—"}</p>
                        <p className="text-xs text-slate-500">From application / listing</p>
                      </td>
                      <td className="px-5 py-4 align-middle">
                        <StatusPill bucket={bucketToPillIndex(row.bucket)} />
                      </td>
                      <td className="px-5 py-4 text-right align-middle">
                        <Button
                          type="button"
                          variant="outline"
                          className="rounded-full border-slate-200 px-4 py-2 text-sm font-medium text-slate-800"
                          onClick={() => setExpandedLeaseId((cur) => (cur === row.id ? null : row.id))}
                        >
                          {visibleExpandedLeaseId === row.id ? "Hide" : "Details"}
                        </Button>
                      </td>
                    </tr>
                    {visibleExpandedLeaseId === row.id ? (
                      <tr className={PORTAL_TABLE_DETAIL_ROW}>
                        <td colSpan={4} className="px-5 py-4">
                          <LeasePipelineAdminDetail
                            row={row}
                            onSaved={() => setTick((t) => t + 1)}
                            showToast={showToast}
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
        )}
      </div>
    </div>
  );
}
