"use client";

import { PortalNavIcon } from "@/components/portal/admin-portal-nav-icons";
import { Building2, ChevronRight, LayoutDashboard, MessagesSquare, Users } from "lucide-react";
import {
  PORTAL_NATIVE_BOTTOM_NAV_CLASS,
  PORTAL_NATIVE_BOTTOM_NAV_ICON_CLASS,
  PORTAL_NATIVE_BOTTOM_NAV_ICON_SLOT_CLASS,
  PORTAL_NATIVE_BOTTOM_NAV_ITEM_CLASS,
  PORTAL_NATIVE_BOTTOM_NAV_LABEL_CLASS,
} from "@/lib/portal-layout-classes";
import { cn } from "@/lib/utils";

const KPI_TILES = [
  { label: "Rooms vacant", value: "1", tone: "warning" as const, emphasis: true },
  { label: "Leases", value: "1", tone: "brand" as const, emphasis: true },
  { label: "Applications", value: "2", tone: "warning" as const, emphasis: true },
  { label: "Overdue", value: "$1,240", tone: "danger" as const, emphasis: true },
  { label: "Services", value: "0", tone: "neutral" as const, emphasis: false },
  { label: "Messages", value: "3", tone: "brand" as const, emphasis: true },
] as const;

const KPI_TONE_STYLES = {
  brand: {
    accent: "border-l-[var(--status-approved-fg)]",
    shell: "bg-[color-mix(in_srgb,var(--status-approved-bg)_42%,var(--card))]",
    value: "text-[var(--status-approved-fg)]",
    label: "text-[color-mix(in_srgb,var(--status-approved-fg)_70%,var(--muted))]",
  },
  warning: {
    accent: "border-l-[var(--status-pending-fg)]",
    shell: "bg-[color-mix(in_srgb,var(--status-pending-bg)_50%,var(--card))]",
    value: "text-[var(--status-pending-fg)]",
    label: "text-[color-mix(in_srgb,var(--status-pending-fg)_72%,var(--muted))]",
  },
  danger: {
    accent: "border-l-[var(--status-overdue-fg)]",
    shell: "bg-[color-mix(in_srgb,var(--status-overdue-bg)_48%,var(--card))]",
    value: "text-[var(--status-overdue-fg)]",
    label: "text-[color-mix(in_srgb,var(--status-overdue-fg)_70%,var(--muted))]",
  },
  neutral: {
    accent: "border-l-primary/55",
    shell: "bg-[color-mix(in_srgb,var(--primary)_6%,var(--card))]",
    value: "text-foreground",
    label: "text-muted",
  },
} as const;

/** Overflow manager sections — same labels as `proPortal` / the native More sheet. */
const MORE_SHEET_TABS = [
  { section: "calendar", label: "Calendar" },
  { section: "applications", label: "Applications" },
  { section: "leases", label: "Leases" },
  { section: "payments", label: "Payments" },
] as const;

const BOTTOM_TABS = [
  { section: "properties", label: "Properties", icon: Building2 },
  { section: "residents", label: "Residents", icon: Users },
  { section: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { section: "communication", label: "Communication", icon: MessagesSquare },
] as const;

function MoreGridIcon() {
  return (
    <svg className={PORTAL_NATIVE_BOTTOM_NAV_ICON_CLASS} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <circle cx="5" cy="5" r="1.75" />
      <circle cx="12" cy="5" r="1.75" />
      <circle cx="19" cy="5" r="1.75" />
      <circle cx="5" cy="12" r="1.75" />
      <circle cx="12" cy="12" r="1.75" />
      <circle cx="19" cy="12" r="1.75" />
      <circle cx="5" cy="19" r="1.75" />
      <circle cx="12" cy="19" r="1.75" />
      <circle cx="19" cy="19" r="1.75" />
    </svg>
  );
}

/** Marketing phone frame — manager dashboard + native More sheet tabs. */
export function MobileAppPreview({ className }: { className?: string }) {
  return (
    <div
      className={cn("mx-auto w-full max-w-[292px]", className)}
      data-attr="mobile-app-preview"
      aria-hidden
    >
      <div className="rounded-[2.35rem] border border-border/80 bg-[#10141c] p-2 shadow-[0_28px_64px_-28px_rgba(15,23,42,0.65)]">
        <div className="relative flex h-[560px] flex-col overflow-hidden rounded-[1.85rem] border border-white/10 bg-[linear-gradient(180deg,#f5f8fd_0%,#e9eef7_100%)]">
          <div className="min-h-0 flex-1 overflow-y-auto px-2.5 pb-[4.25rem] pt-[max(0.75rem,10px)]">
            <p className="text-sm text-muted">Welcome, Alex</p>

            <div className="mt-3 grid grid-cols-2 gap-2">
              {KPI_TILES.map((tile) => {
                const styles = KPI_TONE_STYLES[tile.tone];
                return (
                  <div
                    key={tile.label}
                    className={cn(
                      "flex min-h-[4.75rem] min-w-0 flex-col items-center justify-between gap-0.5 rounded-lg border border-border border-l-[3px] px-2 py-2 text-center shadow-[0_1px_2px_rgba(15,23,42,0.04)]",
                      styles.accent,
                      styles.shell,
                    )}
                  >
                    <span
                      className={cn(
                        "flex w-full flex-1 items-center justify-center whitespace-nowrap text-[1.35rem] font-bold tabular-nums tracking-[-0.02em]",
                        !tile.emphasis && "font-semibold",
                        styles.value,
                      )}
                    >
                      {tile.value}
                    </span>
                    <span
                      className={cn(
                        "w-full shrink-0 px-0.5 text-center text-[9px] font-medium leading-tight tracking-[-0.01em] line-clamp-2",
                        styles.label,
                      )}
                    >
                      {tile.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="pointer-events-none absolute inset-x-2 bottom-[3.35rem] z-20 rounded-t-2xl border border-border bg-background px-2 pb-2 pt-3 shadow-[0_-12px_40px_rgba(15,23,42,0.12)]">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border" aria-hidden />
            <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">Portal sections</p>
            <div className="mt-2 space-y-1">
              {MORE_SHEET_TABS.map((tab) => (
                <div
                  key={tab.section}
                  className="flex min-h-10 items-center gap-2.5 rounded-xl px-2.5 py-2 text-[13px] font-medium text-foreground"
                >
                  <PortalNavIcon section={tab.section} className="h-4 w-4 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{tab.label}</span>
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted/60" aria-hidden />
                </div>
              ))}
            </div>
          </div>

          <nav
            className={cn(
              PORTAL_NATIVE_BOTTOM_NAV_CLASS,
              "absolute inset-x-0 bottom-0 !z-30 border-t border-border bg-background/95 backdrop-blur-xl",
            )}
          >
            <div className="grid grid-cols-5">
              {BOTTOM_TABS.map(({ section, label, icon: Icon }) => (
                <div
                  key={section}
                  className={cn(PORTAL_NATIVE_BOTTOM_NAV_ITEM_CLASS, "text-muted")}
                >
                  <span className={PORTAL_NATIVE_BOTTOM_NAV_ICON_SLOT_CLASS}>
                    <Icon className={PORTAL_NATIVE_BOTTOM_NAV_ICON_CLASS} strokeWidth={2} />
                  </span>
                  <span className={cn(PORTAL_NATIVE_BOTTOM_NAV_LABEL_CLASS, "text-muted")}>{label}</span>
                </div>
              ))}
              <div className={cn(PORTAL_NATIVE_BOTTOM_NAV_ITEM_CLASS, "text-primary")}>
                <span
                  className="absolute inset-x-[18%] top-0 h-0.5 rounded-full bg-primary"
                  aria-hidden
                />
                <span className={PORTAL_NATIVE_BOTTOM_NAV_ICON_SLOT_CLASS}>
                  <MoreGridIcon />
                </span>
                <span className={cn(PORTAL_NATIVE_BOTTOM_NAV_LABEL_CLASS, "text-primary")}>More</span>
              </div>
            </div>
          </nav>
        </div>
      </div>
    </div>
  );
}
