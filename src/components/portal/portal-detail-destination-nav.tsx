"use client";

import { useEffect, useRef } from "react";
import { DestinationNav, type DestinationNavItem } from "@/components/ui/destination-nav";
import { HorizontalScrollCapture } from "@/components/portal/portal-horizontal-scroll";
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
    <HorizontalScrollCapture
      className={cn("-mx-2.5 bg-background sm:-mx-4 lg:mx-0")}
      data-portal-detail-destination-nav
    >
      <div ref={wrapRef}>
        <DestinationNav
          items={items}
          activeId={activeId}
          activeHref={activeHref}
          ariaLabel={ariaLabel}
          className={cn(
            "rounded-none border-0 border-b border-border bg-transparent p-0",
            "md:rounded-2xl md:border md:border-border md:bg-accent/30 md:p-1",
            className,
          )}
        />
      </div>
    </HorizontalScrollCapture>
  );
}
