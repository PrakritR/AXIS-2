"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

const NAVBAR_ID = "axis-public-navbar";

const nav = [
  { id: "floor-plans", label: "Floor plans" },
  { id: "listing-shared", label: "Shared spaces" },
  { id: "lease-basics", label: "Lease basics" },
  { id: "amenities", label: "Amenities" },
  { id: "bundles", label: "Bundles & leasing" },
  { id: "location", label: "Location" },
] as const;

function scrollToSection(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
}

/** Sticks directly under the public marketing navbar; tabs smooth-scroll and track the active section. */
export function ListingStickySubnav() {
  const rootRef = useRef<HTMLElement>(null);
  const tabRefs = useRef<Map<string, HTMLAnchorElement | null>>(new Map());
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

  return (
    <nav
      ref={rootRef}
      className={`sticky z-[39] -mx-4 border-b px-2 py-2 shadow-sm backdrop-blur-md transition-[background-color,border-color,box-shadow] duration-300 ease-out sm:-mx-0 sm:rounded-2xl sm:px-3 sm:py-2.5 ${
        pageScrolled
          ? "border-slate-200/80 bg-white/80 shadow-[0_1px_0_rgba(255,255,255,0.7)_inset,0_12px_40px_-20px_rgba(15,23,42,0.08)] supports-[backdrop-filter]:bg-white/70"
          : "border-slate-200/90 bg-[#f4f7fb]/92"
      }`}
      style={{ top: `${stickyTopPx}px` }}
      aria-label="Listing sections"
    >
      <ul className="-mx-1 flex flex-nowrap items-center justify-start gap-1 overflow-x-auto overscroll-x-contain px-1 py-0.5 text-[13px] font-semibold [-webkit-overflow-scrolling:touch] sm:flex-wrap sm:justify-center sm:overflow-visible sm:px-0">
        {nav.map((item) => {
          const active = activeId === item.id;
          return (
            <li key={item.id} className="shrink-0">
              <a
                ref={(el) => {
                  tabRefs.current.set(item.id, el);
                }}
                href={`#${item.id}`}
                aria-current={active ? "location" : undefined}
                className={`inline-flex min-h-[44px] items-center rounded-full px-3.5 py-2 no-underline transition-colors sm:min-h-0 sm:py-1.5 ${
                  active
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-slate-500 hover:bg-white/90 hover:text-slate-800"
                }`}
                onClick={(e) => {
                  e.preventDefault();
                  setActiveId(item.id);
                  scrollToSection(item.id);
                }}
              >
                {item.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
