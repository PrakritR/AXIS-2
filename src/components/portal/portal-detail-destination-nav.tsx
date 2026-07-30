"use client";

import { useEffect, useRef } from "react";
import { DestinationNav, type DestinationNavItem } from "@/components/ui/destination-nav";
import { syncPortalMobileTopChrome } from "@/lib/portal-mobile-top-chrome";
import { cn } from "@/lib/utils";

/**
 * Record-detail tab row (Preview, House details, …) — scrolls with page content.
 */
export function PortalDetailDestinationNav({
  items,
  activeId,
  activeHref,
  ariaLabel,
  className,
}: {
  items: DestinationNavItem[];
  activeId?: string;
  activeHref?: string;
  ariaLabel?: string;
  className?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const sync = () => syncPortalMobileTopChrome(el);
    sync();
    const ro = new ResizeObserver(sync);
    const main = el.closest("#portal-main-content");
    const mobileBar = main?.querySelector(".portal-mobile-nav-bar");
    if (mobileBar) ro.observe(mobileBar);
    ro.observe(el);
    window.addEventListener("resize", sync);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", sync);
      syncPortalMobileTopChrome(null);
    };
  }, []);

  return (
    <div
      className={cn("w-full min-w-0 bg-background lg:static")}
      data-portal-detail-destination-nav
      ref={wrapRef}
    >
      <DestinationNav
        items={items}
        activeId={activeId}
        activeHref={activeHref}
        ariaLabel={ariaLabel}
        itemLayout="equal"
        className={cn(
          "max-lg:rounded-none max-lg:border-0 max-lg:border-b max-lg:border-border max-lg:bg-transparent max-lg:p-0",
          className,
        )}
      />
    </div>
  );
}
