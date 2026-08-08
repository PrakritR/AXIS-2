"use client";

import type { ReactNode } from "react";
import { Building2, ChevronDown, LayoutDashboard, MessagesSquare, Users } from "lucide-react";
import {
  PORTAL_NATIVE_BOTTOM_NAV_CLASS,
  PORTAL_NATIVE_BOTTOM_NAV_ICON_CLASS,
  PORTAL_NATIVE_BOTTOM_NAV_ICON_SLOT_CLASS,
  PORTAL_NATIVE_BOTTOM_NAV_ITEM_CLASS,
  PORTAL_NATIVE_BOTTOM_NAV_LABEL_CLASS,
} from "@/lib/portal-layout-classes";
import { cn } from "@/lib/utils";

const DOT_PENDING = "var(--status-pending-fg)";
const DOT_OVERDUE = "var(--status-overdue-fg)";
const DOT_CONFIRMED = "var(--status-confirmed-fg)";

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

const BOTTOM_TABS = [
  { section: "properties", label: "Properties", icon: Building2 },
  { section: "residents", label: "Residents", icon: Users },
  { section: "dashboard", label: "Dashboard", icon: LayoutDashboard, active: true },
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

/**
 * Marketing phone frame — manager dashboard as rendered in the native app shell.
 * Labels and layout mirror `manager-dashboard.tsx` + native bottom-nav primary tabs.
 */
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

            <div className="mt-4 space-y-3">
              <div className="flex items-center gap-2">
                <span aria-hidden className="text-lg leading-none text-primary">
                  ✦
                </span>
                <h3 className="text-lg font-bold tracking-[-0.02em] text-foreground">Needs attention</h3>
                <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-border bg-[var(--secondary)] px-2 py-0.5 text-[10px] font-medium text-muted">
                  <span aria-hidden className="size-1.5 rounded-full" style={{ background: DOT_CONFIRMED }} />
                  4 open
                </span>
              </div>

              <PreviewAttentionGroup
                title="Tour requests"
                toneColor={DOT_PENDING}
                toneBg="var(--status-pending-bg)"
                count={1}
              >
                <PreviewIssueRow
                  dot={DOT_PENDING}
                  title="Cascade 4B · Sat 11:00a"
                  subtitle="Priya N. · Cascade Court"
                  pill="Pending"
                  pillTone="pending"
                />
              </PreviewAttentionGroup>

              <PreviewAttentionGroup
                title="Applications to sign"
                toneColor={DOT_PENDING}
                toneBg="var(--status-pending-bg)"
                count={1}
              >
                <PreviewIssueRow
                  dot={DOT_PENDING}
                  title="Maya Chen"
                  subtitle="Cascade Lofts · Room 4B"
                  pill="To sign"
                  pillTone="pending"
                />
              </PreviewAttentionGroup>

              <PreviewAttentionGroup
                title="Pending & overdue payments"
                toneColor={DOT_OVERDUE}
                toneBg="var(--status-overdue-bg)"
                count={1}
                badge={
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-[var(--status-overdue-fg)]">
                    <span aria-hidden className="size-1.5 rounded-full bg-current" />
                    1 overdue
                  </span>
                }
              >
                <PreviewIssueRow
                  dot={DOT_OVERDUE}
                  title="Jordan Lee"
                  subtitle="Rent · Maple 2A · due Apr 1"
                  pill="Overdue"
                  pillTone="danger"
                />
              </PreviewAttentionGroup>
            </div>
          </div>

          <nav
            className={cn(
              PORTAL_NATIVE_BOTTOM_NAV_CLASS,
              "absolute inset-x-0 bottom-0 !z-10 border-t border-border bg-background/95 backdrop-blur-xl",
            )}
          >
            <div className="grid grid-cols-5">
              {BOTTOM_TABS.map(({ section, label, icon: Icon, active }) => (
                <div
                  key={section}
                  className={cn(
                    PORTAL_NATIVE_BOTTOM_NAV_ITEM_CLASS,
                    active ? "text-primary" : "text-muted",
                  )}
                >
                  {active ? (
                    <span
                      className="absolute inset-x-[18%] top-0 h-0.5 rounded-full bg-primary"
                      aria-hidden
                    />
                  ) : null}
                  <span className={PORTAL_NATIVE_BOTTOM_NAV_ICON_SLOT_CLASS}>
                    <Icon className={PORTAL_NATIVE_BOTTOM_NAV_ICON_CLASS} strokeWidth={active ? 2.25 : 2} />
                  </span>
                  <span
                    className={cn(
                      PORTAL_NATIVE_BOTTOM_NAV_LABEL_CLASS,
                      active ? "text-primary" : "text-muted",
                    )}
                  >
                    {label}
                  </span>
                </div>
              ))}
              <div className={cn(PORTAL_NATIVE_BOTTOM_NAV_ITEM_CLASS, "text-muted")}>
                <span className={PORTAL_NATIVE_BOTTOM_NAV_ICON_SLOT_CLASS}>
                  <MoreGridIcon />
                </span>
                <span className={cn(PORTAL_NATIVE_BOTTOM_NAV_LABEL_CLASS, "text-muted")}>More</span>
              </div>
            </div>
          </nav>
        </div>
      </div>
    </div>
  );
}

function PreviewAttentionGroup({
  title,
  toneColor,
  toneBg,
  count,
  badge,
  children,
}: {
  title: string;
  toneColor: string;
  toneBg: string;
  count: number;
  badge?: ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      className="overflow-hidden rounded-xl border border-border bg-card"
      style={{
        borderLeftWidth: 3,
        borderLeftColor: toneColor,
        background: `color-mix(in srgb, ${toneBg} 32%, var(--card))`,
      }}
    >
      <div className="flex items-center gap-2 px-3 py-2">
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted" strokeWidth={2.25} aria-hidden />
        <h4 className="min-w-0 flex-1 text-[13px] font-semibold leading-none" style={{ color: toneColor }}>
          {title}
        </h4>
        <span
          className="inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-semibold tabular-nums"
          style={{ color: toneColor, background: `color-mix(in srgb, ${toneBg} 55%, transparent)` }}
        >
          {count}
        </span>
        {badge}
        <span className="shrink-0 text-xs font-semibold" style={{ color: toneColor }}>
          →
        </span>
      </div>
      <div className="border-t border-border">{children}</div>
    </div>
  );
}

function PreviewIssueRow({
  dot,
  title,
  subtitle,
  pill,
  pillTone,
}: {
  dot: string;
  title: string;
  subtitle: string;
  pill: string;
  pillTone: "pending" | "danger";
}) {
  return (
    <div className="flex items-center gap-2.5 px-3 py-2">
      <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: dot }} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-semibold text-foreground">{title}</span>
        <span className="mt-0.5 block truncate text-[11px] text-muted">{subtitle}</span>
      </span>
      <span
        className={cn(
          "inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[9px] font-semibold",
          pillTone === "danger" ? "portal-badge-danger" : "portal-badge-pending",
        )}
      >
        {pill}
      </span>
    </div>
  );
}
