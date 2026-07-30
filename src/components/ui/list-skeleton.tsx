"use client";

import { cn } from "@/lib/utils";

/**
 * Netflix-style skeleton rows shaped like two-line list items.
 */
export function ListSkeleton({
  rows = 5,
  showLeading = true,
  className,
}: {
  rows?: number;
  showLeading?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn("animate-pulse motion-reduce:animate-none", className)}
      data-slot="list-skeleton"
      aria-busy="true"
      aria-label="Loading"
    >
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className="flex h-14 max-h-14 items-center gap-3 border-b border-border/70 px-3 last:border-0"
        >
          {showLeading ? (
            <div className="h-10 w-10 shrink-0 rounded-lg bg-accent/55" aria-hidden />
          ) : null}
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="h-3.5 w-[58%] max-w-[14rem] rounded bg-accent/55" aria-hidden />
            <div className="h-3 w-[38%] max-w-[9rem] rounded bg-accent/40" aria-hidden />
          </div>
          <div className="h-4 w-14 shrink-0 rounded bg-accent/50" aria-hidden />
        </div>
      ))}
    </div>
  );
}

export function CardRailSkeleton({ cards = 4, className }: { cards?: number; className?: string }) {
  return (
    <div
      className={cn(
        "flex gap-3 overflow-hidden animate-pulse motion-reduce:animate-none",
        className,
      )}
      data-slot="card-rail-skeleton"
      aria-busy="true"
      aria-label="Loading"
    >
      {Array.from({ length: cards }, (_, i) => (
        <div
          key={i}
          className="h-[9.5rem] w-[11.5rem] shrink-0 rounded-xl border border-border/60 bg-accent/30"
          aria-hidden
        />
      ))}
    </div>
  );
}
