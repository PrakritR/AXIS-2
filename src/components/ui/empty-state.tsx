import type { ReactNode } from "react";
import { Button } from "./button";

export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
  variant = "default",
}: {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  variant?: "default" | "panel";
}) {
  if (variant === "panel") {
    return (
      <div className="flex min-h-[240px] flex-col items-center justify-center rounded-2xl border border-border bg-accent/30 px-6 py-14 text-center">
        <p className="text-sm font-medium text-muted">{title}</p>
        {description ? <p className="mt-2 max-w-md text-xs text-muted">{description}</p> : null}
        {actionLabel && onAction ? (
          <button
            type="button"
            onClick={onAction}
            className="mt-5 min-h-10 rounded-full border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground shadow-sm transition hover:bg-accent/40"
          >
            {actionLabel}
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-3 rounded-2xl border border-dashed border-border bg-accent/30 px-6 py-10">
      <div>
        <p className="text-base font-semibold text-foreground">{title}</p>
        <p className="mt-1 max-w-prose text-sm text-muted">{description}</p>
      </div>
      {actionLabel && onAction ? (
        <Button type="button" variant="outline" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}

export function LoadingCards() {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="h-36 animate-pulse rounded-2xl border border-border bg-accent/30"
        />
      ))}
    </div>
  );
}

export function Toolbar({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm md:flex-row md:items-center md:justify-between">
      {children}
    </div>
  );
}
