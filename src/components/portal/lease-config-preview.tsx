"use client";

import { buildPropertyLeasePreview } from "@/lib/property-lease-preview";

export function LeaseConfigPreview({
  preview,
}: {
  preview: ReturnType<typeof buildPropertyLeasePreview>;
}) {
  if (preview.unsupportedJurisdiction) {
    return (
      <p className="rounded-xl border border-border bg-accent/20 px-3 py-2.5 text-sm text-muted">
        {preview.plainText}
      </p>
    );
  }
  if (preview.html) {
    return (
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <iframe
          title="Lease preview"
          srcDoc={preview.html}
          sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
          className="h-[min(48vh,400px)] w-full"
        />
      </div>
    );
  }
  if (preview.plainText) {
    return (
      <p className="rounded-xl border border-border bg-accent/20 px-3 py-2.5 text-sm text-muted whitespace-pre-wrap">
        {preview.plainText}
      </p>
    );
  }
  return null;
}
