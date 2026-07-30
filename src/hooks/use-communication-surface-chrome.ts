"use client";

import { useEffect } from "react";

/**
 * Communication surfaces (main tab + resident-detail chat) hide the floating
 * assistant FAB and tighten bottom scroll padding. `threadReading` adds the
 * full-bleed mobile thread layout (no extra page chrome).
 */
export function useCommunicationSurfaceChrome({
  active,
  threadReading = false,
}: {
  active: boolean;
  threadReading?: boolean;
}) {
  useEffect(() => {
    if (!active) return;
    const html = document.documentElement;
    html.dataset.hideAssistantFab = "true";
    html.dataset.communicationSurface = "true";
    if (threadReading) {
      html.dataset.communicationThreadReading = "true";
    } else {
      delete html.dataset.communicationThreadReading;
    }
    return () => {
      delete html.dataset.hideAssistantFab;
      delete html.dataset.communicationSurface;
      delete html.dataset.communicationThreadReading;
    };
  }, [active, threadReading]);
}
