import { AxisLogoLink } from "@/components/brand/axis-logo";
import Link from "next/link";
import { RESIDENT_BROWSE_PATH } from "@/lib/resident-public-nav";
import {
  PUBLIC_SUPPORT_ADDRESS_LINE,
  PUBLIC_SUPPORT_ADDRESS_MAP_QUERY,
  PUBLIC_SUPPORT_EMAIL,
  PUBLIC_SUPPORT_PHONE_DISPLAY,
  PUBLIC_SUPPORT_PHONE_TEL,
} from "@/lib/marketing/public-contact";

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
      <div className="mx-auto max-w-6xl px-6 pb-8 pt-10 sm:px-5">
        <div className="flex items-center justify-between gap-6 border-b border-border pb-7">
          <AxisLogoLink href="/" size="compact" />
          <p className="max-w-[28ch] text-right text-[13px] leading-snug text-muted sm:max-w-none">
            Property ops with approval-first AI.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-x-8 gap-y-9 pt-9 sm:grid-cols-3 lg:grid-cols-5">
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

      <div className="border-t border-border bg-[var(--pl-surface)] px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-center gap-1.5 text-center text-[13px] font-normal text-muted sm:flex-row sm:items-center sm:justify-between sm:text-left">
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
