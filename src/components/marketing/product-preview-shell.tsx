"use client";

import { SegmentedThree } from "@/components/ui/segmented-control";
import { useState } from "react";

export type ProductPreviewMode = "static" | "interactive";
export type ProductScene = "manager" | "resident" | "listings";

export interface ProductPreviewShellProps {
  mode?: ProductPreviewMode;
  scene?: ProductScene;
  className?: string;
}

/**
 * Decorative product UI mock for the landing page.
 * Phase 2: mode="interactive" will embed a sandboxed portal preview.
 */
export function ProductPreviewShell({
  mode = "static",
  scene: initialScene = "manager",
  className = "",
}: ProductPreviewShellProps) {
  const [scene, setScene] = useState<ProductScene>(initialScene);

  if (mode === "interactive") {
    return (
      <div className={`mx-auto max-w-6xl px-4 sm:px-5 ${className}`}>
        <div className="landing-preview-frame glass-card rounded-2xl p-8 text-center text-sm text-muted">
          Interactive preview coming soon.
        </div>
      </div>
    );
  }

  return (
    <div className={`mx-auto max-w-6xl px-4 sm:px-5 ${className}`}>
      <div className="mb-4 flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-primary">
          Platform preview
        </p>
        <SegmentedThree
          value={scene}
          onChange={setScene}
          first={{ id: "manager", label: "Manager" }}
          second={{ id: "resident", label: "Resident" }}
          third={{ id: "listings", label: "Listings" }}
          className="w-full max-w-xs sm:max-w-sm"
        />
      </div>

      <div
        className="landing-preview-frame relative overflow-hidden rounded-2xl border border-border/60 bg-[var(--portal-surface-dark,#0b1120)] shadow-[0_32px_80px_-24px_rgba(0,0,0,0.55),0_0_0_1px_rgba(255,255,255,0.06)_inset]"
        aria-hidden
      >
        <div className="pointer-events-none flex min-h-[320px] sm:min-h-[400px]">
          <PreviewSidebar scene={scene} />
          <div className="flex min-w-0 flex-1 flex-col">
            <PreviewTopbar scene={scene} />
            <div className="flex flex-1 gap-0">
              <PreviewMain scene={scene} />
              {scene === "manager" ? <PreviewMetaPanel /> : null}
            </div>
          </div>
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#080b14]/90 to-transparent" />
      </div>
    </div>
  );
}

function PreviewSidebar({ scene }: { scene: ProductScene }) {
  const navItems =
    scene === "resident"
      ? ["Dashboard", "Lease", "Payments", "Inbox"]
      : scene === "listings"
        ? ["Search", "Properties", "Tours", "Apply"]
        : ["Dashboard", "Applications", "Leases", "Inbox"];

  return (
    <aside className="hidden w-[200px] shrink-0 border-r border-white/8 bg-gradient-to-b from-[#1a2844] to-[#0e1830] sm:block">
      <div className="border-b border-white/8 px-4 py-4">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-card/12" />
          <div className="space-y-1">
            <div className="h-2 w-16 rounded bg-card/20" />
            <div className="h-1.5 w-10 rounded bg-card/10" />
          </div>
        </div>
      </div>
      <nav className="space-y-0.5 p-3">
        {navItems.map((item, i) => (
          <div
            key={item}
            className={`flex items-center gap-2 rounded-lg px-2.5 py-2 text-[11px] font-medium ${
              i === 0 ? "bg-card/10 text-white" : "text-white/45"
            }`}
          >
            <div className="h-3.5 w-3.5 rounded bg-card/15" />
            {item}
          </div>
        ))}
      </nav>
    </aside>
  );
}

function PreviewTopbar({ scene }: { scene: ProductScene }) {
  const title =
    scene === "resident" ? "Welcome, Alex" : scene === "listings" ? "Find your next room" : "Manager dashboard";
  return (
    <header className="flex items-center justify-between border-b border-white/8 px-4 py-3 sm:px-5">
      <div>
        <p className="text-[13px] font-semibold text-white/90">{title}</p>
        <p className="text-[10px] text-white/40">
          {scene === "manager" ? "3 properties · 12 active leases" : "PropLane Housing"}
        </p>
      </div>
      <div className="flex gap-2">
        <div className="h-7 w-7 rounded-full bg-card/10" />
        <div className="h-7 w-16 rounded-full bg-primary/30" />
      </div>
    </header>
  );
}

function PreviewMain({ scene }: { scene: ProductScene }) {
  if (scene === "listings") {
    return (
      <div className="flex-1 p-4 sm:p-5">
        <div className="mb-4 h-10 rounded-xl border border-white/10 bg-card/5" />
        <div className="grid gap-3 sm:grid-cols-2">
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className="rounded-xl border border-white/8 bg-card/5 p-3">
              <div className="mb-2 h-20 rounded-lg bg-card/8" />
              <div className="h-2 w-2/3 rounded bg-card/15" />
              <div className="mt-1.5 h-1.5 w-1/3 rounded bg-card/10" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (scene === "resident") {
    return (
      <div className="flex-1 space-y-3 p-4 sm:p-5">
        <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-3 py-2">
          <div className="h-2 w-32 rounded bg-emerald-300/40" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {["Lease", "Payments", "Move-in", "Services"].map((label) => (
            <div key={label} className="rounded-xl border border-white/8 bg-card/5 p-3">
              <p className="text-[10px] font-semibold text-white/50">{label}</p>
              <div className="mt-2 h-2 w-1/2 rounded bg-card/15" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 p-4 sm:p-5">
      <div className="mb-4 grid grid-cols-3 gap-2">
        {["Applications", "Occupancy", "Revenue"].map((label) => (
          <div key={label} className="rounded-xl border border-white/8 bg-card/5 p-2.5">
            <p className="text-[9px] font-bold uppercase tracking-wider text-white/40">{label}</p>
            <div className="mt-1.5 h-4 w-10 rounded bg-card/20" />
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-white/8 bg-card/5">
        <div className="border-b border-white/8 px-3 py-2">
          <div className="h-2 w-24 rounded bg-card/15" />
        </div>
        {[1, 2, 3, 4].map((n) => (
          <div key={n} className="flex items-center gap-3 border-b border-white/5 px-3 py-2.5 last:border-0">
            <div className="h-6 w-6 rounded-full bg-card/10" />
            <div className="flex-1 space-y-1">
              <div className="h-2 w-3/5 rounded bg-card/15" />
              <div className="h-1.5 w-2/5 rounded bg-card/8" />
            </div>
            <div className="h-5 w-14 rounded-full bg-primary/25" />
          </div>
        ))}
      </div>
    </div>
  );
}

function PreviewMetaPanel() {
  return (
    <aside className="hidden w-[160px] shrink-0 border-l border-white/8 p-3 lg:block">
      <p className="text-[9px] font-bold uppercase tracking-wider text-white/35">Details</p>
      <div className="mt-3 space-y-2">
        {["Status", "Priority", "Assignee"].map((label) => (
          <div key={label}>
            <p className="text-[9px] text-white/30">{label}</p>
            <div className="mt-1 h-2 w-full rounded bg-card/10" />
          </div>
        ))}
      </div>
    </aside>
  );
}
