"use client";

import { Fragment, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { MANAGER_TABLE_TH } from "@/components/portal/portal-metrics";
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
import type { ManagerLeaseBucket } from "@/data/demo-portal";
import { LeaseDocumentPreview } from "@/components/portal/lease-document-preview";
import {
  appendLeaseThreadMessage,
  downloadLeaseFromRow,
  generateLeaseHtmlForRow,
  managerUploadLeasePdf,
  readLeasePipeline,
  updateLeasePipelineRow,
  type LeasePipelineRow,
} from "@/lib/lease-pipeline-storage";

function ThreadView({ row }: { row: LeasePipelineRow }) {
  if (!row.thread.length) {
    return <p className="text-xs text-slate-500">No messages yet.</p>;
  }
  return (
    <div className="mt-3 max-h-40 space-y-2 overflow-y-auto rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2">
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Thread</p>
      <ul className="space-y-2">
        {row.thread.map((m) => (
          <li
            key={m.id}
            className={`rounded-lg px-2.5 py-1.5 text-xs shadow-sm ring-1 ${
              m.role === "admin"
                ? "bg-sky-50/90 ring-sky-200/90"
                : "bg-white ring-slate-100"
            }`}
          >
            <span className="font-semibold capitalize text-slate-700">{m.role}</span>
            <span className="text-slate-400"> · {new Date(m.at).toLocaleString()}</span>
            <p className="mt-1 whitespace-pre-wrap text-slate-700">{m.body}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ManagerLeasesPipelinePanel({
  bucket,
  refreshKey,
}: {
  bucket: ManagerLeaseBucket;
  refreshKey: number;
}) {
  const { showToast } = useAppUi();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [adminNoteById, setAdminNoteById] = useState<Record<string, string>>({});
  const uploadRef = useRef<HTMLInputElement>(null);
  const [pendingRowId, setPendingRowId] = useState<string | null>(null);

  void refreshKey;

  const rows = useMemo(() => readLeasePipeline().filter((r) => r.bucket === bucket), [bucket, refreshKey]);

  const onGeneratePdf = (row: LeasePipelineRow) => {
    const res = generateLeaseHtmlForRow(row.id);
    if (res.ok) {
      showToast(`Lease generated from application data (v${res.version}).`);
    } else showToast(res.error ?? "Could not generate.");
  };

  const onDownload = (row: LeasePipelineRow) => {
    if (!row.generatedHtml && !row.managerUploadedPdf) {
      showToast("Generate a lease or upload a PDF first.");
      return;
    }
    downloadLeaseFromRow(row);
    showToast("Download started.");
  };

  const onSendToResident = (row: LeasePipelineRow) => {
    appendLeaseThreadMessage(row.id, "manager", "Sent lease to resident for review and signature.");
    if (
      updateLeasePipelineRow(row.id, {
        bucket: "resident",
      })
    ) {
      showToast("Lease moved to With resident.");
      setExpandedId(null);
    } else showToast("Could not update.");
  };

  const onRequestAdminEdits = (row: LeasePipelineRow) => {
    const text = adminNoteById[row.id]?.trim();
    if (!text) {
      showToast("Add a message for the admin team.");
      return;
    }
    appendLeaseThreadMessage(row.id, "manager", text);
    if (
      updateLeasePipelineRow(row.id, {
        bucket: "admin",
      })
    ) {
      setAdminNoteById((s) => ({ ...s, [row.id]: "" }));
      showToast("Sent to admin review.");
      setExpandedId(null);
    } else showToast("Could not update.");
  };

  const onPickUpload = async (rowId: string, files: FileList | null) => {
    const f = files?.[0];
    if (!f) return;
    setPendingRowId(rowId);
    const res = await managerUploadLeasePdf(rowId, f);
    setPendingRowId(null);
    if (uploadRef.current) uploadRef.current.value = "";
    if (res.ok) {
      showToast("PDF saved — resident sees this on their Lease tab.");
    } else showToast(res.error ?? "Upload failed.");
  };

  if (rows.length === 0) {
    return (
      <PortalDataTableEmpty
        message={
          readLeasePipeline().length === 0 ? "No lease drafts yet." : "No leases in this stage."
        }
      />
    );
  }

  return (
    <div className={PORTAL_DATA_TABLE_WRAP}>
      <input
        ref={uploadRef}
        type="file"
        accept="application/pdf"
        className="sr-only"
        aria-hidden
        onChange={(e) => {
          const id = pendingRowId;
          if (id) void onPickUpload(id, e.target.files);
        }}
      />
      <div className={PORTAL_DATA_TABLE_SCROLL}>
        <table className="w-full min-w-[640px] border-collapse text-left text-sm">
          <thead>
            <tr className={PORTAL_TABLE_HEAD_ROW}>
              <th className={`${MANAGER_TABLE_TH} text-left`}>Resident</th>
              <th className={`${MANAGER_TABLE_TH} text-left`}>Unit / home</th>
              <th className={`${MANAGER_TABLE_TH} text-left`}>Stage</th>
              <th className={`${MANAGER_TABLE_TH} text-left`}>Updated</th>
              <th className={`${MANAGER_TABLE_TH} text-right`}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <Fragment key={row.id}>
                <tr className={PORTAL_TABLE_TR}>
                  <td className={`${PORTAL_TABLE_TD} font-medium text-slate-900`}>{row.residentName}</td>
                  <td className={PORTAL_TABLE_TD}>{row.unit}</td>
                  <td className={PORTAL_TABLE_TD}>{row.stageLabel}</td>
                  <td className={`${PORTAL_TABLE_TD} text-slate-500`}>{row.updated}</td>
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
                    <td colSpan={5} className={PORTAL_TABLE_DETAIL_CELL}>
                      <p className="text-sm leading-relaxed text-slate-600">{row.notes}</p>
                      <p className="mt-1.5 text-xs text-slate-500">PDF version v{row.pdfVersion}</p>

                      {bucket === "admin" ? (
                        <>
                          <LeaseDocumentPreview
                            row={row}
                            emptyHint="No lease PDF yet — generate from application data or upload when this lease is back in Manager review."
                          />
                          <div className="mt-4">
                            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
                              Internal comments (read-only)
                            </p>
                            <ThreadView row={row} />
                          </div>
                          <p className="mt-3 max-w-xl text-xs leading-relaxed text-slate-500">
                            Admin review is read-only here — you can view the lease and comments only. Messaging and routing happen in the
                            Axis admin portal. When this returns to Manager review, you&apos;ll see admin feedback above and can reply or send
                            the lease onward.
                          </p>
                        </>
                      ) : (
                        <>
                          <LeaseDocumentPreview row={row} />
                          <ThreadView row={row} />
                          {bucket === "manager" && row.thread.some((m) => m.role === "admin") ? (
                            <p className="mt-2 text-xs font-medium text-sky-900/90">
                              Admin feedback appears in the thread above — address it before sending to the resident or requesting another
                              admin pass.
                            </p>
                          ) : null}
                        </>
                      )}

                      {bucket === "manager" ? (
                        <div className="mt-3 space-y-3">
                          <Textarea
                            rows={2}
                            placeholder="Message for admin when requesting edits…"
                            value={adminNoteById[row.id] ?? ""}
                            onChange={(e) =>
                              setAdminNoteById((s) => ({
                                ...s,
                                [row.id]: e.target.value,
                              }))
                            }
                            className="max-w-xl rounded-xl border border-slate-200 bg-white text-sm"
                          />
                        </div>
                      ) : null}

                      <PortalTableDetailActions>
                        {bucket === "admin" ? (
                          <>
                            <Button
                              type="button"
                              variant="outline"
                              className={PORTAL_DETAIL_BTN}
                              onClick={() => onDownload(row)}
                            >
                              Download lease
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              type="button"
                              variant="outline"
                              className={PORTAL_DETAIL_BTN}
                              onClick={() => onGeneratePdf(row)}
                            >
                              Generate lease
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              className={PORTAL_DETAIL_BTN}
                              onClick={() => onDownload(row)}
                            >
                              Download lease
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              className={PORTAL_DETAIL_BTN}
                              onClick={() => {
                                setPendingRowId(row.id);
                                uploadRef.current?.click();
                              }}
                              disabled={pendingRowId === row.id}
                            >
                              Upload PDF
                            </Button>

                            {bucket === "manager" ? (
                              <>
                                <Button
                                  type="button"
                                  variant="outline"
                                  className={PORTAL_DETAIL_BTN}
                                  onClick={() => onSendToResident(row)}
                                >
                                  Send to resident
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  className={PORTAL_DETAIL_BTN}
                                  onClick={() => onRequestAdminEdits(row)}
                                >
                                  Request edits (admin)
                                </Button>
                              </>
                            ) : null}
                          </>
                        )}
                      </PortalTableDetailActions>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
