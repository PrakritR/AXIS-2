"use client";

import type { ReactNode } from "react";
import { ListingStickySubnav } from "@/components/marketing/listing-detail-subnav";

/** Preview contexts (manager property tab, public preview modal): subnav stays fixed above the scroller so it never overlaps section headers on iPhone. */
export function ListingPreviewScrollShell({
  children,
  className = "",
  scrollClassName = "",
}: {
  children: ReactNode;
  className?: string;
  scrollClassName?: string;
}) {
  return (
    <div
      data-listing-preview-shell
      className={`flex min-h-0 flex-col overflow-hidden bg-background ${className}`}
    >
      <ListingStickySubnav mode="modal" pinned className="shrink-0 rounded-none border-x-0 shadow-none sm:rounded-none" />
      <div
        data-listing-preview-scroll
        className={`min-h-0 flex-1 overflow-y-auto overscroll-contain bg-background ${scrollClassName}`}
      >
        {children}
      </div>
    </div>
  );
}
