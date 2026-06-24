"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ListingDetailSections } from "@/components/marketing/listing-detail-sections";
import { getListingRichContent } from "@/data/listing-rich-content";
import type { MockProperty } from "@/data/types";

/**
 * Full listing UI exactly as renters see on /rent/listings/[id], in a scrollable overlay.
 * Optional footer for manager/admin actions below the public content.
 */
export function ListingPublicPreviewModal({
  open,
  onClose,
  property,
  footer,
  publicHref,
}: {
  open: boolean;
  onClose: () => void;
  property: MockProperty | null;
  footer?: ReactNode;
  /** When set, shows “Open public page” next to Close. */
  publicHref?: string | null;
}) {
  if (!open || !property) return null;

  const rich = getListingRichContent(property);

  return (
    <>
      <button type="button" className="fixed inset-0 z-[75] bg-slate-900/45 backdrop-blur-[2px]" aria-label="Close preview" onClick={onClose} />
      <div
        className="fixed left-1/2 top-3 z-[76] flex max-h-[calc(100vh-1.5rem)] w-[min(100%-1rem,72rem)] -translate-x-1/2 flex-col overflow-hidden rounded-2xl border border-border shadow-[0_24px_80px_-20px_rgba(15,23,42,0.35)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="listing-preview-title"
      >
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border bg-card px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <p id="listing-preview-title" className="truncate text-sm font-semibold text-foreground">
              {property.buildingName} · {property.unitLabel}
            </p>
            <p className="text-xs text-muted">Public listing preview — matches Rent with Axis</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {publicHref ? (
              <Link
                href={publicHref}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-accent/30"
              >
                Open public page
              </Link>
            ) : null}
            <button
              type="button"
              className="rounded-full bg-accent/30 px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-accent/40"
              onClick={onClose}
            >
              Close
            </button>
          </div>
        </div>
        <div
          data-listing-preview-scroll
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
        >
          <ListingDetailSections property={property} rich={rich} previewModal />
        </div>
        {footer ? (
          <div className="shrink-0 border-t border-border bg-card px-4 py-4 sm:px-5">{footer}</div>
        ) : null}
      </div>
    </>
  );
}
