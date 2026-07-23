"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Shared playback helpers for the self-playing homepage marketing demos
 * (inbox-approve, applications pipeline). Kept in one place so both demos
 * pause the same way and honor reduced motion identically.
 */

/** Live `prefers-reduced-motion` flag. */
export function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  return reduced;
}

/**
 * Gates a self-playing loop to only run while its section is on screen AND the
 * tab is visible. Returns a ref to attach to the section, `inView`, and
 * `playing` (in view and tab foregrounded). Unlike a one-shot IntersectionObserver
 * that disconnects after first paint, this keeps observing so the loop stops
 * spinning setState when the section scrolls away or the tab is backgrounded.
 */
export function useAutoplayGate<T extends HTMLElement = HTMLElement>(threshold = 0.25) {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  const [tabVisible, setTabVisible] = useState(true);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setInView(Boolean(entry?.isIntersecting)), {
      threshold,
      rootMargin: "0px 0px -6% 0px",
    });
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);

  useEffect(() => {
    const sync = () => setTabVisible(!document.hidden);
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);

  return { ref, inView, playing: inView && tabVisible };
}

/**
 * A cancellable timer pool for scripted async loops. `wait(ms)` resolves after
 * the delay and self-prunes its id, so the pending set stays bounded no matter
 * how long the loop runs. `cancel()` clears everything and flips `cancelled`.
 */
export function createTimerPool() {
  const pending = new Set<number>();
  let cancelled = false;

  const wait = (ms: number) =>
    new Promise<void>((resolve) => {
      const id = window.setTimeout(() => {
        pending.delete(id);
        resolve();
      }, ms);
      pending.add(id);
    });

  const cancel = () => {
    cancelled = true;
    for (const id of pending) window.clearTimeout(id);
    pending.clear();
  };

  return {
    wait,
    cancel,
    get cancelled() {
      return cancelled;
    },
  };
}
