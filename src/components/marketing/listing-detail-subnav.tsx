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
  const isNative =
    typeof document !== "undefined" && document.documentElement.hasAttribute("data-native");
  if (mode === "modal") {
    const scrollRoot = getScrollRootFromSubnav(subnavEl);
    const stack = subnavEl.offsetHeight + 12;
    scrollRoot?.style.setProperty("--listing-sticky-stack", `${stack}px`);
    return stack;
  }
  const navEl = document.getElementById(NAVBAR_ID);
  const navH = isNative ? 0 : (navEl?.getBoundingClientRect().height ?? 0);
  if (!isNative && navH > 0) {
    document.documentElement.style.setProperty("--public-nav-height", `${navH}px`);
  }
  const safeTop =
    typeof window !== "undefined"
      ? Number.parseFloat(
          getComputedStyle(document.documentElement).getPropertyValue("--native-safe-top"),
        ) || 0
      : 0;
  const insetTop = isNative ? safeTop : 0;
  const stack = navH + insetTop + subnavEl.offsetHeight + 12;
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
    // Below the desktop breakpoint the preview panel is not its own scroller
    // (the page/portal scroller moves instead) — defer to scrollIntoView there.
    if (root.scrollHeight <= root.clientHeight + 1) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    const subnavH = subnavEl.getBoundingClientRect().height;
    const y = el.getBoundingClientRect().top - root.getBoundingClientRect().top + root.scrollTop;
    root.scrollTo({ top: Math.max(0, y - subnavH - 10), behavior: "smooth" });
    return;
  }

  syncListingScrollStack(mode, subnavEl);
  el.scrollIntoView({ behavior: "smooth", block: "start" });
}

/** Sticky section tabs: full marketing pages use the public navbar offset; preview modal pins to top of its scroller. */
export function ListingStickySubnav({
  mode = "page",
  className = "",
}: {
  mode?: "page" | "modal";
  className?: string;
}) {
  const rootRef = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const tabRefs = useRef<Map<string, HTMLButtonElement | null>>(new Map());
  // While a click-initiated smooth scroll is in flight, the spy would flap
  // through intermediate sections — pin the clicked tab until it settles.
  const clickLockRef = useRef<{ id: string; until: number } | null>(null);
  const [pageScrolled, setPageScrolled] = useState(false);
  const [activeId, setActiveId] = useState<string>(nav[0].id);

  const publishStackAndSpy = useCallback(() => {
    const subEl = rootRef.current;
    if (!subEl) return;

    if (mode === "modal") {
      const scrollRoot = getScrollRootFromSubnav(subEl);
      syncListingScrollStack(mode, subEl);
      setPageScrolled(scrollRoot ? scrollRoot.scrollTop > 8 : false);
    } else {
      syncListingScrollStack(mode, subEl);
      setPageScrolled(window.scrollY > 20);
    }

    // Slightly below where a clicked section lands (subnav + 10/12px offset),
    // so the spy agrees with the tab that was just clicked.
    const line = subEl.getBoundingClientRect().bottom + 16;
    let next: (typeof nav)[number]["id"] = nav[0].id;
    for (const item of nav) {
      const sec = getSectionElement(item.id, mode, subEl);
      if (sec && sec.getBoundingClientRect().top <= line) {
        next = item.id;
      }
    }
    const lock = clickLockRef.current;
    if (lock) {
      if (next === lock.id || Date.now() > lock.until) {
        clickLockRef.current = null;
      } else {
        next = lock.id as (typeof nav)[number]["id"];
      }
    }
    setActiveId(next);
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
        document.documentElement.style.removeProperty("--public-nav-height");
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
      // The preview panel scrolls itself on desktop, but below the desktop
      // breakpoint the page/portal scroller moves instead — capture scrolls
      // from any container so the spy works in both layouts.
      document.addEventListener("scroll", onScroll, { capture: true, passive: true });
      window.addEventListener("resize", publishStackAndSpy, { passive: true });
      queueMicrotask(() => publishStackAndSpy());

      return () => {
        ro.disconnect();
        document.removeEventListener("scroll", onScroll, { capture: true });
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
        cleanup = attachPageListeners(document.body);
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
    const list = listRef.current;
    if (!node || !list || list.scrollWidth <= list.clientWidth + 1) return;
    // Center the active tab by scrolling only the strip — scrollIntoView would
    // also scroll ancestor containers and cancel an in-flight section scroll.
    const nodeRect = node.getBoundingClientRect();
    const listRect = list.getBoundingClientRect();
    const left = list.scrollLeft + (nodeRect.left - listRect.left) - (list.clientWidth - nodeRect.width) / 2;
    list.scrollTo({ left: Math.max(0, left), behavior: "smooth" });
  }, [activeId]);

  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, "");
    if (!hash || !nav.some((n) => n.id === hash)) return;
    let cancelled = false;
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (cancelled) return;
        clickLockRef.current = { id: hash, until: Date.now() + 1500 };
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
      data-listing-subnav
      className={`sticky z-[45] -mx-4 border-b border-border px-2 py-2 shadow-sm backdrop-blur-md transition-[background-color,border-color,box-shadow] duration-300 ease-out sm:mx-0 sm:rounded-2xl sm:px-3 sm:py-2.5 [html[data-native]_&]:-mx-0 [html[data-native]_&]:rounded-none [html[data-native]_&]:border-x-0 [html[data-native]_&]:px-3 [html[data-native]_&]:py-2 [html[data-native]_&]:pt-2 ${className} ${
        pageScrolled
          ? "bg-background/95 shadow-[0_1px_0_color-mix(in_srgb,var(--border)_70%,transparent)_inset,0_12px_40px_-20px_rgba(15,23,42,0.18)]"
          : "bg-background/90"
      }`}
      style={mode === "modal" ? { top: 0 } : undefined}
      aria-label="Listing sections"
    >
      <ul
        ref={listRef}
        className="-mx-1 flex flex-nowrap items-center justify-start gap-1 overflow-x-auto overscroll-x-contain px-1 py-0.5 text-[12px] font-semibold [-webkit-overflow-scrolling:touch] sm:flex-wrap sm:justify-center sm:overflow-visible sm:px-0 sm:text-[13px]"
      >
        {nav.map((item) => {
          const active = activeId === item.id;
          return (
            <li key={item.id} className="shrink-0">
              <button
                ref={(el) => {
                  tabRefs.current.set(item.id, el);
                }}
                type="button"
                data-attr="listing-section-tab"
                aria-current={active ? "true" : undefined}
                className={`inline-flex min-h-[44px] cursor-pointer items-center rounded-full border-0 px-3.5 py-2 text-[inherit] transition-colors sm:min-h-0 sm:py-1.5 ${
                  active
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-transparent text-muted hover:bg-accent/40 hover:text-foreground"
                }`}
                onClick={() => {
                  clickLockRef.current = { id: item.id, until: Date.now() + 1500 };
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
