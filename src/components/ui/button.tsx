"use client";

import { Slot } from "@radix-ui/react-slot";
import type { ButtonHTMLAttributes, MouseEvent, ReactNode } from "react";
import { track } from "@/lib/analytics/track-client";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "outline" | "metallic";

const variants: Record<Variant, string> = {
  primary:
    "text-white shadow-[0_8px_20px_-8px_color-mix(in_srgb,var(--btn-primary)_60%,transparent)] hover:brightness-110 active:scale-[0.99]",
  metallic:
    "text-[#08142e] shadow-[0_6px_16px_-6px_rgba(0,0,0,0.25)] hover:brightness-105 active:scale-[0.99]",
  secondary:
    "border border-primary/30 bg-transparent text-primary shadow-none hover:bg-primary/5 active:scale-[0.99]",
  ghost:
    "bg-transparent text-foreground/80 hover:bg-foreground/5 hover:text-foreground active:scale-[0.99]",
  danger:
    "bg-transparent text-danger shadow-none hover:bg-danger/5 active:scale-[0.99]",
  outline:
    "border border-border bg-card/80 text-foreground shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:border-primary/30 hover:bg-card active:scale-[0.99] [html[data-theme=dark]_&]:portal-outline-control",
};

export function Button({
  className = "",
  variant = "primary",
  style,
  children,
  event,
  eventProps,
  onClick,
  asChild = false,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  children: ReactNode;
  /** Optional named PostHog event fired on click (object_action, non-PII). */
  event?: string;
  /** Optional non-PII properties sent with `event`. */
  eventProps?: Record<string, string | number | boolean | undefined>;
  /** Render as the single child element (via Radix Slot) instead of a <button>, e.g. to wrap a <Link>. */
  asChild?: boolean;
}) {
  const isPrimary = variant === "primary";
  const isMetallic = variant === "metallic";
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      className={`inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold outline-none ring-primary/0 transition-[transform,box-shadow,filter,background-color,border-color] duration-200 ease-out focus-visible:ring-2 focus-visible:ring-primary/25 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 ${variants[variant]} ${className}`}
      style={
        isPrimary
          ? { background: "var(--btn-primary)", ...style }
          : isMetallic
            ? { background: "var(--btn-metallic)", boxShadow: "0 6px 16px -6px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.9)", ...style }
            : style
      }
      onClick={(e: MouseEvent<HTMLButtonElement>) => {
        if (event) track(event, eventProps);
        onClick?.(e);
      }}
      {...props}
    >
      {children}
    </Comp>
  );
}
