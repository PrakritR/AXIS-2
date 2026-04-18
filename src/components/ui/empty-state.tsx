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
      <div className="flex min-h-[240px] flex-col items-center justify-center rounded-3xl border border-slate-200/70 bg-slate-50/50 px-6 py-14 text-center">
        <p className="text-sm font-medium text-slate-600">{title}</p>
        {description ? <p className="mt-2 max-w-md text-xs text-slate-500">{description}</p> : null}
        {actionLabel && onAction ? (
          <button
            type="button"
            onClick={onAction}
            className="mt-5 rounded-full border border-slate-200/90 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50"
          >
            {actionLabel}
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-3 rounded-3xl border border-dashed border-border bg-slate-50 px-6 py-10">
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
          className="h-36 animate-pulse rounded-3xl border border-border bg-slate-100"
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
