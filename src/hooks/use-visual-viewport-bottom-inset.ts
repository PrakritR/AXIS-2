"use client";

import { useEffect, useState } from "react";

/** Pixels covered by the on-screen keyboard (0 when hidden). */
export function computeVisualViewportBottomInset(
  innerHeight: number,
  viewportHeight: number,
  viewportOffsetTop: number,
): number {
  return Math.max(0, innerHeight - viewportHeight - viewportOffsetTop);
}

export function measureVisualViewportBottomInset(): number {
  if (typeof window === "undefined") return 0;
  const viewport = window.visualViewport;
  if (!viewport) return 0;
  return computeVisualViewportBottomInset(window.innerHeight, viewport.height, viewport.offsetTop);
}

/**
 * Tracks how much of the layout viewport is covered by the software keyboard.
 * Uses VisualViewport so iOS/Android WebViews shift fixed panels correctly.
 */
export function useVisualViewportBottomInset(active = true): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    if (!active) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset inset when tracking is disabled
      setInset(0);
      return;
    }

    const viewport = window.visualViewport;
    if (!viewport) return;

    const update = () => setInset(measureVisualViewportBottomInset());

    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    window.addEventListener("resize", update);

    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [active]);

  return inset;
}
