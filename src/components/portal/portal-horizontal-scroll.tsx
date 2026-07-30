"use client";

import { useEffect, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  applyHorizontalWheelScroll,
  findHorizontalScrollTarget,
  HORIZONTAL_SCROLL_ATTR,
  HORIZONTAL_SCROLL_CAPTURE_ATTR,
  HORIZONTAL_SCROLL_SELECTOR,
} from "@/lib/horizontal-scroll";
import { PORTAL_MAIN_CONTENT_ID } from "@/lib/portal-layout-classes";

function installPortalHorizontalWheelScroll(root: HTMLElement) {
  const onWheel = (event: WheelEvent) => {
    if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;

    let el = event.target as HTMLElement | null;
    while (el && el !== root) {
      if (el.hasAttribute(HORIZONTAL_SCROLL_ATTR)) {
        applyHorizontalWheelScroll(el, event);
        return;
      }
      if (el.hasAttribute(HORIZONTAL_SCROLL_CAPTURE_ATTR)) {
        const scrollEl = findHorizontalScrollTarget(el);
        if (scrollEl && applyHorizontalWheelScroll(scrollEl, event)) return;
      }
      el = el.parentElement;
    }
  };

  root.addEventListener("wheel", onWheel, { passive: false, capture: true });
  return () => root.removeEventListener("wheel", onWheel, { capture: true });
}

/** Installs portal-wide wheel → horizontal scroll forwarding for marked rows. */
export function PortalHorizontalScrollRoot({ children }: { children: ReactNode }) {
  useEffect(() => {
    const root = document.getElementById(PORTAL_MAIN_CONTENT_ID);
    if (!root) return;
    return installPortalHorizontalWheelScroll(root);
  }, []);

  return children;
}

/**
 * Wider hit band for tab/action rows — wheel anywhere in this wrapper scrolls the nested
 * `[data-horizontal-scroll]` row (not only directly over a pill).
 */
export function HorizontalScrollCapture({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)} {...{ [HORIZONTAL_SCROLL_CAPTURE_ATTR]: "" }}>
      {children}
    </div>
  );
}

export { HORIZONTAL_SCROLL_ATTR, HORIZONTAL_SCROLL_SELECTOR };
