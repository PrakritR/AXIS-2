"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ListingDetailSections } from "@/components/marketing/listing-detail-sections";
import { ListingPreviewScrollShell } from "@/components/marketing/listing-preview-scroll-shell";
import { ModalShell } from "@/components/ui/modal";
import { getListingRichContent } from "@/data/listing-rich-content";
import type { MockProperty } from "@/data/types";
import { useListingContactSmsPhone } from "@/hooks/use-listing-contact-sms-phone";
import { withListingContactSmsPhone } from "@/lib/listing-contact-sms";

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
  const contactSmsPhone = useListingContactSmsPhone({
    listingId: property?.id,
    ownerManagerUserId: property?.managerUserId,
    enabled: open && Boolean(property),
  });

  if (!open || !property) return null;

  const previewProperty = withListingContactSmsPhone(property, contactSmsPhone);
  const rich = getListingRichContent(previewProperty);

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      presentation="dialog"
      stackClassName="fixed inset-0 z-[75] overflow-y-auto overscroll-contain"
      centerClassName="relative z-[76] flex min-h-full items-center justify-center p-2"
      panelClassName="modal-panel flex max-h-[calc(100vh-1.5rem)] w-[min(100%-1rem,72rem)] flex-col overflow-hidden rounded-2xl border border-border shadow-[0_24px_80px_-20px_rgba(15,23,42,0.35)]"
      ariaLabelledBy="listing-preview-title"
    >
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border bg-card px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <p id="listing-preview-title" className="truncate text-sm font-semibold text-foreground">
            {property.buildingName} · {property.unitLabel}
          </p>
          <p className="text-xs text-muted">Public listing preview · matches Rent with PropLane</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {publicHref ? (
            <Link
              href={publicHref}
              target="_blank"
              rel="noopener noreferrer"
              data-attr="listing-open-public-page"
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
      <ListingPreviewScrollShell className="min-h-0 flex-1">
        <ListingDetailSections property={previewProperty} rich={rich} previewModal hidePreviewSubnav />
      </ListingPreviewScrollShell>
      {footer ? (
        <div className="shrink-0 border-t border-border bg-card px-4 py-4 sm:px-5">{footer}</div>
      ) : null}
    </ModalShell>
  );
}
