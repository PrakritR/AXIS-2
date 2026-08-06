"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export type PortalTabItem = {
  id: string;
  label: string;
  count?: number;
  dataAttr?: string;
};

/**
 * Unified portal tabs — underline on desktop (≥md), segmented control on mobile,
 * with horizontal scroll-snap when tabs overflow.
 */
export function PortalTabs({
  items,
  activeId,
  onChange,
  className,
  ariaLabel = "Section tabs",
}: {
  items: PortalTabItem[];
  activeId: string;
  onChange: (id: string) => void;
  className?: string;
  ariaLabel?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRefs = useRef(new Map<string, HTMLButtonElement>());
  const [pill, setPill] = useState({ left: 0, w: 0 });

  const sync = useCallback(() => {
    const wrap = wrapRef.current;
    const el = btnRefs.current.get(activeId);
    if (!wrap || !el) {
      setPill((p) => ({ ...p, w: 0 }));
      return;
    }
    setPill({ left: el.offsetLeft, w: el.offsetWidth });
  }, [activeId]);

  useLayoutEffect(() => {
    sync();
  }, [sync]);

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const ro = new ResizeObserver(() => sync());
    ro.observe(wrap);
    window.addEventListener("resize", sync);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", sync);
    };
  }, [sync]);

  return (
    <>
      {/* Mobile: segmented control with scroll-snap */}
      <div
        ref={wrapRef}
        role="tablist"
        aria-label={ariaLabel}
        className={cn(
          "relative flex w-full gap-1 overflow-x-auto rounded-2xl border border-border bg-accent/30 p-1",
          "[scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden",
          "snap-x snap-mandatory scroll-px-1",
          "md:hidden",
          className,
        )}
        data-slot="portal-tabs-mobile"
      >
        {pill.w > 0 ? (
          <span
            aria-hidden
            className="pointer-events-none absolute bottom-1 top-1 rounded-xl bg-card shadow-[var(--shadow-sm)] transition-[left,width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
            style={{ left: pill.left, width: pill.w }}
          />
        ) : null}
        {items.map((item) => {
          const active = item.id === activeId;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={active}
              data-attr={item.dataAttr}
              ref={(el) => {
                if (el) btnRefs.current.set(item.id, el);
                else btnRefs.current.delete(item.id);
              }}
              onClick={() => onChange(item.id)}
              className={cn(
                "relative z-10 min-w-0 flex-1 basis-0 snap-start rounded-xl px-2 py-2 text-center text-sm font-semibold transition-colors min-h-11 sm:px-3.5",
                active ? "text-foreground" : "text-muted hover:text-foreground",
              )}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      {/* Desktop: underline tabs */}
      <div
        role="tablist"
        aria-label={ariaLabel}
        className={cn(
          "hidden min-w-0 w-full gap-0 border-b border-border md:flex",
          className,
        )}
        data-slot="portal-tabs-desktop"
      >
        {items.map((item) => {
          const active = item.id === activeId;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={active}
              data-attr={item.dataAttr}
              onClick={() => onChange(item.id)}
              className={cn(
                "-mb-px min-h-11 flex-1 basis-0 border-b-2 px-1 pb-2.5 text-center text-sm font-semibold transition-colors",
                active
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted hover:text-foreground",
              )}
            >
              {item.label}
            </button>
          );
        })}
      </div>
    </>
  );
}
