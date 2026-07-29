"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type QuickActionItem = {
  id: string;
  label: string;
  href?: string;
  onClick?: () => void;
  primary?: boolean;
  dataAttr?: string;
};

const QUICK_ACTION_BTN =
  "portal-pressable inline-flex min-h-11 shrink-0 snap-start items-center justify-center rounded-full border px-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function QuickActionRow({
  actions,
  className,
  ariaLabel = "Quick actions",
}: {
  actions: QuickActionItem[];
  className?: string;
  ariaLabel?: string;
}) {
  if (!actions.length) return null;

  return (
    <div
      className={cn(
        "flex max-w-full gap-2 overflow-x-auto snap-x snap-mandatory scroll-px-1",
        "[scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
      role="group"
      aria-label={ariaLabel}
      data-slot="quick-action-row"
    >
      {actions.map((action) => {
        const className = cn(
          QUICK_ACTION_BTN,
          action.primary
            ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90"
            : "border-border bg-card text-foreground hover:bg-accent/50",
        );
        if (action.href) {
          return (
            <Link
              key={action.id}
              href={action.href}
              data-attr={action.dataAttr}
              className={className}
            >
              {action.label}
            </Link>
          );
        }
        return (
          <button
            key={action.id}
            type="button"
            data-attr={action.dataAttr}
            className={className}
            onClick={action.onClick}
          >
            {action.label}
          </button>
        );
      })}
    </div>
  );
}

export function QuickActionRowSlot({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "flex max-w-full gap-2 overflow-x-auto snap-x snap-mandatory scroll-px-1",
        "[scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
      data-slot="quick-action-row"
    >
      {children}
    </div>
  );
}
