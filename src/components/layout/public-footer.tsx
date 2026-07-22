import { AxisLogoLink } from "@/components/brand/axis-logo";
import Link from "next/link";
import type { ReactNode } from "react";
import { RESIDENT_BROWSE_PATH } from "@/lib/resident-public-nav";
import {
  PUBLIC_SOCIAL_LINKS,
  PUBLIC_SUPPORT_ADDRESS_LINE,
  PUBLIC_SUPPORT_ADDRESS_MAP_QUERY,
  PUBLIC_SUPPORT_EMAIL,
  PUBLIC_SUPPORT_PHONE_DISPLAY,
  PUBLIC_SUPPORT_PHONE_TEL,
} from "@/lib/marketing/public-contact";
import type { PublicSocialId } from "@/lib/marketing/public-contact";

const FOOTER_COLUMNS: { heading: string; links: { href: string; label: string }[] }[] = [
  {
    heading: "Product",
    links: [
      { href: "/why-proplane", label: "Why PropLane" },
      { href: "/pricing", label: "Pricing" },
      { href: "/docs", label: "Docs" },
      { href: "/about", label: "About us" },
    ],
  },
  {
    heading: "Who it's for",
    links: [
      { href: "/partner", label: "Managers" },
      { href: RESIDENT_BROWSE_PATH, label: "Residents" },
      { href: "/vendors", label: "Vendors" },
    ],
  },
  {
    heading: "Company",
    links: [
      { href: "/contact", label: "Contact us" },
      { href: "/support", label: "Support" },
      { href: "/partner/contact", label: "Partner inquiries" },
    ],
  },
];

const columnHeading =
  "text-[13px] font-semibold uppercase tracking-[0.08em] text-foreground";

const footerLinkClass =
  "block text-[15px] font-normal text-muted transition-[color,opacity] duration-200 hover:text-primary hover:opacity-95";

/**
 * Full-bleed footer gutters — the columns run the width of the page chrome
 * instead of clustering inside a narrow centred container, capped only so the
 * row does not stretch unreadably wide on ultra-wide displays.
 */
const footerShell = "mx-auto w-full max-w-[1600px] px-6 sm:px-10 lg:px-14 xl:px-20";

const SOCIAL_GLYPH_SVG_PROPS = {
  viewBox: "0 0 24 24",
  className: "h-[18px] w-[18px]",
  "aria-hidden": true,
} as const;

/**
 * Simple monochrome brand glyphs — inherit currentColor, no external icon set.
 *
 * Keyed by `PublicSocialId` so adding a network without drawing its mark is a
 * compile error rather than a silent fallthrough that renders one brand's logo
 * under another brand's accessible name.
 */
const SOCIAL_GLYPHS: Record<PublicSocialId, ReactNode> = {
  instagram: (
    <svg {...SOCIAL_GLYPH_SVG_PROPS} fill="none" stroke="currentColor" strokeWidth="1.7">
      <rect x="3.2" y="3.2" width="17.6" height="17.6" rx="5.2" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.1" cy="6.9" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  ),
  x: (
    <svg {...SOCIAL_GLYPH_SVG_PROPS} fill="currentColor">
      <path d="M3 3h5.1l4.3 5.8L17.7 3H21l-6.9 7.7L21.4 21h-5.1l-4.6-6.2L6 21H2.7l7.3-8.1L3 3Zm2.6 1.6 9.6 14.8h1.7L7.3 4.6H5.6Z" />
    </svg>
  ),
  linkedin: (
    <svg {...SOCIAL_GLYPH_SVG_PROPS} fill="currentColor">
      <path d="M5 3.4a2 2 0 1 1 0 4 2 2 0 0 1 0-4ZM3.2 9h3.6v11.6H3.2V9Zm6 0h3.4v1.6a3.9 3.9 0 0 1 3.4-1.8c2.8 0 4.2 1.8 4.2 5v6.8h-3.6v-6c0-1.5-.6-2.5-1.9-2.5-1.1 0-1.7.7-2 1.5-.1.3-.1.7-.1 1v6h-3.5V9Z" />
    </svg>
  ),
  facebook: (
    <svg {...SOCIAL_GLYPH_SVG_PROPS} fill="currentColor">
      <path d="M13.6 21v-8h2.7l.4-3.1h-3.1V7.9c0-.9.3-1.5 1.6-1.5h1.6V3.6c-.3 0-1.2-.1-2.3-.1-2.4 0-4 1.4-4 4.1v2.3H7.8V13h2.7v8h3.1Z" />
    </svg>
  ),
};

function SocialRow({ className = "" }: { className?: string }) {
  if (PUBLIC_SOCIAL_LINKS.length === 0) return null;
  return (
    <ul className={`flex items-center gap-2 ${className}`}>
      {PUBLIC_SOCIAL_LINKS.map(({ id, label, href }) => (
        <li key={id}>
          <a
            href={href}
            target="_blank"
            rel="noreferrer noopener"
            aria-label={label}
            title={label}
            data-attr={`footer-social-${id}`}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-muted transition-colors hover:border-primary/40 hover:text-primary"
          >
            {SOCIAL_GLYPHS[id]}
          </a>
        </li>
      ))}
    </ul>
  );
}

export function PublicFooter({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <footer className="border-t border-border bg-[var(--pl-surface)]">
        <div className="px-4 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:px-6">
          <div className="mx-auto flex max-w-6xl flex-col items-center justify-center gap-1 text-center text-[12px] font-normal text-muted sm:flex-row sm:items-center sm:justify-between sm:text-left">
            <span>© 2026 PropLane. All rights reserved.</span>
            <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-0.5 sm:justify-end">
              <Link href="/privacy" className="transition-colors hover:text-primary">
                Privacy Policy
              </Link>
              <Link href="/tos" className="transition-colors hover:text-primary">
                Terms of Service
              </Link>
              <Link href="/support" className="transition-colors hover:text-primary">
                Support
              </Link>
              <Link href="/contact" className="transition-colors hover:text-primary">
                Contact
              </Link>
            </div>
          </div>
        </div>
      </footer>
    );
  }

  return (
    <footer className="border-t border-border bg-[var(--pl-surface)]">
      <div className={`${footerShell} pb-8 pt-10`}>
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4 border-b border-border pb-7">
          <AxisLogoLink href="/" size="compact" />
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <p className="text-[13px] leading-snug text-muted">Property ops with approval-first AI.</p>
            <SocialRow />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-8 gap-y-9 pt-9 sm:grid-cols-3 lg:grid-cols-4 lg:gap-x-12 xl:gap-x-20">
          {FOOTER_COLUMNS.map(({ heading, links }) => (
            <div key={heading} className="min-w-0">
              <p className={columnHeading}>{heading}</p>
              <ul className="mt-4 flex flex-col gap-3">
                {links.map(({ href, label }) => (
                  <li key={href}>
                    <Link href={href} className={footerLinkClass}>
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <div className="min-w-0">
            <p className={columnHeading}>Contact</p>
            <ul className="mt-4 flex flex-col gap-3">
              <li>
                <a href={`tel:${PUBLIC_SUPPORT_PHONE_TEL}`} className={`${footerLinkClass} tabular-nums`}>
                  {PUBLIC_SUPPORT_PHONE_DISPLAY}
                </a>
              </li>
              <li>
                <a
                  href={`mailto:${PUBLIC_SUPPORT_EMAIL}`}
                  className={`${footerLinkClass} break-words`}
                >
                  {PUBLIC_SUPPORT_EMAIL}
                </a>
              </li>
              <li>
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${PUBLIC_SUPPORT_ADDRESS_MAP_QUERY}`}
                  target="_blank"
                  rel="noreferrer"
                  className={footerLinkClass}
                >
                  {PUBLIC_SUPPORT_ADDRESS_LINE}
                </a>
              </li>
            </ul>
          </div>
        </div>
      </div>

      <div className="border-t border-border bg-[var(--pl-surface)] py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div
          className={`${footerShell} flex flex-col items-center justify-center gap-1.5 text-center text-[13px] font-normal text-muted sm:flex-row sm:items-center sm:justify-between sm:text-left`}
        >
          <span>© 2026 PropLane. All rights reserved.</span>
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 sm:justify-end">
            <Link href="/privacy" className="transition-colors hover:text-primary">
              Privacy Policy
            </Link>
            <Link href="/tos" className="transition-colors hover:text-primary">
              Terms of Service
            </Link>
            <Link href="/support" className="transition-colors hover:text-primary">
              Support
            </Link>
            <Link href="/contact" className="transition-colors hover:text-primary">
              Contact
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
