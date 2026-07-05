"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { AxisHeaderMarkTile } from "@/components/brand/axis-logo";
import { Badge } from "@/components/ui/badge";
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
  sendLeaseBackToManager,
  type LeasePipelineRow,
} from "@/lib/lease-pipeline-storage";
import { PROPERTY_PIPELINE_EVENT } from "@/lib/demo-property-pipeline";
import { rentSummaryFromApplication } from "@/lib/generated-lease";
import { LeaseDocumentPreview } from "@/components/portal/lease-document-preview";
import { MANAGER_TABLE_TH, ManagerPortalFilterRow, ManagerPortalPageShell } from "@/components/portal/portal-metrics";
import {
  PORTAL_DATA_TABLE_WRAP,
  PORTAL_DATA_TABLE_SCROLL,
  PORTAL_DETAIL_BTN,
  PORTAL_MOBILE_CARD_CLASS,
  PORTAL_TABLE_DETAIL_CELL,
  PORTAL_TABLE_DETAIL_ROW,
  PORTAL_TABLE_HEAD_ROW,
  PORTAL_TABLE_TD,
  PORTAL_TABLE_TR_EXPANDABLE,
  createPortalRowExpandClick,
} from "@/components/portal/portal-data-table";

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
  const map: Record<number, { label: string; tone: "pending" | "approved" | "confirmed" | "neutral" }> = {
    0: { label: "Manager review", tone: "pending" },
    1: { label: "Admin review", tone: "approved" },
    2: { label: "Resident signature pending", tone: "approved" },
    3: { label: "Manager signature pending / signed", tone: "confirmed" },
  };
  const s = map[bucket] ?? map[0]!;
  return <Badge tone={s.tone}>{s.label}</Badge>;
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
  const [generating, setGenerating] = useState(false);

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
    <div className="portal-desktop-scroll-panel space-y-4 pr-1">
      {(row.notes ?? "").trim() ? (
        <p className="text-sm text-muted">
          <span className="font-semibold text-foreground">Internal notes: </span>
          {(row.notes ?? "").trim()}
        </p>
      ) : null}

      {(row.thread ?? []).length ? (
        <div className="rounded-2xl border border-border bg-accent/30 px-3 py-2">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted">Thread</p>
          <ul className="mt-2 max-h-36 space-y-2 overflow-y-auto text-sm">
            {(row.thread ?? []).map((m) => (
              <li key={m.id} className="rounded-lg bg-card px-2 py-1.5 shadow-sm ring-1 ring-slate-100">
                <span className="font-semibold capitalize">{m.role}</span>
                <span className="text-xs text-muted"> · {new Date(m.at).toLocaleString()}</span>
                <p className="mt-0.5 whitespace-pre-wrap text-muted">{m.body}</p>
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
        <p className="rounded-2xl border border-border bg-accent/30 px-4 py-3 text-sm text-muted">
          <span className="font-semibold text-foreground">View only.</span> Admin can generate drafts, upload a PDF, send back to the
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
              disabled={generating}
              onClick={() => {
                if (generating) return;
                setGenerating(true);
                window.setTimeout(() => {
                  try {
                    const res = generateLeaseHtmlForRow(row.id);
                    if (res.ok === true) {
                      showToast(`Regenerated draft v${res.version}.`);
                      onSaved();
                    } else showToast(res.error ?? "Could not generate.");
                  } finally {
                    setGenerating(false);
                  }
                }, 0);
              }}
            >
              {generating ? "Generating..." : "Generate from application"}
            </Button>
            <input ref={fileRef} type="file" accept="application/pdf" className="hidden" onChange={onPickFile} />
            <Button type="button" variant="outline" className="rounded-full" onClick={() => fileRef.current?.click()}>
              Upload PDF
            </Button>
            <Button
              type="button"
              className="rounded-full"
              onClick={() => {
                const result = sendLeaseBackToManager(row.id);
                if (!result.ok) {
                  showToast(result.error);
                  return;
                }
                appendLeaseThreadMessage(row.id, "admin", "Returned to manager for updates.");
                showToast("Sent back to manager.");
                onSaved();
              }}
            >
              Send to manager
            </Button>
          </>
        ) : null}
      </div>

      <p className="mt-3 max-w-xl text-xs leading-relaxed text-muted">
        {adminWorkflowEnabled ? (
          <>
            Residents receive the lease from the property portal. Post notes below if needed, then send the draft back to the property team to
            release it to residents when ready.
          </>
        ) : (
          <>This lease is not awaiting admin review. Work continues in the property or resident portal.</>
        )}
      </p>

      {adminWorkflowEnabled ? (
        <div>
          <label htmlFor={`admin-reply-${row.id}`} className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted">
            Reply to thread
          </label>
          <textarea
            id={`admin-reply-${row.id}`}
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            rows={3}
            className="mt-2 w-full resize-none rounded-2xl border border-border bg-card px-3 py-2.5 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/30"
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
    <ManagerPortalPageShell
      title="Leases"
      filterRow={
        <ManagerPortalFilterRow>
          <PortalPropertyFilterPill
            propertyOptions={propertyOptions}
            propertyValue={selectedPropertyFilter}
            onPropertyChange={setPropertyFilter}
          />
        </ManagerPortalFilterRow>
      }
    >
      {rows.length === 0 ? (
        <div className={PORTAL_DATA_TABLE_WRAP}>
          <div className="flex flex-col items-center justify-center bg-accent/30/30 px-4 py-16 text-center sm:py-20">
            <AxisHeaderMarkTile>
              <DocIcon className="h-[26px] w-[26px]" />
            </AxisHeaderMarkTile>
            <p className="mt-4 text-sm font-medium text-muted">
              {adminReviewRows.length === 0 ? "No leases awaiting admin review." : "No leases match this property filter."}
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="space-y-2 lg:hidden">
            {rows.map((row) => {
              const rentLabel = rentSummaryFromApplication(row.application);
              const isExpanded = visibleExpandedLeaseId === row.id;
              return (
                <div key={row.id} className={PORTAL_MOBILE_CARD_CLASS}>
                  <button
                    type="button"
                    className="w-full text-left"
                    onClick={() => setExpandedLeaseId((cur) => (cur === row.id ? null : row.id))}
                  >
                    <div className="flex items-start justify-between gap-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-foreground">{row.unit || "—"}</p>
                        <p className="mt-0.5 truncate text-xs text-muted">{row.residentName || "—"}</p>
                        <p className="mt-0.5 truncate text-[11px] text-muted/90">{rentLabel ?? "—"}</p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <StatusPill bucket={bucketToPillIndex(row.bucket)} />
                      </div>
                    </div>
                  </button>
                  <div className="mt-2">
                    <Button
                      type="button"
                      variant="outline"
                      className={PORTAL_DETAIL_BTN}
                      onClick={() => setExpandedLeaseId((cur) => (cur === row.id ? null : row.id))}
                    >
                      {isExpanded ? "Less" : "Details"}
                    </Button>
                  </div>
                  {isExpanded ? (
                    <div className="mt-3 border-t border-border pt-3">
                      <LeasePipelineAdminDetail
                        row={row}
                        onSaved={() => setTick((t) => t + 1)}
                        showToast={showToast}
                      />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
          <div className={`${PORTAL_DATA_TABLE_WRAP} hidden lg:block`}>
            <div className={PORTAL_DATA_TABLE_SCROLL}>
              <table className="w-full table-fixed border-collapse text-left text-sm">
                <thead>
                  <tr className={PORTAL_TABLE_HEAD_ROW}>
                    <th className={`${MANAGER_TABLE_TH} text-left`}>Lease</th>
                    <th className={`${MANAGER_TABLE_TH} text-left`}>Rent</th>
                    <th className={`${MANAGER_TABLE_TH} text-left`}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const rentLabel = rentSummaryFromApplication(row.application);
                    return (
                    <Fragment key={row.id}>
                      <tr
                        className={PORTAL_TABLE_TR_EXPANDABLE}
                        onClick={createPortalRowExpandClick(() =>
                          setExpandedLeaseId((cur) => (cur === row.id ? null : row.id)),
                        )}
                        aria-expanded={visibleExpandedLeaseId === row.id}
                      >
                        <td className={PORTAL_TABLE_TD}>
                          <p className="font-semibold text-foreground">{row.unit || "—"}</p>
                          <p className="mt-0.5 text-sm text-muted">{row.residentName || "—"}</p>
                        </td>
                        <td className={PORTAL_TABLE_TD}>
                          <p className="font-semibold text-foreground">{rentLabel ?? "—"}</p>
                          <p className="text-xs text-muted">From application / listing</p>
                        </td>
                        <td className={PORTAL_TABLE_TD}>
                          <StatusPill bucket={bucketToPillIndex(row.bucket)} />
                        </td>
                      </tr>
                      {visibleExpandedLeaseId === row.id ? (
                        <tr className={PORTAL_TABLE_DETAIL_ROW}>
                          <td colSpan={3} className={PORTAL_TABLE_DETAIL_CELL}>
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
          </div>
        </>
      )}
    </ManagerPortalPageShell>
  );
}
