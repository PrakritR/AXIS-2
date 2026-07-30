"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Outline pill actions in property detail tab toolbars and list rows. */
export const PORTAL_PROPERTY_DETAIL_ACTION_BUTTON_CLASS =
  "h-8 shrink-0 rounded-full px-3 text-xs";

type PortalPropertyDetailSectionProps = {
  actions?: ReactNode;
  actionsJustify?: "end" | "between";
  children: ReactNode;
  contentClassName?: string;
  surfaceMuted?: boolean;
};

/**
 * Property detail tab shell — optional right-aligned action toolbar, no duplicate section title.
 */
export function PortalPropertyDetailSection({
  actions,
  actionsJustify = "end",
  children,
  contentClassName,
  surfaceMuted = false,
}: PortalPropertyDetailSectionProps) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border border-border bg-card",
        surfaceMuted && "[html[data-theme=dark]_&]:portal-surface-muted",
      )}
    >
      {actions ? (
        <div
          className={cn(
            "flex flex-wrap items-center gap-2 border-b border-border bg-accent/30 px-4 py-2.5",
            actionsJustify === "between" ? "justify-between" : "justify-end",
          )}
        >
          {actions}
        </div>
      ) : null}
      <div className={contentClassName}>{children}</div>
    </div>
  );
}
