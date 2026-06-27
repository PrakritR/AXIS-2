"use client";

const svgProps = {
  viewBox: "0 0 24 24" as const,
  fill: "none" as const,
  stroke: "currentColor" as const,
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const cls = "h-[18px] w-[18px] shrink-0";

/** Sidebar glyphs aligned with PublicNavbar / AX stroke weight (2, round caps). */
export function PortalNavIcon({ section }: { section: string }) {
  switch (section) {
    case "dashboard":
      return (
        <svg className={cls} aria-hidden {...svgProps}>
          <rect x="3" y="3" width="7" height="9" rx="1" />
          <rect x="14" y="3" width="7" height="5" rx="1" />
          <rect x="14" y="12" width="7" height="9" rx="1" />
          <rect x="3" y="16" width="7" height="5" rx="1" />
        </svg>
      );
    case "onboard":
      return (
        <svg className={cls} aria-hidden {...svgProps}>
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M19 8v6M22 11h-6" />
        </svg>
      );
    case "properties":
      return (
        <svg className={cls} aria-hidden {...svgProps}>
          <path d="M3 10.5 12 3l9 7.5" />
          <path d="M5 10v10h14V10" />
          <path d="M10 20v-6h4v6" />
        </svg>
      );
    case "axis-users":
    case "residents":
      return (
        <svg className={cls} aria-hidden {...svgProps}>
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
    case "leases":
    case "lease":
      return (
        <svg className={cls} aria-hidden {...svgProps}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Z" />
          <path d="M14 2v6h6" />
          <path d="M8 13h8M8 17h6" />
        </svg>
      );
    case "events":
    case "calendar":
      return (
        <svg className={cls} aria-hidden {...svgProps}>
          <path d="M8 2v4M16 2v4" />
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M3 10h18" />
          <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" />
        </svg>
      );
    case "applications":
      return (
        <svg className={cls} aria-hidden {...svgProps}>
          <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
          <rect x="8" y="2" width="8" height="4" rx="1" />
          <path d="M9 12h6M9 16h4" />
        </svg>
      );
    case "payments":
      return (
        <svg className={cls} aria-hidden {...svgProps}>
          <rect x="2" y="5" width="20" height="14" rx="2" />
          <path d="M2 10h20" />
          <path d="M6 15h2" />
        </svg>
      );
    case "documents":
      return (
        <svg className={cls} aria-hidden {...svgProps}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Z" />
          <path d="M14 2v6h6" />
          <path d="M8 13h8M8 17h5" />
        </svg>
      );
    case "financials":
      return (
        <svg className={cls} aria-hidden {...svgProps}>
          <path d="M4 20V10" />
          <path d="M10 20V4" />
          <path d="M16 20v-8" />
          <path d="M3 20h18" />
        </svg>
      );
    case "services":
      return (
        <svg className={cls} aria-hidden {...svgProps}>
          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76Z" />
        </svg>
      );
    case "inbox":
      return (
        <svg className={cls} aria-hidden {...svgProps}>
          <rect width="20" height="16" x="2" y="4" rx="2" />
          <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
        </svg>
      );
    case "bugs-feedback":
      return (
        <svg className={cls} aria-hidden {...svgProps}>
          <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
          <path d="M8 9h8M8 13h5" />
        </svg>
      );
    case "profile":
      return (
        <svg className={cls} aria-hidden {...svgProps}>
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" />
        </svg>
      );
    case "plan":
      return (
        <svg className={cls} aria-hidden {...svgProps}>
          <rect x="2" y="5" width="20" height="14" rx="2" />
          <path d="M2 10h20" />
        </svg>
      );
    case "relationships":
      return (
        <svg className={cls} aria-hidden {...svgProps}>
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
        </svg>
      );
    case "move-in":
      return (
        <svg className={cls} aria-hidden {...svgProps}>
          <path d="M16 3h5v5" />
          <path d="M8 3H3v5" />
          <path d="M21 3 14 10" />
          <path d="M3 3l7 7" />
          <path d="M12 12v9" />
          <path d="M8 21h8" />
        </svg>
      );
    default:
      return (
        <svg className={cls} aria-hidden {...svgProps}>
          <circle cx="12" cy="12" r="3" />
        </svg>
      );
  }
}

/** @deprecated Use PortalNavIcon */
export const AdminPortalNavIcon = PortalNavIcon;
