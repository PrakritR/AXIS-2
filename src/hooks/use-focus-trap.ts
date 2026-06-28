"use client";

import type { RefObject } from "react";
import { useEffect, useRef } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useFocusTrap(active: boolean, containerRef: RefObject<HTMLElement | null>) {
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) return;

    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const container = containerRef.current;
    if (!container) return;

    const focusables = () =>
      Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => !el.hasAttribute("disabled") && el.tabIndex !== -1,
      );

    const first = focusables()[0];
    first?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const nodes = focusables();
      if (nodes.length === 0) return;

      const firstNode = nodes[0]!;
      const lastNode = nodes[nodes.length - 1]!;
      const activeEl = document.activeElement;

      if (event.shiftKey && activeEl === firstNode) {
        event.preventDefault();
        lastNode.focus();
      } else if (!event.shiftKey && activeEl === lastNode) {
        event.preventDefault();
        firstNode.focus();
      }
    };

    container.addEventListener("keydown", onKeyDown);

    return () => {
      container.removeEventListener("keydown", onKeyDown);
      previousFocusRef.current?.focus();
    };
  }, [active, containerRef]);
}
