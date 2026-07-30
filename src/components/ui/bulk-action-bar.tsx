"use client";

import { useEffect, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Docked bottom bar when list rows are selected — replaces invisible bulk affordances. */
export function BulkActionBar({
  count,
  children,
  className,
  /** Mirrors payment ledger list gutters so actions line up with amount column. */
  variant = "default",
}: {
  count: number;
  children: ReactNode;
  className?: string;
  variant?: "default" | "payments";
}) {
  useEffect(() => {
    if (count <= 0) return;
    document.documentElement.setAttribute("data-bulk-action-bar", "");
    return () => {
      document.documentElement.removeAttribute("data-bulk-action-bar");
    };
  }, [count]);

  if (count <= 0) return null;

  const actionButtons = (
    <div
      className={cn(
        "flex min-w-0 flex-nowrap items-center gap-2 overflow-x-auto",
        "[scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden",
      )}
    >
      {children}
    </div>
  );

  return (
    <div
      className={cn(
        "fixed inset-x-0 bottom-0 z-[51] border-t border-border bg-card/95 px-3 py-2.5 shadow-[var(--shadow-lg)] backdrop-blur-md sm:px-4 sm:py-3",
        "pb-[max(0.75rem,var(--native-safe-bottom))]",
        "max-lg:inset-x-2.5 max-lg:bottom-[calc(var(--portal-native-bottom-nav-inset,0px)+0.75rem)] max-lg:rounded-2xl max-lg:border max-lg:py-3 max-lg:pb-3 max-lg:shadow-md",
        variant === "payments" && "px-0",
        className,
      )}
      data-slot="bulk-action-bar"
      data-variant={variant}
      role="region"
      aria-label="Bulk actions"
    >
      {variant === "payments" ? (
        <div className="flex w-full items-center gap-2">
          <div className="flex shrink-0 items-center pl-3 max-md:pl-2.5">
            <div className="size-4 shrink-0" aria-hidden />
          </div>
          <p className="shrink-0 text-[10px] font-semibold tabular-nums text-foreground sm:text-[11px]">
            {count} selected
          </p>
          <div className="flex min-w-0 flex-1 justify-end px-3 max-md:px-2.5">
            {actionButtons}
          </div>
        </div>
      ) : (
        <div className="mx-auto flex max-w-5xl flex-nowrap items-center gap-5 sm:gap-6">
          <p className="shrink-0 text-[10px] font-semibold tabular-nums text-foreground sm:text-[11px]">
            {count} selected
          </p>
          <div className="flex min-w-0 flex-1 flex-nowrap items-center justify-end gap-2 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            {children}
          </div>
        </div>
      )}
    </div>
  );
}
