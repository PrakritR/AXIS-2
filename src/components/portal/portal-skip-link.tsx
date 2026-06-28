import { PORTAL_MAIN_CONTENT_ID } from "@/lib/portal-layout-classes";

/** Visually hidden until focused — jumps past sidebar to main content. */
export function PortalSkipLink() {
  return (
    <a
      href={`#${PORTAL_MAIN_CONTENT_ID}`}
      className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-full focus:border focus:border-border focus:bg-card focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-foreground focus:shadow-[var(--shadow-card)]"
    >
      Skip to main content
    </a>
  );
}
