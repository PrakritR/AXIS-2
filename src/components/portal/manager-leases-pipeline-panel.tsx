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
  deleteLeasePipelineRow,
  downloadLeaseFromRow,
  generateLeaseHtmlForRow,
  getLeaseDocumentHtml,
  managerSignLease,
  managerUploadLeasePdf,
  printLeaseAsPdf,
  sendLeaseBackToManager,
  sendLeaseToAdminReview,
  sendLeaseToResident,
  hasBothLeaseSignatures,
  residentHasSignedLease,
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
  rows,
  bucket,
  refreshKey,
  residentAccountEmails,
}: {
  rows: LeasePipelineRow[];
  bucket: ManagerLeaseBucket;
  refreshKey: number;
  residentAccountEmails: Set<string>;
}) {
  const { showToast } = useAppUi();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [adminNoteById, setAdminNoteById] = useState<Record<string, string>>({});
  const uploadRef = useRef<HTMLInputElement>(null);
  const [pendingRowId, setPendingRowId] = useState<string | null>(null);
  const [generatingRowId, setGeneratingRowId] = useState<string | null>(null);

  void refreshKey;
  const bucketRows = useMemo(() => rows.filter((r) => r.bucket === bucket), [rows, bucket]);

  const onGeneratePdf = (row: LeasePipelineRow) => {
    if (generatingRowId) return;
    setGeneratingRowId(row.id);
    window.setTimeout(() => {
      try {
        const res = generateLeaseHtmlForRow(row.id);
        if (res.ok) {
          showToast(`Lease generated from application data (v${res.version}).`);
        } else showToast(res.error ?? "Could not generate.");
      } finally {
        setGeneratingRowId(null);
      }
    }, 0);
  };

  const onDownload = (row: LeasePipelineRow) => {
    if (row.managerUploadedPdf?.dataUrl) {
      downloadLeaseFromRow(row);
      showToast("PDF download started.");
      return;
    }
    if (row.generatedHtml) {
      printLeaseAsPdf(row);
      showToast("Print dialog opened — choose 'Save as PDF' to download.");
      return;
    }
    showToast("Generate a lease or upload a PDF first.");
  };

  const onSendToResident = (row: LeasePipelineRow) => {
    const residentEmail = row.residentEmail.trim().toLowerCase();
    if (!residentEmail || !residentAccountEmails.has(residentEmail)) {
      showToast("Resident must create their Axis resident account before you can send the lease.");
      return;
    }
    appendLeaseThreadMessage(row.id, "manager", "Sent lease to resident for review and signature.");
    if (sendLeaseToResident(row.id)) {
      showToast("Lease moved to Resident Signature Pending.");
      setExpandedId(null);
    } else showToast("Could not update.");
  };

  const onDeleteLease = (row: LeasePipelineRow) => {
    if (!window.confirm(`Delete lease for ${row.residentName} (${row.unit})? This cannot be undone.`)) return;
    if (deleteLeasePipelineRow(row.id)) {
      showToast("Lease removed from pipeline.");
      setExpandedId(null);
    } else showToast("Could not delete lease.");
  };

  const onRequestAdminEdits = (row: LeasePipelineRow) => {
    const text = adminNoteById[row.id]?.trim();
    if (!text) {
      showToast("Add a message for the admin team.");
      return;
    }
    appendLeaseThreadMessage(row.id, "manager", text);
    if (sendLeaseToAdminReview(row.id)) {
      setAdminNoteById((s) => ({ ...s, [row.id]: "" }));
      showToast("Sent to Admin Review.");
      setExpandedId(null);
    } else showToast("Could not update.");
  };

  const onMoveToManagerReview = (row: LeasePipelineRow) => {
    appendLeaseThreadMessage(row.id, "manager", "Moved lease back to manager review.");
    if (sendLeaseBackToManager(row.id)) {
      showToast("Lease moved to Manager Review.");
      setExpandedId(null);
    } else showToast("Could not update.");
  };

  const onManagerSign = (row: LeasePipelineRow) => {
    if (!residentHasSignedLease(row)) {
      showToast("The resident must sign first before the manager can countersign.");
      return;
    }
    const name = window.prompt("Type the manager / authorized agent name to sign this lease.");
    if (!name?.trim()) return;
    if (managerSignLease(row.id, name.trim())) {
      showToast(hasBothLeaseSignatures({ ...row, managerSignature: { role: "manager", name: name.trim(), signedAtIso: new Date().toISOString() } }) ? "Lease fully signed." : "Manager signature saved.");
      setExpandedId(null);
    } else {
      showToast("Could not sign lease.");
    }
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

  if (bucketRows.length === 0) {
    return (
      <PortalDataTableEmpty
        message={
          rows.length === 0 ? "No lease drafts yet." : "No leases in this stage."
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
            {bucketRows.map((row) => (
              <Fragment key={row.id}>
                {/** current workflow status drives allowed actions; bucket only drives tab grouping */}
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
                      <p className="mt-1.5 text-xs text-slate-500">Version v{row.versionNumber ?? row.pdfVersion}</p>
                      <p className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{row.status ?? row.stageLabel}</p>
                      {row.managerSignature || row.residentSignature ? (
                        <div className="mt-2 grid gap-2 rounded-xl border border-emerald-200/80 bg-emerald-50/70 px-3 py-2.5 text-xs text-emerald-900 sm:grid-cols-2">
                          <div>
                            <span className="font-semibold">Manager signature</span>
                            {row.managerSignature ? (
                              <p>
                                <span
                                  className="text-sm text-slate-800"
                                  style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontStyle: "italic" }}
                                >
                                  {row.managerSignature.name}
                                </span>
                                <span className="ml-2 text-emerald-700">{new Date(row.managerSignature.signedAtIso).toLocaleString()}</span>
                              </p>
                            ) : (
                              <p className="text-amber-700">Pending</p>
                            )}
                          </div>
                          <div>
                            <span className="font-semibold">Resident signature</span>
                            {row.residentSignature ? (
                              <p>
                                <span
                                  className="text-sm text-slate-800"
                                  style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontStyle: "italic" }}
                                >
                                  {row.residentSignature.name}
                                </span>
                                <span className="ml-2 text-emerald-700">{new Date(row.residentSignature.signedAtIso).toLocaleString()}</span>
                              </p>
                            ) : (
                              <p className="text-amber-700">Pending</p>
                            )}
                          </div>
                        </div>
                      ) : null}

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

                      <PortalTableDetailActions placement="top">
                        {row.status === "Admin Review" ? (
                          <>
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
                              disabled={generatingRowId === row.id}
                              onClick={() => onGeneratePdf(row)}
                            >
                              {generatingRowId === row.id ? "Generating..." : "Regenerate lease"}
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
                              Upload corrected lease
                            </Button>
                            <Button type="button" variant="outline" className={PORTAL_DETAIL_BTN} onClick={() => onMoveToManagerReview(row)}>
                              Send back to manager
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              className={`${PORTAL_DETAIL_BTN} border-rose-200 text-rose-800 hover:bg-rose-50`}
                              onClick={() => onDeleteLease(row)}
                            >
                              Delete lease
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              type="button"
                              variant="outline"
                              className={PORTAL_DETAIL_BTN}
                              disabled={generatingRowId === row.id}
                              onClick={() => onGeneratePdf(row)}
                            >
                              {generatingRowId === row.id ? "Generating..." : "Regenerate lease"}
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              className={PORTAL_DETAIL_BTN}
                              onClick={() => onDownload(row)}
                            >
                              Download lease
                            </Button>
                            {!row.managerSignature && residentHasSignedLease(row) ? (
                              <Button
                                type="button"
                                variant="outline"
                                className={PORTAL_DETAIL_BTN}
                                onClick={() => onManagerSign(row)}
                                disabled={!row.generatedHtml && !row.managerUploadedPdf?.dataUrl}
                              >
                                Sign as manager
                              </Button>
                            ) : null}
                            <Button
                              type="button"
                              variant="outline"
                              className={PORTAL_DETAIL_BTN}
                              onClick={() => {
                                setPendingRowId(row.id);
                                uploadRef.current?.click();
                              }}
                              disabled={pendingRowId === row.id || row.status === "Fully Signed"}
                            >
                              Upload replacement
                            </Button>

                            {row.status === "Manager Review" || row.status === "Draft" ? (
                              <>
                                {!residentAccountEmails.has(row.residentEmail.trim().toLowerCase()) ? (
                                  <p className="max-w-xl text-xs leading-relaxed text-amber-800">
                                    This lease cannot be sent yet. The resident must first create their Axis resident account using their
                                    application ID and matching email.
                                  </p>
                                ) : null}
                                <Button
                                  type="button"
                                  variant="outline"
                                  className={PORTAL_DETAIL_BTN}
                                  onClick={() => onSendToResident(row)}
                                  disabled={!residentAccountEmails.has(row.residentEmail.trim().toLowerCase())}
                                >
                                  Send to resident
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  className={PORTAL_DETAIL_BTN}
                                  onClick={() => onRequestAdminEdits(row)}
                                >
                                  Send to admin
                                </Button>
                              </>
                            ) : null}
                            {row.status === "Manager Signature Pending" ? (
                              <Button
                                type="button"
                                variant="outline"
                                className={PORTAL_DETAIL_BTN}
                                onClick={() => onManagerSign(row)}
                                disabled={!residentHasSignedLease(row) || !getLeaseDocumentHtml(row)}
                              >
                                Manager sign lease
                              </Button>
                            ) : null}
                            {row.status === "Resident Signature Pending" ? (
                              <Button
                                type="button"
                                variant="outline"
                                className={PORTAL_DETAIL_BTN}
                                onClick={() => onMoveToManagerReview(row)}
                              >
                                Move to manager review
                              </Button>
                            ) : null}
                            {row.status !== "Fully Signed" ? (
                            <Button
                              type="button"
                              variant="outline"
                              className={`${PORTAL_DETAIL_BTN} border-rose-200 text-rose-800 hover:bg-rose-50`}
                              onClick={() => onDeleteLease(row)}
                            >
                              Delete lease
                            </Button>
                            ) : null}
                          </>
                        )}
                      </PortalTableDetailActions>

                      {row.status === "Admin Review" ? (
                        <>
                          <LeaseDocumentPreview
                            row={row}
                            emptyHint="No lease document yet — regenerate from application data or upload a corrected lease."
                          />
                          <div className="mt-4">
                            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
                              Internal comments (read-only)
                            </p>
                            <ThreadView row={row} />
                          </div>
                          <p className="mt-3 max-w-xl text-xs leading-relaxed text-slate-500">
                            Admin review is paused for resident actions. Correct the single lease document here, then send it back to the manager.
                          </p>
                        </>
                      ) : (
                        <>
                          <LeaseDocumentPreview row={row} />
                          <ThreadView row={row} />
                          {(row.status === "Manager Review" || row.status === "Draft") && row.thread.some((m) => m.role === "admin") ? (
                            <p className="mt-2 text-xs font-medium text-sky-900/90">
                              Admin feedback appears in the thread above — address it before sending to the resident or requesting another
                              admin pass.
                            </p>
                          ) : null}
                        </>
                      )}
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
