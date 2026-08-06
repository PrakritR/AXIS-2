"use client";

import { useEffect, useState } from "react";
import { LoadingCards } from "@/components/ui/empty-state";

const PORTAL_LOADING_DELAY_MS = 180;

/** Instant feedback while a portal section page streams in — delayed to skip fast tab flashes. */
export function PortalSectionLoading() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setShow(true), PORTAL_LOADING_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, []);

  if (!show) {
    return <div className="min-h-[10rem]" aria-busy="true" aria-live="polite" />;
  }

  return (
    <div className="animate-pulse space-y-6 px-1 py-2" aria-busy="true" aria-live="polite">
      <div className="h-9 w-48 rounded-full bg-accent/50" />
      <div className="h-4 w-80 max-w-full rounded-full bg-accent/40" />
      <LoadingCards />
    </div>
  );
}
