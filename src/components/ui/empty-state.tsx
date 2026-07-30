import type { ReactNode } from "react";
import { AxisHeaderMarkTile } from "@/components/brand/axis-logo";
import { Button } from "./button";

export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
  icon,
  variant = "default",
}: {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: ReactNode;
  variant?: "default" | "panel";
}) {
  const iconNode = icon ?? (
    <svg
      className="h-[26px] w-[26px]"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M3 5v14a9 3 0 0 0 18 0V5" />
      <path d="M3 12a9 3 0 0 0 18 0" />
    </svg>
  );

  const shellClass =
    variant === "panel"
      ? "flex min-h-[200px] flex-col items-center justify-center rounded-2xl border border-border bg-accent/25 px-6 py-12 text-center sm:py-16"
      : "flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-accent/25 px-6 py-10 text-center";

  return (
    <div className={shellClass} data-slot="empty-state">
      <AxisHeaderMarkTile>{iconNode}</AxisHeaderMarkTile>
      <p className="mt-4 text-sm font-medium text-foreground">{title}</p>
      {description ? <p className="mt-1 max-w-md text-xs text-muted">{description}</p> : null}
      {actionLabel && onAction ? (
        <Button type="button" variant="primary" className="mt-4 min-h-11" onClick={onAction}>
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
