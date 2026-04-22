"use client";

import Link from "next/link";
import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from "react";

export type TabItem = { href: string; label: string; id: string };

export function TabNav({
  items,
  activeId,
}: {
  items: TabItem[];
  activeId: string;
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
      className="relative flex flex-wrap gap-1 rounded-full border border-slate-200 bg-slate-50 p-1"
    >
      {pill.w > 0 ? (
        <span
          aria-hidden
          className="pointer-events-none absolute rounded-full bg-primary shadow-[0_2px_12px_-2px_rgba(0,122,255,0.45)] transition-[left,top,width,height,box-shadow] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
          style={{ left: pill.left, top: pill.top, width: pill.w, height: pill.h }}
        />
      ) : null}
      {items.map((t) => {
        const active = t.id === activeId;
        return (
          <Link
            key={t.href}
            href={t.href}
            ref={(el) => {
              if (el) linkRefs.current.set(t.id, el);
              else linkRefs.current.delete(t.id);
            }}
            className={`relative z-10 rounded-full px-3 py-1.5 text-sm font-semibold transition-colors duration-300 ${
              active ? "text-primary-foreground" : "text-slate-600 hover:text-slate-900"
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
      className="relative flex flex-wrap gap-1 rounded-full border border-slate-200 bg-slate-50 p-1"
    >
      {pill.w > 0 ? (
        <span
          aria-hidden
          className="pointer-events-none absolute rounded-full bg-primary shadow-[0_2px_12px_-2px_rgba(0,122,255,0.45)] transition-[left,top,width,height] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
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
            className={`relative z-10 rounded-full px-3 py-1.5 text-sm font-semibold transition-colors duration-300 ${
              active ? "text-primary-foreground" : "text-slate-600 hover:text-slate-900"
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
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
        <div className="mt-3">
          <TabNav items={tabs} activeId={activeId} />
        </div>
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}
