"use client";

import type { ReactNode } from "react";
import { HorizontalScrollCapture } from "@/components/portal/portal-horizontal-scroll";
import { cn } from "@/lib/utils";

/** Compact portal page header — title scrolls on mobile; not a fixed chrome bar. */
export const PAGE_HEADER_TITLE_CLASS =
  "min-w-0 truncate text-lg font-semibold tracking-[-0.02em] text-foreground sm:text-xl lg:text-[1.35rem]";

export const PAGE_HEADER_COUNT_CLASS =
  "shrink-0 rounded-full bg-accent px-2 py-0.5 text-xs font-semibold tabular-nums text-muted";

export function PageHeader({
  title,
  count,
  primaryAction,
  titleTrailing,
  filterSlot,
  className,
  /** When true, title is visible on mobile (first scroll element). Default hides duplicate mobile nav title. */
  showTitleOnMobile = true,
}: {
  title: string;
  count?: number;
  primaryAction?: ReactNode;
  /** Renders inline on the title row (e.g. Incoming / Outgoing beside "Payments"). */
  titleTrailing?: ReactNode;
  filterSlot?: ReactNode;
  className?: string;
  showTitleOnMobile?: boolean;
}) {
  const hideTitleOnMobile = !showTitleOnMobile;

  return (
    <header
      className={cn(
        "min-w-0 space-y-3 max-lg:space-y-1.5",
        hideTitleOnMobile && "max-md:[&_h1]:sr-only",
        className,
      )}
      data-slot="page-header"
    >
      <div
        data-slot="page-header-title-row"
        className={cn(
          "flex min-w-0 flex-nowrap items-center gap-2 sm:gap-3",
          hideTitleOnMobile && primaryAction && !titleTrailing && "max-md:justify-end max-md:py-0",
          hideTitleOnMobile && !primaryAction && !titleTrailing && "max-md:hidden",
          hideTitleOnMobile && titleTrailing && !primaryAction && "max-md:w-full",
        )}
      >
        <h1
          className={cn(
            PAGE_HEADER_TITLE_CLASS,
            titleTrailing ? "shrink-0" : "min-w-0 flex-1",
            primaryAction && !titleTrailing && "truncate",
          )}
        >
          {title}
          {count != null ? (
            <span className="ml-2 align-middle">
              <span className={PAGE_HEADER_COUNT_CLASS}>{count}</span>
            </span>
          ) : null}
        </h1>
        {titleTrailing ? (
          <HorizontalScrollCapture className="min-w-0 flex-1">{titleTrailing}</HorizontalScrollCapture>
        ) : null}
        {primaryAction ? (
          <div className="flex shrink-0 items-center gap-2">{primaryAction}</div>
        ) : null}
      </div>
      {filterSlot ? <div className="min-w-0">{filterSlot}</div> : null}
    </header>
  );
}
