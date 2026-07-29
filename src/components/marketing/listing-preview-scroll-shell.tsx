"use client";

import type { ReactNode } from "react";
import { ListingStickySubnav } from "@/components/marketing/listing-detail-subnav";

/** Preview contexts (manager property tab, public preview modal): subnav stays fixed above the scroller so it never overlaps section headers on iPhone. */
export function ListingPreviewScrollShell({
  children,
  className = "",
  scrollClassName = "",
  /** Let #portal-main-content own vertical scroll on phones (manager property preview). */
  pageScrollOnMobile = false,
}: {
  children: ReactNode;
  className?: string;
  scrollClassName?: string;
  pageScrollOnMobile?: boolean;
}) {
  const subnav = (
    <ListingStickySubnav mode="modal" pinned className="shrink-0 rounded-none border-x-0 shadow-none sm:rounded-none" />
  );

  if (pageScrollOnMobile) {
    return (
      <div data-listing-preview-shell className={`flex flex-col bg-background ${className}`}>
        {subnav}
        <div data-listing-preview-scroll className={`bg-background ${scrollClassName}`}>
          {children}
        </div>
      </div>
    );
  }

  return (
    <div
      data-listing-preview-shell
      className={`flex min-h-0 flex-col overflow-hidden bg-background ${className}`}
    >
      <ListingStickySubnav mode="modal" pinned className="shrink-0 rounded-none border-x-0 shadow-none sm:rounded-none" />
      <div
        data-listing-preview-scroll
        className={`min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain bg-background ${scrollClassName}`}
      >
        {children}
      </div>
    </div>
  );
}
