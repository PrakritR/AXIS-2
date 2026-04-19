"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

const NAVBAR_ID = "axis-public-navbar";

const nav = [
  { id: "floor-plans", label: "Floor plans" },
  { id: "lease-basics", label: "Lease basics" },
  { id: "amenities", label: "Amenities" },
  { id: "bundles", label: "Bundles & leasing" },
  { id: "location", label: "Location" },
] as const;

function getListingScrollOffsetPx(): number {
  const raw = getComputedStyle(document.documentElement).getPropertyValue("--listing-sticky-stack").trim();
  if (raw) {
    const px = Number.parseFloat(raw);
    if (!Number.isNaN(px)) return px;
  }
  const navEl = document.getElementById(NAVBAR_ID);
  const navH = navEl?.getBoundingClientRect().height ?? 64;
  return navH + 52 + 12;
}

/** Scroll so the section heading clears the public nav + sticky tab bar (matches section `scroll-mt` token). */
function scrollToSection(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const offset = getListingScrollOffsetPx();
  const top = el.getBoundingClientRect().top + window.scrollY - offset;
  window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
}

/** Sticks directly under the public marketing navbar; tabs smooth-scroll and track the active section. */
export function ListingStickySubnav() {
  const rootRef = useRef<HTMLElement>(null);
  const tabRefs = useRef<Map<string, HTMLButtonElement | null>>(new Map());
  const [stickyTopPx, setStickyTopPx] = useState(64);
  const [pageScrolled, setPageScrolled] = useState(false);
  const [activeId, setActiveId] = useState<string>(nav[0].id);

  const publishStackAndSpy = useCallback(() => {
    const navEl = document.getElementById(NAVBAR_ID);
    const subEl = rootRef.current;
    if (!navEl || !subEl) return;

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
  }, []);

  useLayoutEffect(() => {
    const navEl = document.getElementById(NAVBAR_ID);
    const subEl = rootRef.current;
    if (!navEl || !subEl) return;

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
  }, [publishStackAndSpy]);

  useEffect(() => {
    const node = tabRefs.current.get(activeId);
    node?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [activeId]);

  /** Deep links (#lease-basics, etc.) after client navigation — browser often does not scroll. */
  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, "");
    if (!hash || !nav.some((n) => n.id === hash)) return;
    let cancelled = false;
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (cancelled) return;
        scrollToSection(hash);
        setActiveId(hash);
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(id);
    };
  }, []);

  return (
    <nav
      ref={rootRef}
      className={`sticky z-40 -mx-4 border-b px-2 py-2 shadow-sm backdrop-blur-md transition-[background-color,border-color,box-shadow] duration-300 ease-out sm:-mx-0 sm:rounded-2xl sm:px-3 sm:py-2.5 ${
        pageScrolled
          ? "border-slate-200/80 bg-white/90 shadow-[0_1px_0_rgba(255,255,255,0.7)_inset,0_12px_40px_-20px_rgba(15,23,42,0.1)] supports-[backdrop-filter]:bg-white/80"
          : "border-slate-200/90 bg-[#f4f7fb]/95"
      }`}
      style={{ top: `${stickyTopPx}px` }}
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
                  scrollToSection(item.id);
                  try {
                    window.history.replaceState(null, "", `#${item.id}`);
                  } catch {
                    /* ignore */
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
