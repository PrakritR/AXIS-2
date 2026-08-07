"use client";

import { useEffect } from "react";

/**
 * Communication surfaces (main tab + resident-detail chat) apply their
 * communication-specific layout. `threadReading` adds the full-bleed mobile
 * thread layout (no extra page chrome). `threadSelected` hides the assistant
 * whenever a conversation is active (desktop split or mobile).
 */
export function useCommunicationSurfaceChrome({
  active,
  threadReading = false,
  threadSelected = false,
}: {
  active: boolean;
  threadReading?: boolean;
  threadSelected?: boolean;
}) {
  useEffect(() => {
    if (!active) return;
    const html = document.documentElement;
    html.dataset.communicationSurface = "true";
    if (threadReading) {
      html.dataset.communicationThreadReading = "true";
    } else {
      delete html.dataset.communicationThreadReading;
    }
    if (threadSelected) {
      html.dataset.communicationThreadSelected = "true";
    } else {
      delete html.dataset.communicationThreadSelected;
    }
    return () => {
      delete html.dataset.communicationSurface;
      delete html.dataset.communicationThreadReading;
      delete html.dataset.communicationThreadSelected;
    };
  }, [active, threadReading, threadSelected]);
}
