"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal, ModalFooter } from "@/components/ui/modal";
import { MODAL_LARGE_PANEL_CLASS } from "@/components/ui/modal-styles";
import type { LeasePipelineRow } from "@/lib/lease-pipeline-storage";
import {
  resolvedFieldValue,
  type UploadedLeaseField,
  type UploadedLeaseFieldKey,
  type UploadedLeaseParse,
} from "@/lib/uploaded-lease-extraction";
import { buildUploadedLeaseProplaneHtml } from "@/lib/uploaded-lease-proplane-format";

/**
 * Manager review of a parsed upload — the human step between machine extraction
 * and a signable lease.
 *
 * Three things it has to make obvious, because the gate is worthless otherwise:
 * where each value came from (page + the surrounding sentence), which values
 * are machine-read versus manager-entered, and that a blank is deliberate
 * rather than a bug. Nothing here pre-fills an empty field with a guess.
 */

const STATUS_COPY: Record<UploadedLeaseField["status"], { label: string; tone: string; help: string }> = {
  extracted: {
    label: "Extracted",
    tone: "border-amber-300 text-amber-700 dark:text-amber-400",
    help: "Read from the document. Check it against the original.",
  },
  ambiguous: {
    label: "Conflicting",
    tone: "border-rose-300 text-rose-700 dark:text-rose-400",
    help: "The document states this more than once, differently. Left blank — pick or type the right value.",
  },
  not_found: {
    label: "Not found",
    tone: "border-rose-300 text-rose-700 dark:text-rose-400",
    help: "Not found in the document. Left blank rather than assumed.",
  },
};

function placementFor(row: LeasePipelineRow) {
  return {
    residentName: row.residentName,
    residentEmail: row.residentEmail,
    unit: row.unit,
    leaseTerm: row.application?.leaseTerm ?? null,
    leaseStart: row.application?.leaseStart ?? null,
    leaseEnd: row.application?.leaseEnd ?? null,
    rentLabel: row.signedRentLabel ?? null,
  };
}

/** PropLane's own value for a field, so the manager can spot a disagreement. */
function proplaneValueFor(key: UploadedLeaseFieldKey, row: LeasePipelineRow): string {
  switch (key) {
    case "tenantName":
      return row.residentName ?? "";
    case "leaseStart":
      return row.application?.leaseStart ?? "";
    case "leaseEnd":
      return row.application?.leaseEnd ?? "";
    case "monthlyRent":
      return row.signedRentLabel ?? "";
    default:
      return "";
  }
}

export function UploadedLeaseReviewModal({
  open,
  row,
  parse,
  onClose,
  onConfirm,
}: {
  open: boolean;
  row: LeasePipelineRow;
  parse: UploadedLeaseParse;
  onClose: () => void;
  onConfirm: (args: { overrides: Partial<Record<UploadedLeaseFieldKey, string>>; note: string }) => Promise<void> | void;
}) {
  const [drafts, setDrafts] = useState<Partial<Record<UploadedLeaseFieldKey, string>>>(
    () => ({ ...(parse.review.overrides ?? {}) }),
  );
  const [note, setNote] = useState(parse.review.note ?? "");
  const [attested, setAttested] = useState(parse.review.status === "confirmed");
  const [tab, setTab] = useState<"terms" | "document">("terms");

  const confirmed = parse.review.status === "confirmed";

  const previewHtml = useMemo(() => {
    const withDrafts: UploadedLeaseParse = {
      ...parse,
      review: { ...parse.review, overrides: { ...(parse.review.overrides ?? {}), ...drafts } },
    };
    return buildUploadedLeaseProplaneHtml({ parse: withDrafts, placement: placementFor(row) });
  }, [parse, drafts, row]);

  const setDraft = (key: UploadedLeaseFieldKey, value: string) =>
    setDrafts((d) => ({ ...d, [key]: value }));

  if (parse.status !== "parsed") {
    // A read that is still running has no result to attest to, and confirming
    // now would make the parse that lands a moment later unstorable — leaving
    // the row on an empty reading of a document that structured fine. So the
    // confirm affordance exists only once the read has finished and failed.
    const stillReading = parse.status === "pending";
    return (
      <Modal
        open={open}
        title="Imported lease"
        description={parse.sourceFileName}
        onClose={onClose}
        panelClassName={MODAL_LARGE_PANEL_CLASS}
        footer={
          stillReading || confirmed ? undefined : (
            <ModalFooter>
              <Button
                type="button"
                variant="primary"
                className="rounded-full"
                disabled={!attested}
                data-attr="uploaded-lease-confirm"
                onClick={() => onConfirm({ overrides: {}, note })}
              >
                Confirm and allow signing
              </Button>
            </ModalFooter>
          )
        }
      >
        <div className="space-y-4 text-sm">
          <div
            className={
              stillReading
                ? "rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3 text-amber-900 dark:bg-amber-950/30 dark:text-amber-300"
                : "rounded-xl border border-rose-200 bg-rose-50/60 px-4 py-3 text-rose-800 dark:bg-rose-950/30 dark:text-rose-300"
            }
            data-attr={stillReading ? "uploaded-lease-still-reading" : "uploaded-lease-unreadable"}
          >
            <p className="font-semibold">
              {stillReading ? "Still reading this document…" : "This document could not be structured."}
            </p>
            {parse.failureReason ? <p className="mt-1">{parse.failureReason}</p> : null}
            <p className="mt-2">
              The uploaded PDF is stored unchanged and is still the document that gets signed.
              {stillReading
                ? " This lease stays held until the read finishes — reopen this from Review import in a moment."
                : " Nothing was shortened or rewritten — PropLane simply could not read it into sections."}
            </p>
          </div>
          {stillReading || confirmed ? null : (
            <>
              <label className="flex items-start gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={attested}
                  data-attr="uploaded-lease-attest"
                  onChange={(e) => setAttested(e.target.checked)}
                />
                <span>I have read the original PDF myself and it is the lease I intend to send for signature.</span>
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder="Optional note recorded with your confirmation"
                className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
              />
            </>
          )}
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      title="Review imported lease"
      description={`${parse.sourceFileName} · ${parse.pageCount} page${parse.pageCount === 1 ? "" : "s"}`}
      onClose={onClose}
      panelClassName={MODAL_LARGE_PANEL_CLASS}
      footer={
        confirmed ? undefined : (
          <ModalFooter>
            <Button
              type="button"
              variant="primary"
              className="rounded-full"
              disabled={!attested}
              data-attr="uploaded-lease-confirm"
              onClick={() => onConfirm({ overrides: drafts, note })}
            >
              Confirm and allow signing
            </Button>
          </ModalFooter>
        )
      }
    >
      <div className="space-y-4">
        {confirmed ? (
          <p className="rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-3 text-sm text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">
            Confirmed{parse.review.confirmedByName ? ` by ${parse.review.confirmedByName}` : ""}
            {parse.review.confirmedAtIso ? ` on ${new Date(parse.review.confirmedAtIso).toLocaleString()}` : ""}. This
            lease can be sent for signature.
          </p>
        ) : (
          <p className="rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
            <strong className="font-semibold">Not signable yet.</strong> Every value below was read by machine.
            Blanks are deliberate — PropLane leaves a term empty rather than guessing it. Check them against the
            original PDF, fill in what is missing, then confirm.
          </p>
        )}

        <div className="flex gap-1.5">
          {(["terms", "document"] as const).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              data-attr={`uploaded-lease-review-tab-${id}`}
              className={`rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition ${
                tab === id
                  ? "border-foreground bg-foreground text-background"
                  : "border-border text-muted hover:bg-accent/30"
              }`}
            >
              {id === "terms" ? "Extracted terms" : "PropLane format"}
            </button>
          ))}
        </div>

        {tab === "terms" ? (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-accent/20 text-xs uppercase tracking-[0.1em] text-muted">
                  <th className="px-3 py-2 font-semibold">Term</th>
                  <th className="px-3 py-2 font-semibold">From the document</th>
                  <th className="px-3 py-2 font-semibold">Value used</th>
                  <th className="px-3 py-2 font-semibold">PropLane record</th>
                </tr>
              </thead>
              <tbody>
                {parse.fields.map((field) => {
                  const status = STATUS_COPY[field.status];
                  const stored = resolvedFieldValue(field, parse.review);
                  const draft = drafts[field.key];
                  const value = draft !== undefined ? draft : stored.value;
                  const humanValue = draft !== undefined ? draft.trim() !== field.value.trim() : stored.confirmedByHuman;
                  const proplane = proplaneValueFor(field.key, row);
                  return (
                    <tr key={field.key} className="border-b border-border/60 align-top last:border-0">
                      <td className="px-3 py-3">
                        <div className="font-semibold text-foreground">{field.label}</div>
                        <span
                          className={`mt-1 inline-block rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] ${
                            humanValue ? "border-emerald-300 text-emerald-700 dark:text-emerald-400" : status.tone
                          }`}
                        >
                          {humanValue ? "Manager entered" : status.label}
                        </span>
                        {!field.mapsTo ? (
                          <div className="mt-1 text-[11px] text-muted">No PropLane field — review only</div>
                        ) : null}
                      </td>
                      <td className="px-3 py-3 text-muted">
                        {field.source ? (
                          <>
                            <div className="text-foreground">{field.value}</div>
                            <div className="mt-1 text-[11px]">
                              Page {field.source.page} · “{field.source.snippet}”
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="text-[13px]">{status.help}</div>
                            {field.candidates.length > 0 ? (
                              <div className="mt-1.5 flex flex-wrap gap-1.5">
                                {field.candidates.map((c) => (
                                  <button
                                    key={`${c.value}-${c.source.charStart}`}
                                    type="button"
                                    disabled={confirmed}
                                    onClick={() => setDraft(field.key, c.value)}
                                    className="rounded-full border border-border px-2 py-0.5 text-[11px] text-foreground hover:bg-accent/30 disabled:opacity-60"
                                  >
                                    {c.value} <span className="text-muted">p.{c.source.page}</span>
                                  </button>
                                ))}
                              </div>
                            ) : null}
                          </>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <input
                          type="text"
                          value={value}
                          disabled={confirmed}
                          data-attr={`uploaded-lease-field-${field.key}`}
                          placeholder="—"
                          onChange={(e) => setDraft(field.key, e.target.value)}
                          className="w-full rounded-lg border border-border bg-card px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-primary/50 disabled:opacity-70"
                        />
                      </td>
                      <td className="px-3 py-3 text-[13px] text-muted">{proplane || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <iframe
            title="Imported lease in PropLane format"
            srcDoc={previewHtml}
            sandbox="allow-same-origin"
            className="h-[52vh] w-full rounded-xl border border-border bg-white"
          />
        )}

        {row.managerUploadedPdf?.dataUrl ? (
          <a
            href={row.managerUploadedPdf.originalDataUrl ?? row.managerUploadedPdf.dataUrl}
            download={parse.sourceFileName}
            data-attr="uploaded-lease-open-original"
            className="inline-block text-sm font-semibold text-primary underline"
          >
            Download the original PDF — unchanged, and still the document that gets signed
          </a>
        ) : null}

        {confirmed ? null : (
          <>
            <label className="flex items-start gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={attested}
                data-attr="uploaded-lease-attest"
                onChange={(e) => setAttested(e.target.checked)}
              />
              <span>
                I have compared this against the original PDF. The terms above are correct and this is the lease I
                intend to send for signature.
              </span>
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Optional note recorded with your confirmation"
              className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
            />
          </>
        )}
      </div>
    </Modal>
  );
}
