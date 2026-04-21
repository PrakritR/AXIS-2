"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AxisHeaderMarkTile } from "@/components/brand/axis-logo";
import { Button } from "@/components/ui/button";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { adminLeaseKpiCounts, type AdminLeaseBucketIndex } from "@/lib/demo-admin-leases";
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
import type { ManagerLeaseBucket } from "@/data/demo-portal";
import { PROPERTY_PIPELINE_EVENT } from "@/lib/demo-property-pipeline";
import { LeaseDocumentPreview } from "@/components/portal/lease-document-preview";
import { MANAGER_TABLE_TH, PORTAL_SECTION_SURFACE } from "@/components/portal/portal-metrics";
import { PORTAL_DATA_TABLE_WRAP, PORTAL_DATA_TABLE_SCROLL, PORTAL_TABLE_DETAIL_ROW, PORTAL_TABLE_TR } from "@/components/portal/portal-data-table";

const KPI_LABELS = ["Manager review", "Admin review", "With resident", "Signed"] as const;

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
  const map: Record<AdminLeaseBucketIndex, { label: string; cls: string; dot: string }> = {
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
  const s = map[bucket];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${s.cls}`}
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${s.dot}`} aria-hidden />
      {s.label}
    </span>
  );
}

function bucketToPillIndex(b: ManagerLeaseBucket): AdminLeaseBucketIndex {
  const m: Record<ManagerLeaseBucket, AdminLeaseBucketIndex> = {
    manager: 0,
    admin: 1,
    resident: 2,
    signed: 3,
  };
  return m[b];
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
      <div>
        <p className="text-base font-semibold text-slate-900">{row.unit}</p>
        <p className="mt-0.5 text-sm text-slate-500">{row.residentName}</p>
        <p className="mt-2 text-sm text-slate-700">{row.notes}</p>
      </div>

      {row.thread.length ? (
        <div className="rounded-2xl border border-slate-200/90 bg-slate-50/60 px-3 py-2">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">Thread</p>
          <ul className="mt-2 max-h-36 space-y-2 overflow-y-auto text-sm">
            {row.thread.map((m) => (
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
        emptyHint="No generated lease yet — managers generate from application data."
      />

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
      </div>

      <p className="mt-3 max-w-xl text-xs leading-relaxed text-slate-500">
        Residents receive the lease from the manager portal. Post notes above if needed, then send the draft back to the manager — they release
        it to residents when ready.
      </p>

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
    </div>
  );
}

export function AdminLeasesClient() {
  const { showToast } = useAppUi();
  const [activeBucket, setActiveBucket] = useState<AdminLeaseBucketIndex>(0);
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

  const ADMIN_INDEX_TO_PIPELINE: Record<AdminLeaseBucketIndex, ManagerLeaseBucket> = {
    0: "manager",
    1: "admin",
    2: "resident",
    3: "signed",
  };

  const allRows = useMemo(() => readLeasePipeline(), [tick]);
  const kpiValues = useMemo(() => adminLeaseKpiCounts(), [tick]);

  const rows = useMemo(() => {
    const want = ADMIN_INDEX_TO_PIPELINE[activeBucket];
    return allRows.filter((r) => r.bucket === want);
  }, [allRows, activeBucket]);

  useEffect(() => {
    if (expandedLeaseId && !rows.some((r) => r.id === expandedLeaseId)) {
      setExpandedLeaseId(null);
    }
  }, [rows, expandedLeaseId]);

  return (
    <div className={PORTAL_SECTION_SURFACE}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Leases</h1>
        <Button type="button" variant="outline" className="shrink-0 rounded-full" onClick={refresh}>
          Refresh
        </Button>
      </div>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex max-w-full flex-wrap items-center gap-1 rounded-full border border-slate-200 bg-slate-50 p-1">
          {KPI_LABELS.map((label, i) => (
            <button
              key={label}
              type="button"
              onClick={() => setActiveBucket(i as AdminLeaseBucketIndex)}
              className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-semibold transition-all duration-150 ${
                activeBucket === i ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              {label}
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
                  activeBucket === i ? "bg-slate-100 text-slate-700" : "bg-slate-200/60 text-slate-500"
                }`}
              >
                {kpiValues[i] ?? 0}
              </span>
            </button>
          ))}
        </div>

      </div>

      <div className={`${PORTAL_DATA_TABLE_WRAP} mt-5`}>
        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center bg-slate-50/30 px-4 py-16 text-center sm:py-20">
            <AxisHeaderMarkTile>
              <DocIcon className="h-[26px] w-[26px]" />
            </AxisHeaderMarkTile>
            <p className="mt-4 text-sm font-medium text-slate-500">
              {allRows.length === 0 ? "No leases yet" : "No leases in this stage."}
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
                {rows.map((row) => (
                  <Fragment key={row.id}>
                    <tr className={PORTAL_TABLE_TR}>
                      <td className="px-5 py-4 align-middle">
                        <p className="font-semibold text-slate-900">{row.unit}</p>
                        <p className="mt-0.5 text-sm text-slate-500">{row.residentName}</p>
                      </td>
                      <td className="px-5 py-4 align-middle">
                        <p className="font-semibold text-slate-900">—</p>
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
                          {expandedLeaseId === row.id ? "Hide" : "Details"}
                        </Button>
                      </td>
                    </tr>
                    {expandedLeaseId === row.id ? (
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
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
