"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

const NAVBAR_ID = "axis-public-navbar";
const PREVIEW_SCROLL_SELECTOR = "[data-listing-preview-scroll]";

const nav = [
  { id: "floor-plans", label: "Floor plans" },
  { id: "lease-basics", label: "Lease basics" },
  { id: "amenities", label: "Amenities" },
  { id: "bundles", label: "Bundles & leasing" },
  { id: "house-rules", label: "House rules" },
  { id: "location", label: "Location" },
] as const;

function getScrollRootFromSubnav(subnavEl: HTMLElement | null): HTMLElement | null {
  return subnavEl?.closest<HTMLElement>(PREVIEW_SCROLL_SELECTOR) ?? null;
}

function getListingScrollOffsetPx(mode: "page" | "modal", subnavEl: HTMLElement | null): number {
  if (mode === "modal") {
    const raw = getComputedStyle(document.documentElement).getPropertyValue("--listing-sticky-stack").trim();
    if (raw) {
      const px = Number.parseFloat(raw);
      if (!Number.isNaN(px)) return px;
    }
    return subnavEl?.offsetHeight ? subnavEl.offsetHeight + 12 : 72;
  }
  const raw = getComputedStyle(document.documentElement).getPropertyValue("--listing-sticky-stack").trim();
  if (raw) {
    const px = Number.parseFloat(raw);
    if (!Number.isNaN(px)) return px;
  }
  const navEl = document.getElementById(NAVBAR_ID);
  const navH = navEl?.getBoundingClientRect().height ?? 64;
  return navH + 52 + 12;
}

function scrollToSection(id: string, mode: "page" | "modal", subnavEl: HTMLElement | null) {
  const el = document.getElementById(id);
  if (!el) return;

  if (mode === "modal") {
    const root = getScrollRootFromSubnav(subnavEl);
    if (!root || !subnavEl) return;
    const subnavH = subnavEl.getBoundingClientRect().height;
    const y = el.getBoundingClientRect().top - root.getBoundingClientRect().top + root.scrollTop;
    root.scrollTo({ top: Math.max(0, y - subnavH - 10), behavior: "smooth" });
    return;
  }

  const offset = getListingScrollOffsetPx("page", subnavEl);
  const top = el.getBoundingClientRect().top + window.scrollY - offset;
  window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
}

/** Sticky section tabs: full marketing pages use the public navbar offset; preview modal pins to top of its scroller. */
export function ListingStickySubnav({ mode = "page" }: { mode?: "page" | "modal" }) {
  const rootRef = useRef<HTMLElement>(null);
  const tabRefs = useRef<Map<string, HTMLButtonElement | null>>(new Map());
  const [stickyTopPx, setStickyTopPx] = useState(mode === "modal" ? 0 : 64);
  const [pageScrolled, setPageScrolled] = useState(false);
  const [activeId, setActiveId] = useState<string>(nav[0].id);

  const publishStackAndSpy = useCallback(() => {
    const subEl = rootRef.current;
    if (!subEl) return;

    if (mode === "modal") {
      const scrollRoot = getScrollRootFromSubnav(subEl);
      const subH = subEl.offsetHeight;
      scrollRoot?.style.setProperty("--listing-sticky-stack", `${subH + 12}px`);

      setStickyTopPx(0);
      setPageScrolled(scrollRoot ? scrollRoot.scrollTop > 8 : false);

      const line = subEl.getBoundingClientRect().bottom + 6;
      let next: (typeof nav)[number]["id"] = nav[0].id;
      for (const item of nav) {
        const sec = document.getElementById(item.id);
        if (sec && sec.getBoundingClientRect().top <= line) {
          next = item.id;
        }
      }
      setActiveId(next);
      return;
    }

    const navEl = document.getElementById(NAVBAR_ID);
    if (!navEl) return;

    const navH = navEl.getBoundingClientRect().height;
    setStickyTopPx(navH);

    const subH = subEl.offsetHeight;
    document.documentElement.style.setProperty("--listing-sticky-stack", `${navH + subH + 12}px`);

    const line = subEl.getBoundingClientRect().bottom + 6;
    let next: (typeof nav)[number]["id"] = nav[0].id;
    for (const item of nav) {
      const sec = document.getElementById(item.id);
      if (sec && sec.getBoundingClientRect().top <= line) {
        next = item.id;
      }
    }
    setActiveId(next);
    setPageScrolled(window.scrollY > 20);
  }, [mode]);

  useLayoutEffect(() => {
    const subEl = rootRef.current;
    if (!subEl) return;

    if (mode === "modal") {
      const scrollRoot = getScrollRootFromSubnav(subEl);
      const ro = new ResizeObserver(() => {
        publishStackAndSpy();
      });
      ro.observe(subEl);

      const onScroll = () => publishStackAndSpy();
      scrollRoot?.addEventListener("scroll", onScroll, { passive: true });
      window.addEventListener("resize", publishStackAndSpy, { passive: true });
      publishStackAndSpy();

      return () => {
        ro.disconnect();
        scrollRoot?.removeEventListener("scroll", onScroll);
        window.removeEventListener("resize", publishStackAndSpy);
        scrollRoot?.style.removeProperty("--listing-sticky-stack");
      };
    }

    const navEl = document.getElementById(NAVBAR_ID);
    if (!navEl) return;

    const ro = new ResizeObserver(() => {
      publishStackAndSpy();
    });
    ro.observe(navEl);
    ro.observe(subEl);

    const onScroll = () => {
      publishStackAndSpy();
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", publishStackAndSpy, { passive: true });
    publishStackAndSpy();

    return () => {
      ro.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", publishStackAndSpy);
      document.documentElement.style.removeProperty("--listing-sticky-stack");
    };
  }, [mode, publishStackAndSpy]);

  useEffect(() => {
    const node = tabRefs.current.get(activeId);
    node?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [activeId]);

  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, "");
    if (!hash || !nav.some((n) => n.id === hash)) return;
    let cancelled = false;
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (cancelled) return;
        scrollToSection(hash, mode, rootRef.current);
        setActiveId(hash);
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(id);
    };
  }, [mode]);

  return (
    <nav
      ref={rootRef}
      className={`sticky z-40 -mx-4 border-b px-2 py-2 shadow-sm backdrop-blur-md transition-[background-color,border-color,box-shadow] duration-300 ease-out sm:-mx-0 sm:rounded-2xl sm:px-3 sm:py-2.5 ${
        pageScrolled
          ? "border-slate-200/80 bg-white/90 shadow-[0_1px_0_rgba(255,255,255,0.7)_inset,0_12px_40px_-20px_rgba(15,23,42,0.1)] supports-[backdrop-filter]:bg-white/80"
          : "border-slate-200/90 bg-[#f4f7fb]/95"
      }`}
      style={{ top: mode === "modal" ? 0 : `${stickyTopPx}px` }}
      aria-label="Listing sections"
    >
      <ul className="-mx-1 flex flex-nowrap items-center justify-start gap-1 overflow-x-auto overscroll-x-contain px-1 py-0.5 text-[12px] font-semibold [-webkit-overflow-scrolling:touch] sm:flex-wrap sm:justify-center sm:overflow-visible sm:px-0 sm:text-[13px]">
        {nav.map((item) => {
          const active = activeId === item.id;
          return (
            <li key={item.id} className="shrink-0">
              <button
                ref={(el) => {
                  tabRefs.current.set(item.id, el);
                }}
                type="button"
                aria-current={active ? "true" : undefined}
                className={`inline-flex min-h-[44px] cursor-pointer items-center rounded-full border-0 px-3.5 py-2 text-[inherit] transition-colors sm:min-h-0 sm:py-1.5 ${
                  active
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-transparent text-slate-500 hover:bg-white/90 hover:text-slate-800"
                }`}
                onClick={() => {
                  setActiveId(item.id);
                  scrollToSection(item.id, mode, rootRef.current);
                  if (mode === "page") {
                    try {
                      window.history.replaceState(null, "", `#${item.id}`);
                    } catch {
                      /* ignore */
                    }
                  }
                }}
              >
                {item.label}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
