"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * Optional DOM element that modal/overlay portals should mount into instead of
 * `document.body`. Undefined everywhere by default, so the real portal keeps its
 * existing full-page overlay behavior.
 *
 * The public `/demo` sandbox provides its portal window here so the reused
 * portal modals (New listing, Add payment, Compose, …) render bounded *inside*
 * the demo frame rather than covering the whole browser. Paired with a
 * containing block on that frame (see `.demo-portal-frame` in globals.css), a
 * portaled `position: fixed` overlay resolves to the frame's box.
 */
const PortalContainerContext = createContext<HTMLElement | null>(null);

export function PortalContainerProvider({
  container,
  children,
}: {
  container: HTMLElement | null;
  children: ReactNode;
}) {
  return <PortalContainerContext.Provider value={container}>{children}</PortalContainerContext.Provider>;
}

/** The scoped portal container, or null to fall back to `document.body`. */
export function usePortalContainer(): HTMLElement | null {
  return useContext(PortalContainerContext);
}
