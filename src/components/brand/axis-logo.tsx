"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useId } from "react";

const markTileClass =
  "flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-sky-200/90 bg-[linear-gradient(165deg,#f0f9ff_0%,#e0f2fe_42%,#dbeafe_100%)] shadow-[0_1px_0_rgba(255,255,255,0.9)_inset,0_8px_22px_rgba(56,146,255,0.18)]";

export type AxisLogoVariant = "default" | "portalHeader" | "adminHeader";

/** Inline “AX”: solid A, X with one diagonal in sky → primary gradient, one diagonal in slate. */
function AxisLogoGlyph({ className = "" }: { className?: string }) {
  const raw = useId().replace(/:/g, "");
  const gradId = `ax-x-${raw}`;

  return (
    <svg
      className={`block h-[26px] w-[42px] shrink-0 ${className}`}
      viewBox="0 0 42 22"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <defs>
        <linearGradient
          id={gradId}
          x1="24.25"
          y1="3.25"
          x2="39.75"
          y2="18.75"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#e0f2fe" />
          <stop offset="45%" stopColor="#7dd3fc" />
          <stop offset="100%" stopColor="#007aff" />
        </linearGradient>
      </defs>
      {/* A */}
      <path
        d="M2.5 18.5L10 2.5L17.5 18.5M6.75 12.25H13.25"
        stroke="#0f172a"
        strokeWidth="2.35"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* X — gradient limb (\) */}
      <path d="M24.25 3.25L39.75 18.75" stroke={`url(#${gradId})`} strokeWidth="2.45" strokeLinecap="round" />
      {/* X — solid limb (/) */}
      <path d="M39.75 3.25L24.25 18.75" stroke="#0f172a" strokeWidth="2.45" strokeLinecap="round" />
    </svg>
  );
}

/** Primary AX mark — light blue tile + SVG glyph. */
export function AxisLogoMark({
  className = "",
  variant,
}: {
  className?: string;
  variant?: AxisLogoVariant;
}) {
  void variant;
  return (
    <div className={`${markTileClass} ${className}`} aria-hidden>
      <AxisLogoGlyph />
    </div>
  );
}

/**
 * Same sky-gradient tile as the header AX mark — use for portal empty states
 * so icons read with the same weight and chrome as the global header.
 */
export function AxisHeaderMarkTile({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`${markTileClass} text-[#0f172a] ${className}`} aria-hidden>
      {children}
    </div>
  );
}

/** Softer shadow variant — same glyph and light blue tile. */
export function AxisLogoMarkSoft({ className = "" }: { className?: string }) {
  return (
    <div
      className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-sky-200/80 bg-[linear-gradient(165deg,#f8fcff_0%,#e8f4ff_50%,#dff0ff_100%)] shadow-[0_1px_0_rgba(255,255,255,0.95)_inset,0_6px_18px_rgba(56,146,255,0.14)] ${className}`}
      aria-hidden
    >
      <AxisLogoGlyph />
    </div>
  );
}

export function AxisLogoWordmark() {
  return (
    <span className="leading-[1.08]">
      <span className="block text-[16px] font-bold tracking-tight text-[#0f172a]">AXIS</span>
      <span className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Housing</span>
    </span>
  );
}

export function AxisLogoLink({
  href = "/",
  variant = "default",
}: {
  href?: string;
  variant?: AxisLogoVariant;
}) {
  return (
    <Link href={href} className="flex items-center gap-3">
      <AxisLogoMark variant={variant} />
      <AxisLogoWordmark />
    </Link>
  );
}
