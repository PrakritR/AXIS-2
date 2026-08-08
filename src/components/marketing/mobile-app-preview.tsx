"use client";

import {
  Building2,
  Calendar,
  ClipboardList,
  LayoutDashboard,
  MessageSquare,
  MoreHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";

const BOTTOM_TABS = [
  { icon: LayoutDashboard, label: "Dashboard", active: true },
  { icon: Building2, label: "Properties" },
  { icon: Calendar, label: "Calendar" },
  { icon: ClipboardList, label: "Applications" },
  { icon: MoreHorizontal, label: "More" },
] as const;

/**
 * Marketing phone frame — manager portal dashboard as it appears in the mobile app.
 * Presentational only; mirrors native bottom-nav chrome without calling APIs.
 */
export function MobileAppPreview({ className }: { className?: string }) {
  return (
    <div
      className={cn("mx-auto w-full max-w-[280px]", className)}
      data-attr="mobile-app-preview"
      aria-hidden
    >
      <div className="rounded-[2.25rem] border border-border/80 bg-[#0b0f17] p-2 shadow-[0_24px_60px_-24px_rgba(15,23,42,0.55)]">
        <div className="overflow-hidden rounded-[1.75rem] border border-white/10 bg-background">
          <div className="flex items-center justify-between bg-background px-4 pb-1 pt-2.5 text-[10px] font-semibold text-foreground">
            <span>9:41</span>
            <div className="h-4 w-[72px] rounded-full bg-foreground/90" />
            <span className="opacity-70">100%</span>
          </div>

          <div className="border-b border-border/60 px-4 pb-3 pt-1">
            <p className="text-[11px] font-medium text-muted">Manager</p>
            <h3 className="text-lg font-semibold tracking-[-0.02em] text-foreground">Dashboard</h3>
            <p className="mt-0.5 text-[11px] text-muted">Welcome back, Alex</p>
          </div>

          <div className="space-y-3 px-3 py-3">
            <div className="grid grid-cols-2 gap-2">
              <PreviewKpi label="Rooms vacant" value="2" tone="warning" />
              <PreviewKpi label="Overdue" value="1" tone="danger" />
              <PreviewKpi label="Applications" value="3" tone="info" />
              <PreviewKpi label="Unread" value="4" tone="neutral" />
            </div>

            <div className="rounded-xl border border-border bg-card p-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">Needs attention</p>
              <div className="mt-2 space-y-2">
                <PreviewRow title="Rent overdue · Maple 2A" meta="$1,240 · 3 days" tone="danger" />
                <PreviewRow title="Application ready to review" meta="Jordan Tran · Ballard" tone="info" />
                <PreviewRow title="Tour inquiry · Cascade 4B" meta="Tomorrow 2:00 PM" tone="pending" />
              </div>
            </div>

            <div className="rounded-xl border border-primary/20 bg-primary/5 p-3">
              <div className="flex items-start gap-2">
                <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" strokeWidth={2.25} />
                <div>
                  <p className="text-[12px] font-semibold text-foreground">Inbox reply drafted</p>
                  <p className="mt-0.5 text-[10px] leading-snug text-muted">
                    PropLane drafted a maintenance update for Dana Reyes. Approve before it sends.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-5 border-t border-border/70 bg-background px-1 py-1.5">
            {BOTTOM_TABS.map(({ icon: Icon, label, active }) => (
              <div key={label} className="flex flex-col items-center gap-0.5 px-0.5">
                <Icon
                  className={cn("h-4 w-4", active ? "text-primary" : "text-muted")}
                  strokeWidth={active ? 2.25 : 2}
                />
                <span
                  className={cn(
                    "max-w-full truncate text-[8px] font-medium",
                    active ? "text-primary" : "text-muted",
                  )}
                >
                  {label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function PreviewKpi({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "warning" | "danger" | "info" | "neutral";
}) {
  const toneClass =
    tone === "warning"
      ? "text-[var(--status-pending-fg)]"
      : tone === "danger"
        ? "text-[var(--status-overdue-fg)]"
        : tone === "info"
          ? "text-[var(--status-approved-fg)]"
          : "text-foreground";

  return (
    <div className="rounded-lg border border-border bg-card px-2.5 py-2">
      <p className="text-[9px] font-medium text-muted">{label}</p>
      <p className={cn("mt-0.5 text-base font-semibold tracking-[-0.02em]", toneClass)}>{value}</p>
    </div>
  );
}

function PreviewRow({
  title,
  meta,
  tone,
}: {
  title: string;
  meta: string;
  tone: "danger" | "info" | "pending";
}) {
  const dotClass =
    tone === "danger"
      ? "bg-[var(--status-overdue-fg)]"
      : tone === "info"
        ? "bg-[var(--status-approved-fg)]"
        : "bg-[var(--status-pending-fg)]";

  return (
    <div className="flex items-start gap-2 rounded-lg bg-accent/20 px-2 py-1.5">
      <span className={cn("mt-1 h-1.5 w-1.5 shrink-0 rounded-full", dotClass)} />
      <div className="min-w-0">
        <p className="truncate text-[11px] font-medium text-foreground">{title}</p>
        <p className="text-[10px] text-muted">{meta}</p>
      </div>
    </div>
  );
}
