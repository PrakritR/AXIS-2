"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Scripted, self-contained "watch it work" overlays for the /demo "Run demo"
 * tour. They render CONTAINED inside the demo frame (absolute inset-0 over the
 * active panel) and play a short, timed animation demonstrating a real Axis
 * flow end-to-end:
 *
 *  - `listing`  — filling out and publishing a new listing.
 *  - `payment`  — a rent payment being made and clearing.
 *
 * These are visual demonstrations layered over the sandboxed portal panels: no
 * real Stripe charge, no wizard submission, no persisted data. The timings are
 * tuned to the tour step durations in `demo-portal-shell.tsx`.
 */
export type ShowcaseKind = "listing" | "payment";

export function DemoShowcaseOverlay({ kind }: { kind: ShowcaseKind }) {
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-background/55 px-4 backdrop-blur-[2px]">
      {kind === "listing" ? <ListingShowcase /> : <PaymentShowcase />}
    </div>
  );
}

function Spinner({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn("animate-spin", className)} fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function CheckBadge({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.14" />
      <path d="M8 12.5l2.5 2.5L16 9" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Advance through phases on a fixed schedule. `steps` is a list of delays (ms
 * from mount) at which to bump the phase index. Cleaned up on unmount so the
 * tour advancing (which unmounts this) never leaves timers running.
 */
function usePhases(schedule: number[]): number {
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    const timers = schedule.map((delay, i) =>
      window.setTimeout(() => setPhase(i + 1), delay),
    );
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [schedule]);
  return phase;
}

const LISTING_SCHEDULE = [600, 1400, 2200, 3000, 3900, 5200];
function ListingShowcase() {
  const phase = usePhases(LISTING_SCHEDULE);
  const fields: { label: string; value: string; at: number }[] = [
    { label: "Address", value: "1200 Pike St · Unit 4B, Seattle", at: 1 },
    { label: "Monthly rent", value: "$2,400 / mo", at: 2 },
    { label: "Layout", value: "2 bed · 1 bath · 780 sqft", at: 3 },
    { label: "Photos", value: "3 photos uploaded", at: 4 },
  ];
  const publishing = phase === 5;
  const published = phase >= 6;

  return (
    <div className="glass-card w-full max-w-sm rounded-2xl border border-primary/15 p-5 shadow-[0_24px_60px_-24px_rgba(15,23,42,0.5)]">
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-primary/12 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-primary">
          Demo
        </span>
        <p className="text-sm font-semibold tracking-[-0.01em] text-foreground">Creating a listing</p>
      </div>

      <div className="mt-4 space-y-2.5">
        {fields.map((f) => {
          const filled = phase >= f.at;
          return (
            <div
              key={f.label}
              className={cn(
                "flex items-center justify-between rounded-xl border px-3 py-2 text-sm transition-all duration-300",
                filled
                  ? "border-primary/25 bg-primary/[0.06]"
                  : "border-border bg-foreground/[0.02] opacity-55",
              )}
            >
              <span className="text-xs font-medium text-muted">{f.label}</span>
              <span className={cn("text-right font-medium", filled ? "text-foreground" : "text-muted/50")}>
                {filled ? f.value : "…"}
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-4">
        {published ? (
          <div className="flex items-center justify-center gap-2 rounded-full bg-[var(--status-approved-bg,rgba(16,185,129,0.12))] px-4 py-2.5 text-sm font-semibold text-[var(--status-approved-fg,#059669)]">
            <CheckBadge className="h-5 w-5" />
            Listing published — live on PropLane
          </div>
        ) : (
          <button
            type="button"
            disabled
            className={cn(
              "flex w-full items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold text-white transition",
              publishing ? "opacity-90" : "opacity-100",
            )}
            style={{ background: "var(--btn-primary)" }}
          >
            {publishing ? <Spinner className="h-4 w-4" /> : null}
            {publishing ? "Publishing…" : "Publish listing"}
          </button>
        )}
      </div>
    </div>
  );
}

const PAYMENT_SCHEDULE = [800, 1800, 2700, 4600];
function PaymentShowcase() {
  const phase = usePhases(PAYMENT_SCHEDULE);
  const paying = phase === 3;
  const paid = phase >= 4;

  return (
    <div className="glass-card w-full max-w-sm rounded-2xl border border-primary/15 p-5 shadow-[0_24px_60px_-24px_rgba(15,23,42,0.5)]">
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-primary/12 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-primary">
          Demo
        </span>
        <p className="text-sm font-semibold tracking-[-0.01em] text-foreground">Paying rent</p>
      </div>

      <div className="mt-4 rounded-xl border border-border bg-foreground/[0.02] px-4 py-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted">July rent · Unit 4B</span>
          <span className="text-base font-semibold text-foreground">$2,400.00</span>
        </div>
        <div
          className={cn(
            "mt-2 flex items-center gap-2 text-xs transition-opacity duration-300",
            phase >= 1 ? "opacity-100" : "opacity-40",
          )}
        >
          <span className="grid h-6 w-9 place-items-center rounded-md bg-[#1a1f36] text-[9px] font-bold text-white">
            VISA
          </span>
          <span className="text-muted">Card ending 4242</span>
        </div>
      </div>

      <div className="mt-4">
        {paid ? (
          <div className="space-y-2">
            <div className="flex items-center justify-center gap-2 rounded-full bg-[var(--status-approved-bg,rgba(16,185,129,0.12))] px-4 py-2.5 text-sm font-semibold text-[var(--status-approved-fg,#059669)]">
              <CheckBadge className="h-5 w-5" />
              Payment successful
            </div>
            <p className="text-center text-xs text-muted">Receipt emailed · balance now $0.00</p>
          </div>
        ) : (
          <button
            type="button"
            disabled
            className={cn(
              "flex w-full items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold text-white transition",
              phase === 2 && "ring-4 ring-primary/25",
            )}
            style={{ background: "var(--btn-primary)" }}
          >
            {paying ? <Spinner className="h-4 w-4" /> : null}
            {paying ? "Processing payment…" : "Pay $2,400.00"}
          </button>
        )}
      </div>
    </div>
  );
}
