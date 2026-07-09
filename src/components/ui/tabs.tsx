"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useLayoutEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";

export type TabItem = { href: string; label: string; id: string; dataAttr?: string };

/**
 * Active tab id for a shallow-routed tabbed panel: the server-rendered tab is
 * the initial value; native `pushState` tab switches (TabNav `shallow`) update
 * the pathname without a server roundtrip, and this re-derives the id from it.
 */
export function useShallowTabId<T extends string>(serverTabId: T, validIds: readonly T[]): T {
  const pathname = usePathname();
  const last = pathname?.split("/").filter(Boolean).pop() ?? "";
  return (validIds as readonly string[]).includes(last) ? (last as T) : serverTabId;
}

export function TabNav({
  items,
  activeId,
  shallow = false,
}: {
  items: TabItem[];
  activeId: string;
  /** Switch tabs client-side via history.pushState — no server render. Use only
   *  when every tab renders the same panel keyed by the trailing path segment. */
  shallow?: boolean;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const linkRefs = useRef(new Map<string, HTMLAnchorElement>());
  const [pill, setPill] = useState({ left: 0, top: 0, w: 0, h: 0 });

  const sync = useCallback(() => {
    const wrap = wrapRef.current;
    const el = linkRefs.current.get(activeId);
    if (!wrap || !el) {
      setPill((p) => ({ ...p, w: 0 }));
      return;
    }
    setPill({
      left: el.offsetLeft,
      top: el.offsetTop,
      w: el.offsetWidth,
      h: el.offsetHeight,
    });
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
    <div
      ref={wrapRef}
      className="relative flex min-w-0 max-w-full flex-nowrap gap-1 overflow-x-auto rounded-full border border-border bg-accent/30 p-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
    >
      {pill.w > 0 ? (
        <span
          aria-hidden
          className="pointer-events-none absolute rounded-full border border-border bg-card shadow-[var(--shadow-sm)] transition-[left,top,width,height,box-shadow] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
          style={{ left: pill.left, top: pill.top, width: pill.w, height: pill.h }}
        />
      ) : null}
      {items.map((t) => {
        const active = t.id === activeId;
        const onShallowClick = shallow
          ? (event: MouseEvent<HTMLAnchorElement>) => {
              // Preserve cmd/ctrl/shift/middle-click open-in-new-tab behavior.
              if (event.defaultPrevented || event.button !== 0) return;
              if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
              event.preventDefault();
              window.history.pushState(null, "", t.href);
            }
          : undefined;
        return (
          <Link
            key={t.href}
            href={t.href}
            data-attr={t.dataAttr}
            onClick={onShallowClick}
            ref={(el) => {
              if (el) linkRefs.current.set(t.id, el);
              else linkRefs.current.delete(t.id);
            }}
            className={`relative z-10 shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold transition-colors duration-300 ${
              active ? "text-foreground" : "text-muted hover:text-foreground"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}

export function PillTabs({
  items,
  activeId,
  onChange,
}: {
  items: { id: string; label: string }[];
  activeId: string;
  onChange: (id: string) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRefs = useRef(new Map<string, HTMLButtonElement>());
  const [pill, setPill] = useState({ left: 0, top: 0, w: 0, h: 0 });

  const sync = useCallback(() => {
    const wrap = wrapRef.current;
    const el = btnRefs.current.get(activeId);
    if (!wrap || !el) {
      setPill((p) => ({ ...p, w: 0 }));
      return;
    }
    setPill({
      left: el.offsetLeft,
      top: el.offsetTop,
      w: el.offsetWidth,
      h: el.offsetHeight,
    });
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
    <div
      ref={wrapRef}
      className="relative inline-flex w-fit max-w-full flex-wrap gap-1 rounded-full border border-border bg-accent/30 p-1"
    >
      {pill.w > 0 ? (
        <span
          aria-hidden
          className="pointer-events-none absolute rounded-full border border-border bg-card shadow-[var(--shadow-sm)] transition-[left,top,width,height,box-shadow] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
          style={{ left: pill.left, top: pill.top, width: pill.w, height: pill.h }}
        />
      ) : null}
      {items.map((t) => {
        const active = t.id === activeId;
        return (
          <button
            key={t.id}
            type="button"
            ref={(el) => {
              if (el) btnRefs.current.set(t.id, el);
              else btnRefs.current.delete(t.id);
            }}
            onClick={() => onChange(t.id)}
            className={`relative z-10 shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold transition-colors duration-300 ${
              active ? "text-foreground" : "text-muted hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

export function SectionTabs({
  title,
  tabs,
  activeId,
  actions,
}: {
  title: string;
  tabs: TabItem[];
  activeId: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">{title}</h1>
        <div className="mt-3">
          <TabNav items={tabs} activeId={activeId} />
        </div>
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}
