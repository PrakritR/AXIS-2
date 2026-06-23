"use client";

import Link from "next/link";
import type { ReactNode } from "react";

const markTileBase =
  "flex shrink-0 items-center justify-center border border-[var(--glass-border)] bg-[var(--glass-fill)] shadow-[var(--shadow-card)] backdrop-blur-xl [background-image:linear-gradient(145deg,rgba(255,255,255,0.92)_0%,rgba(188,212,255,0.35)_100%)]";

const markTileSizes = {
  default: "h-14 w-14 rounded-[18px]",
  compact: "h-10 w-10 rounded-[14px]",
} as const;

const glyphSizes = {
  default: "h-[28px] w-[46px]",
  compact: "h-[20px] w-[33px]",
} as const;

export type AxisLogoSize = keyof typeof markTileSizes;

export type AxisLogoVariant = "default" | "portalHeader" | "adminHeader";

/** Inline "AX": quieter architectural mark with a balanced A and a brighter brand X. */
function AxisLogoGlyph({
  className = "",
  size = "default",
}: {
  className?: string;
  size?: AxisLogoSize;
}) {
  return (
    <svg
      className={`block shrink-0 ${glyphSizes[size]} ${className}`}
      viewBox="0 0 46 26"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <defs>
        <radialGradient id="axis-logo-glow" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(34 7) rotate(132.734) scale(20.9165 19.7768)">
          <stop offset="0%" stopColor="var(--steel-light)" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="axis-logo-x" x1="27" y1="4" x2="43" y2="22" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="var(--steel-light)" />
          <stop offset="42%" stopColor="var(--sky)" />
          <stop offset="100%" stopColor="var(--primary)" />
        </linearGradient>
      </defs>
      <path d="M15 0H46V26H15Z" fill="url(#axis-logo-glow)" />
      <path
        d="M3.5 21.5L11 4L18.5 21.5M7.55 14.25H14.45"
        stroke="var(--foreground)"
        strokeWidth="2.55"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M27 4L43 22" stroke="url(#axis-logo-x)" strokeWidth="2.75" strokeLinecap="round" />
      <path d="M43 4L27 22" stroke="var(--cobalt-deep)" strokeWidth="2.55" strokeLinecap="round" />
    </svg>
  );
}

/** Primary AX mark — frosted gradient tile + SVG glyph. */
export function AxisLogoMark({
  className = "",
  variant,
  size = "default",
}: {
  className?: string;
  variant?: AxisLogoVariant;
  size?: AxisLogoSize;
}) {
  void variant;
  return (
    <div className={`${markTileBase} ${markTileSizes[size]} ${className}`} aria-hidden>
      <AxisLogoGlyph size={size} />
    </div>
  );
}

/**
 * Same sky-gradient tile as the header AX mark — use for portal empty states
 * so icons read with the same weight and chrome as the global header.
 */
export function AxisHeaderMarkTile({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`${markTileBase} ${markTileSizes.default} text-foreground ${className}`} aria-hidden>
      {children}
    </div>
  );
}

/** Softer shadow variant — same glyph and frosted tile. */
export function AxisLogoMarkSoft({ className = "" }: { className?: string }) {
  return (
    <div
      className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-[20px] border border-[var(--glass-border)] bg-[var(--glass-fill)] shadow-[0_8px_22px_-18px_rgba(15,23,42,0.16)] backdrop-blur-xl [background-image:linear-gradient(145deg,rgba(255,255,255,0.92)_0%,rgba(188,212,255,0.35)_100%)] ${className}`}
      aria-hidden
    >
      <AxisLogoGlyph />
    </div>
  );
}

export function AxisLogoWordmark({ size = "default" }: { size?: AxisLogoSize }) {
  return (
    <span
      className={`font-semibold tracking-[-0.035em] text-foreground ${size === "compact" ? "text-[15px]" : "text-[17px]"}`}
    >
      Axis
    </span>
  );
}

export function AxisLogoLink({
  href = "/",
  variant = "default",
  size = "default",
}: {
  href?: string;
  variant?: AxisLogoVariant;
  size?: AxisLogoSize;
}) {
  return (
    <Link href={href} className={`flex items-center ${size === "compact" ? "gap-2" : "gap-3"}`}>
      <AxisLogoMark variant={variant} size={size} />
      <AxisLogoWordmark size={size} />
    </Link>
  );
}
