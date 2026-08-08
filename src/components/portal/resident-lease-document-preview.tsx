"use client";

import { UploadedLeasePdfPreview } from "@/components/portal/uploaded-lease-pdf-preview";

/**
 * Flat resident lease canvas — matches Documents › Application `bareCanvas` preview.
 */
export function ResidentLeaseBareDocumentPreview({
  pdfSrc,
  leaseHtml,
  title = "Lease agreement",
}: {
  pdfSrc?: string | null;
  leaseHtml?: string | null;
  title?: string;
}) {
  if (pdfSrc) {
    return (
      <div className="w-full overflow-hidden rounded-2xl border border-border bg-card">
        <UploadedLeasePdfPreview dataUrl={pdfSrc} title={title} fileName="lease.pdf" />
      </div>
    );
  }

  if (leaseHtml) {
    const iframeHtml = leaseHtml.replace(
      "html, body { background: #fff; }",
      "html, body { background: transparent; }",
    );
    return (
      <div className="w-full">
        <iframe
          title={title}
          srcDoc={iframeHtml}
          sandbox="allow-same-origin"
          loading="lazy"
          className="h-[min(70vh,720px)] w-full border-0 bg-transparent"
        />
      </div>
    );
  }

  return (
    <p className="px-4 py-8 text-center text-sm text-muted">
      Your lease document will appear here once your manager sends it.
    </p>
  );
}

/** Same label on every lease list row — mirrors Documents › Application. */
export const RESIDENT_LEASE_LIST_LABEL = "Lease agreement";

export function residentLeaseDetailSubtitle(status: string, signedAt?: string): string {
  const stamp = signedAt?.trim();
  if (!stamp) return status;
  return `${status} · ${stamp}`;
}
