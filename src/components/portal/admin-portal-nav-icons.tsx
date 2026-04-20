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
export function AdminPortalNavIcon({ section }: { section: string }) {
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
    case "properties":
      return (
        <svg className={cls} aria-hidden {...svgProps}>
          <path d="M3 10.5 12 3l9 7.5" />
          <path d="M5 10v10h14V10" />
          <path d="M10 20v-6h4v6" />
        </svg>
      );
    case "managers":
      return (
        <svg className={cls} aria-hidden {...svgProps}>
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
    case "owners":
      return (
        <svg className={cls} aria-hidden {...svgProps}>
          <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      );
    case "leases":
      return (
        <svg className={cls} aria-hidden {...svgProps}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Z" />
          <path d="M14 2v6h6" />
          <path d="M8 13h8M8 17h6" />
        </svg>
      );
    case "events":
      return (
        <svg className={cls} aria-hidden {...svgProps}>
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
      );
    case "inbox":
      return (
        <svg className={cls} aria-hidden {...svgProps}>
          <rect width="20" height="16" x="2" y="4" rx="2" />
          <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
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
    default:
      return (
        <svg className={cls} aria-hidden {...svgProps}>
          <circle cx="12" cy="12" r="3" />
        </svg>
      );
  }
}
