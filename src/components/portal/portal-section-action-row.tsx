"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Appendix C3 — one alignment rule for section action rows:
 * mobile: full-width / evenly distributed in the thumb arc;
 * desktop: start-aligned with section content, primary last, destructive separated.
 */
export function PortalSectionActionRow({
  children,
  className,
  destructive,
  /** Inline beside the page title (Share / Create, New message). */
  variant = "toolbar",
}: {
  children: ReactNode;
  className?: string;
  /** When set, renders destructive actions in a separated trailing group. */
  destructive?: ReactNode;
  variant?: "toolbar" | "header" | "grid";
}) {
  if (variant === "header") {
    return (
      <div
        className={cn(
          "flex shrink-0 flex-nowrap items-center gap-1.5 sm:gap-2 [&_button]:w-auto [&_a]:w-auto",
          className,
        )}
        data-slot="portal-section-action-row"
        data-variant="header"
      >
        {children}
      </div>
    );
  }

  if (variant === "grid") {
    return (
      <div
        className={cn(
          "grid w-full grid-cols-2 gap-2",
          "md:flex md:flex-wrap md:items-center md:justify-end md:gap-2",
          "[&_button]:w-full md:[&_button]:w-auto",
          className,
        )}
        data-slot="portal-section-action-row"
        data-variant="grid"
      >
        {children}
        {destructive ? (
          <div
            className={cn(
              "col-span-2 flex w-full md:col-span-1 md:ml-0.5 md:w-auto md:border-l md:border-border md:pl-2",
              "[&_button]:w-full md:[&_button]:w-auto",
            )}
            data-slot="portal-section-action-row-destructive"
          >
            {destructive}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex w-full min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2",
        "max-sm:[&_button]:w-full max-sm:[&_a]:w-full",
        className,
      )}
      data-slot="portal-section-action-row"
    >
      <div className="flex w-full min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2 sm:[&_button]:w-auto sm:[&_a]:w-auto">
        {children}
      </div>
      {destructive ? (
        <div
          className={cn(
            "flex w-full min-w-0 flex-col gap-2 border-t border-border pt-2 sm:ml-auto sm:w-auto sm:flex-row sm:border-0 sm:border-l sm:pl-3 sm:pt-0",
            "max-sm:[&_button]:w-full sm:[&_button]:w-auto",
          )}
          data-slot="portal-section-action-row-destructive"
        >
          {destructive}
        </div>
      ) : null}
    </div>
  );
}
