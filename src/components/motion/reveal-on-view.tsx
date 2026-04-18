"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

type RevealOnViewProps = {
  children: ReactNode;
  className?: string;
  /** Extra delay after intersection (ms), for staggered siblings. */
  delayMs?: number;
};

/**
 * Scroll-triggered fade + translate. Runs once when the block enters the viewport.
 */
export function RevealOnView({ children, className = "", delayMs = 0 }: RevealOnViewProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -6% 0px", threshold: 0.06 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const style: CSSProperties | undefined =
    visible && delayMs > 0 ? { transitionDelay: `${delayMs}ms` } : undefined;

  return (
    <div
      ref={ref}
      className={`reveal-on-view ${visible ? "reveal-on-view--visible" : ""} ${className}`.trim()}
      style={style}
    >
      {children}
    </div>
  );
}
