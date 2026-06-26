"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

const NAVBAR_ID = "axis-public-navbar";
const PREVIEW_SCROLL_SELECTOR = "[data-listing-preview-scroll]";
const LISTING_SECTIONS_ROOT_SELECTOR = "[data-listing-sections-root]";

const nav = [
  { id: "floor-plans", label: "Floor plans" },
  { id: "lease-basics", label: "Lease basics" },
  { id: "amenities", label: "Amenities" },
  { id: "bundles", label: "Bundles & leasing" },
  { id: "house-rules", label: "House rules" },
  { id: "location", label: "Location" },
] as const;

function getListingSectionsRoot(subnavEl: HTMLElement | null): HTMLElement | null {
  return subnavEl?.closest<HTMLElement>(LISTING_SECTIONS_ROOT_SELECTOR) ?? null;
}

function getScrollRootFromSubnav(subnavEl: HTMLElement | null): HTMLElement | null {
  return subnavEl?.closest<HTMLElement>(PREVIEW_SCROLL_SELECTOR) ?? null;
}

function getSectionElement(id: string, mode: "page" | "modal", subnavEl: HTMLElement | null): HTMLElement | null {
  if (mode === "modal") {
    const root = getScrollRootFromSubnav(subnavEl);
    return root?.querySelector<HTMLElement>(`#${CSS.escape(id)}`) ?? null;
  }
  const listingRoot = getListingSectionsRoot(subnavEl);
  if (listingRoot) {
    return listingRoot.querySelector<HTMLElement>(`#${CSS.escape(id)}`) ?? null;
  }
  return document.getElementById(id);
}

function syncListingScrollStack(mode: "page" | "modal", subnavEl: HTMLElement | null): number {
  if (!subnavEl) return 128;
  if (mode === "modal") {
    const scrollRoot = getScrollRootFromSubnav(subnavEl);
    const stack = subnavEl.offsetHeight + 12;
    scrollRoot?.style.setProperty("--listing-sticky-stack", `${stack}px`);
    return stack;
  }
  const navEl = document.getElementById(NAVBAR_ID);
  const navH = navEl?.getBoundingClientRect().height ?? 64;
  const stack = navH + subnavEl.offsetHeight + 12;
  document.documentElement.style.setProperty("--listing-sticky-stack", `${stack}px`);
  const listingRoot = getListingSectionsRoot(subnavEl);
  listingRoot?.style.setProperty("--listing-sticky-stack", `${stack}px`);
  return stack;
}

function scrollToSection(id: string, mode: "page" | "modal", subnavEl: HTMLElement | null) {
  const el = getSectionElement(id, mode, subnavEl);
  if (!el) return;

  if (mode === "modal") {
    const root = getScrollRootFromSubnav(subnavEl);
    if (!root || !subnavEl) return;
    syncListingScrollStack(mode, subnavEl);
    const subnavH = subnavEl.getBoundingClientRect().height;
    const y = el.getBoundingClientRect().top - root.getBoundingClientRect().top + root.scrollTop;
    root.scrollTo({ top: Math.max(0, y - subnavH - 10), behavior: "smooth" });
    return;
  }

  syncListingScrollStack(mode, subnavEl);
  el.scrollIntoView({ behavior: "smooth", block: "start" });
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
      syncListingScrollStack(mode, subEl);

      setStickyTopPx(0);
      setPageScrolled(scrollRoot ? scrollRoot.scrollTop > 8 : false);

      const line = subEl.getBoundingClientRect().bottom + 6;
      let next: (typeof nav)[number]["id"] = nav[0].id;
      for (const item of nav) {
        const sec = getSectionElement(item.id, mode, subEl);
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
    syncListingScrollStack(mode, subEl);

    const line = subEl.getBoundingClientRect().bottom + 6;
    let next: (typeof nav)[number]["id"] = nav[0].id;
    for (const item of nav) {
      const sec = getSectionElement(item.id, mode, subEl);
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

    let cancelled = false;
    let cleanup: (() => void) | null = null;

    const attachPageListeners = (navEl: HTMLElement) => {
      const ro = new ResizeObserver(() => {
        publishStackAndSpy();
      });
      ro.observe(navEl);
      ro.observe(subEl);

      const onScroll = () => publishStackAndSpy();
      window.addEventListener("scroll", onScroll, { passive: true });
      window.addEventListener("resize", publishStackAndSpy, { passive: true });
      queueMicrotask(() => publishStackAndSpy());

      return () => {
        ro.disconnect();
        window.removeEventListener("scroll", onScroll);
        window.removeEventListener("resize", publishStackAndSpy);
        document.documentElement.style.removeProperty("--listing-sticky-stack");
        getListingSectionsRoot(subEl)?.style.removeProperty("--listing-sticky-stack");
      };
    };

    const attachModalListeners = () => {
      const scrollRoot = getScrollRootFromSubnav(subEl);
      const ro = new ResizeObserver(() => {
        publishStackAndSpy();
      });
      ro.observe(subEl);

      const onScroll = () => publishStackAndSpy();
      scrollRoot?.addEventListener("scroll", onScroll, { passive: true });
      window.addEventListener("resize", publishStackAndSpy, { passive: true });
      queueMicrotask(() => publishStackAndSpy());

      return () => {
        ro.disconnect();
        scrollRoot?.removeEventListener("scroll", onScroll);
        window.removeEventListener("resize", publishStackAndSpy);
        scrollRoot?.style.removeProperty("--listing-sticky-stack");
      };
    };

    const tryAttach = () => {
      if (cancelled) return;
      if (mode === "modal") {
        cleanup = attachModalListeners();
        return;
      }
      const navEl = document.getElementById(NAVBAR_ID);
      if (!navEl) {
        requestAnimationFrame(tryAttach);
        return;
      }
      cleanup = attachPageListeners(navEl);
    };

    tryAttach();

    return () => {
      cancelled = true;
      cleanup?.();
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
      data-surface="light"
      className={`sticky z-40 -mx-4 border-b px-2 py-2 shadow-sm backdrop-blur-md transition-[background-color,border-color,box-shadow] duration-300 ease-out sm:-mx-0 sm:rounded-2xl sm:px-3 sm:py-2.5 ${
        pageScrolled
          ? "border-border bg-card shadow-[0_1px_0_rgba(255,255,255,0.7)_inset,0_12px_40px_-20px_rgba(15,23,42,0.1)] supports-[backdrop-filter]:bg-card"
          : "border-border bg-[#f4f7fb]/95"
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
                    : "bg-transparent text-[#4a5878] hover:bg-white/80 hover:text-[#0b1b3a]"
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
