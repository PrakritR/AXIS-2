"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import type { LeasePipelineRow } from "@/lib/lease-pipeline-storage";
import { formatPacificDateTime } from "@/lib/pacific-time";

export function LeaseSigningModal({
  row,
  signerName,
  signerRoleLabel,
  agreementLabel,
  onSign,
  onClose,
}: {
  row: LeasePipelineRow;
  signerName: string;
  signerRoleLabel: string;
  agreementLabel: string;
  onSign: (signatureName: string) => boolean | Promise<boolean>;
  onClose: () => void;
}) {
  const [sigName, setSigName] = useState(signerName);
  const [agreed, setAgreed] = useState(false);
  const [signed, setSigned] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const now = useMemo(
    () => formatPacificDateTime(new Date()),
    [],
  );

  const canSign = sigName.trim().length >= 2 && agreed;

  const handleSign = async () => {
    if (!canSign) return;
    setSubmitting(true);
    const ok = await Promise.resolve(onSign(sigName.trim()));
    setSubmitting(false);
    if (!ok) return;
    setSigned(true);
    window.setTimeout(() => onClose(), 700);
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center p-2 sm:items-center sm:p-4">
      <button type="button" aria-label="Close" className="modal-overlay fixed inset-0" onClick={onClose} />
      <div className="modal-panel relative z-10 flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-border shadow-2xl">
        <div className="shrink-0 border-b border-border px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-lg font-bold tracking-tight text-foreground">Sign lease agreement</h2>
              <p className="mt-0.5 truncate text-sm text-muted">
                {row.unit} · {row.residentName}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/30 text-lg text-muted hover:bg-accent/40"
              aria-label="Close"
            >
              ×
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {(row.generatedHtml || row.managerUploadedPdf?.dataUrl) ? (
            <div className="border-b border-border">
              {row.managerUploadedPdf?.dataUrl ? (
                <iframe
                  title="Lease document"
                  src={row.managerUploadedPdf.dataUrl}
                  className="h-[min(24vh,220px)] w-full bg-card"
                />
              ) : (
                <iframe
                  title="Lease document"
                  srcDoc={row.generatedHtml!}
                  sandbox="allow-same-origin"
                  className="h-[min(24vh,220px)] w-full bg-card"
                />
              )}
            </div>
          ) : null}

          <div className="space-y-4 px-5 py-4">
            {signed ? (
              <div className="rounded-2xl border px-5 py-5 text-center portal-banner-success">
                <p className="text-2xl font-black text-emerald-700">✓ Signed</p>
                <p className="mt-2 text-sm text-muted">
                  Your electronic signature has been recorded. Closing this window…
                </p>
              </div>
            ) : (
              <>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-[0.12em] text-muted">{signerRoleLabel}</label>
                  <p className="mt-0.5 text-xs text-muted">
                    Type exactly as it should appear on the signed document.
                  </p>
                  <input
                    type="text"
                    value={sigName}
                    onChange={(e) => setSigName(e.target.value)}
                    disabled={submitting}
                    placeholder={signerName || signerRoleLabel}
                    className="mt-2 w-full rounded-xl border border-border bg-card px-4 py-2.5 text-sm text-foreground outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
                  />
                  {sigName.trim().length >= 2 ? (
                    <p
                      className="mt-2 text-center text-xl text-foreground"
                      style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontStyle: "italic" }}
                    >
                      {sigName}
                    </p>
                  ) : null}
                </div>

                <div className="rounded-xl border border-border bg-accent/30 px-4 py-3 text-xs text-muted">
                  <p className="font-semibold text-muted">Signing date & time</p>
                  <p className="mt-0.5">{now}</p>
                </div>

                <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-card p-4 text-sm text-muted shadow-sm">
                  <input
                    type="checkbox"
                    checked={agreed}
                    onChange={(e) => setAgreed(e.target.checked)}
                    disabled={submitting}
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-border text-primary"
                  />
                  <span>
                    I agree to sign this {agreementLabel} electronically. I understand that my typed name above constitutes my legally
                    binding electronic signature, equivalent to a handwritten signature.
                  </span>
                </label>
              </>
            )}
          </div>
        </div>

        {!signed ? (
          <div className="shrink-0 border-t border-border px-5 py-3">
            <div className="flex flex-wrap justify-end gap-3">
              <Button type="button" variant="outline" className="rounded-full" onClick={onClose}>
                Cancel
              </Button>
              <Button type="button" className="rounded-full" disabled={!canSign || submitting} onClick={handleSign}>
                {submitting ? "Signing..." : "Sign lease"}
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
