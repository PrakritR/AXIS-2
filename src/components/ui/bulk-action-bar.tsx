"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Docked bottom bar when list rows are selected — replaces invisible bulk affordances. */
export function BulkActionBar({
  count,
  children,
  className,
}: {
  count: number;
  children: ReactNode;
  className?: string;
}) {
  if (count <= 0) return null;

  return (
    <div
      className={cn(
        "fixed inset-x-0 bottom-0 z-50 border-t border-border bg-card/95 px-4 py-3 shadow-[var(--shadow-lg)] backdrop-blur-md",
        "pb-[max(0.75rem,var(--native-safe-bottom))]",
        "max-lg:bottom-[var(--portal-native-bottom-nav-inset,0px)]",
        className,
      )}
      data-slot="bulk-action-bar"
      role="region"
      aria-label="Bulk actions"
    >
      <div className="mx-auto flex max-w-5xl items-center gap-3">
        <p className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
          {count} selected
        </p>
        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">{children}</div>
      </div>
    </div>
  );
}
