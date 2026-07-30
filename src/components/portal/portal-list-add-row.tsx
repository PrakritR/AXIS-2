"use client";

import type { LucideIcon } from "lucide-react";
import { ClipboardList, FileText, Home, Megaphone, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";

/** Outer padding around dashed add rows in list panes — scales with viewport. */
export const PORTAL_LIST_ADD_ROW_WRAP_CLASS =
  "px-3 py-4 max-md:px-2.5 sm:py-5";

export const PORTAL_LIST_ADD_ROW_CLASS =
  "flex w-full min-h-[9.25rem] flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-border bg-accent/10 px-4 py-10 text-center transition-colors sm:min-h-[10rem] sm:gap-3.5 sm:py-12 max-lg:min-h-[9.75rem] max-lg:py-11 hover:border-primary/40 hover:bg-primary/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50";

/**
 * Dashed list footer — tap to add a property, resident, lease, application, etc.
 */
export function PortalListAddRow({
  label,
  icon: Icon = Home,
  onClick,
  disabled = false,
  dataAttr,
  className,
}: {
  label: string;
  icon?: LucideIcon;
  onClick: () => void;
  disabled?: boolean;
  dataAttr?: string;
  className?: string;
}) {
  const displayLabel = label.trim().toUpperCase();

  return (
    <button
      type="button"
      data-attr={dataAttr}
      disabled={disabled}
      onClick={onClick}
      className={cn(PORTAL_LIST_ADD_ROW_CLASS, className)}
    >
      <Icon className="h-8 w-8 text-primary" strokeWidth={1.35} aria-hidden />
      <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary">{displayLabel}</span>
    </button>
  );
}

export const PORTAL_LIST_ADD_ICONS = {
  property: Home,
  resident: UserPlus,
  application: ClipboardList,
  lease: FileText,
  promotion: Megaphone,
} satisfies Record<string, LucideIcon>;
