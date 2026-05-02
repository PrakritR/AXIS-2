"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useId } from "react";

const markTileClass =
  "flex h-14 w-14 shrink-0 items-center justify-center rounded-[18px] border border-slate-200/90 bg-white shadow-[0_12px_28px_-24px_rgba(15,23,42,0.24)]";

export type AxisLogoVariant = "default" | "portalHeader" | "adminHeader";

/** Inline “AX”: quieter architectural mark with a balanced A and a brighter brand X. */
function AxisLogoGlyph({ className = "" }: { className?: string }) {
  const raw = useId().replace(/:/g, "");
  const gradId = `ax-x-${raw}`;
  const tileGlowId = `ax-glow-${raw}`;

  return (
    <svg
      className={`block h-[28px] w-[46px] shrink-0 ${className}`}
      viewBox="0 0 46 26"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <defs>
        <radialGradient id={tileGlowId} cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(34 7) rotate(132.734) scale(20.9165 19.7768)">
          <stop offset="0%" stopColor="#dbeafe" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        <linearGradient
          id={gradId}
          x1="27"
          y1="4"
          x2="43"
          y2="22"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#7cc1ff" />
          <stop offset="42%" stopColor="#2f8fff" />
          <stop offset="100%" stopColor="#0a84ff" />
        </linearGradient>
      </defs>
      <path d="M15 0H46V26H15Z" fill={`url(#${tileGlowId})`} />
      {/* A */}
      <path
        d="M3.5 21.5L11 4L18.5 21.5M7.55 14.25H14.45"
        stroke="#0f172a"
        strokeWidth="2.55"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* X — bright lead stroke */}
      <path d="M27 4L43 22" stroke={`url(#${gradId})`} strokeWidth="2.75" strokeLinecap="round" />
      {/* X — dark balancing stroke */}
      <path d="M43 4L27 22" stroke="#1e3a8a" strokeWidth="2.55" strokeLinecap="round" />
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
      className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-[20px] border border-slate-200/80 bg-white/95 shadow-[0_8px_22px_-18px_rgba(15,23,42,0.16)] ${className}`}
      aria-hidden
    >
      <AxisLogoGlyph />
    </div>
  );
}

export function AxisLogoWordmark() {
  return (
    <span className="leading-none">
      <span className="block text-[17px] font-semibold tracking-[-0.035em] text-[#0f172a]">Axis</span>
      <span className="mt-1 block text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">Housing</span>
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
