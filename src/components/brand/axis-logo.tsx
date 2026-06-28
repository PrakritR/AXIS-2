"use client";

import Link from "next/link";
import type { ReactNode } from "react";

const markTileBase =
  "flex shrink-0 items-center justify-center border border-white/35 bg-[linear-gradient(150deg,rgba(255,255,255,0.34),rgba(255,255,255,0.1))] shadow-[inset_0_1px_0_rgba(255,255,255,0.45)] [html[data-theme=light]_&]:border-border/80 [html[data-theme=light]_&]:bg-[linear-gradient(150deg,#ffffff,#e9eefb)] [html[data-theme=light]_&]:shadow-[inset_0_1px_0_#ffffff,0_1px_2px_rgba(15,23,42,0.05)]";

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

/** Inline "AX": crisp architectural mark — solid strokes, no glow or gradient blur. */
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
      shapeRendering="geometricPrecision"
      aria-hidden
    >
      <path
        d="M3.5 21.5L11 4L18.5 21.5M7.55 14.25H14.45"
        className="stroke-white [html[data-theme=light]_&]:stroke-foreground"
        strokeWidth="2.55"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M27 4L43 22"
        className="stroke-steel-light [html[data-theme=light]_&]:stroke-primary"
        strokeWidth="2.75"
        strokeLinecap="round"
      />
      <path
        d="M43 4L27 22"
        className="stroke-white/85 [html[data-theme=light]_&]:stroke-cobalt-deep"
        strokeWidth="2.55"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Primary AX mark — crisp gradient tile + SVG glyph. */
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
 * Same tile chrome as the header AX mark — use for portal empty states
 * so icons read with the same weight as the global header.
 */
export function AxisHeaderMarkTile({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`${markTileBase} ${markTileSizes.default} text-foreground ${className}`} aria-hidden>
      {children}
    </div>
  );
}

/** Lighter shadow variant — same glyph and tile. */
export function AxisLogoMarkSoft({ className = "" }: { className?: string }) {
  return (
    <div className={`${markTileBase} h-14 w-14 rounded-[20px] ${className}`} aria-hidden>
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
