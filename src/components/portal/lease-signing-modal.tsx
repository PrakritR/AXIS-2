"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import type { LeasePipelineRow } from "@/lib/lease-pipeline-storage";

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
    () =>
      new Date().toLocaleString(undefined, {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }),
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
    <div className="fixed inset-0 z-[200] flex items-end justify-center bg-slate-900/60 p-2 sm:items-center sm:p-4">
      <button type="button" className="absolute inset-0 cursor-default" onClick={onClose} aria-label="Close" />
      <div className="relative z-10 flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
        <div className="shrink-0 border-b border-slate-100 px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-lg font-bold tracking-tight text-slate-900">Sign lease agreement</h2>
              <p className="mt-0.5 truncate text-sm text-slate-600">
                {row.unit} · {row.residentName}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-lg text-slate-600 hover:bg-slate-200"
              aria-label="Close"
            >
              ×
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {(row.generatedHtml || row.managerUploadedPdf?.dataUrl) ? (
            <div className="border-b border-slate-100">
              {row.managerUploadedPdf?.dataUrl ? (
                <iframe
                  title="Lease document"
                  src={row.managerUploadedPdf.dataUrl}
                  className="h-[min(24vh,220px)] w-full bg-white"
                />
              ) : (
                <iframe
                  title="Lease document"
                  srcDoc={row.generatedHtml!}
                  sandbox="allow-same-origin"
                  className="h-[min(24vh,220px)] w-full bg-white"
                />
              )}
            </div>
          ) : null}

          <div className="space-y-4 px-5 py-4">
            {signed ? (
              <div className="rounded-2xl border border-emerald-200/90 bg-emerald-50/90 px-5 py-5 text-center">
                <p className="text-2xl font-black text-emerald-700">✓ Signed</p>
                <p className="mt-2 text-sm text-slate-700">
                  Your electronic signature has been recorded. Closing this window…
                </p>
              </div>
            ) : (
              <>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{signerRoleLabel}</label>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Type exactly as it should appear on the signed document.
                  </p>
                  <input
                    type="text"
                    value={sigName}
                    onChange={(e) => setSigName(e.target.value)}
                    disabled={submitting}
                    placeholder={signerName || signerRoleLabel}
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
                  />
                  {sigName.trim().length >= 2 ? (
                    <p
                      className="mt-2 text-center text-xl text-slate-800"
                      style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontStyle: "italic" }}
                    >
                      {sigName}
                    </p>
                  ) : null}
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3 text-xs text-slate-600">
                  <p className="font-semibold text-slate-700">Signing date & time</p>
                  <p className="mt-0.5">{now}</p>
                </div>

                <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700 shadow-sm">
                  <input
                    type="checkbox"
                    checked={agreed}
                    onChange={(e) => setAgreed(e.target.checked)}
                    disabled={submitting}
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-primary"
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
          <div className="shrink-0 border-t border-slate-100 px-5 py-3">
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
