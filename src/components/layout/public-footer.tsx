import { AxisLogoLink } from "@/components/brand/axis-logo";
import Link from "next/link";
import { RESIDENT_BROWSE_PATH } from "@/lib/resident-public-nav";

const FOOTER_COLUMNS: { heading: string; links: { href: string; label: string }[] }[] = [
  {
    heading: "Product",
    links: [
      { href: "/why-proplane", label: "Why PropLane" },
      { href: "/pricing", label: "Pricing" },
      { href: "/docs", label: "Docs" },
      { href: "/reviews", label: "Reviews" },
      { href: "/about", label: "About us" },
    ],
  },
  {
    heading: "Who it's for",
    links: [
      { href: RESIDENT_BROWSE_PATH, label: "Residents" },
      { href: "/pricing", label: "Property managers" },
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
      <footer className="glass-nav border-t border-border bg-[var(--glass-fill)]">
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
    <footer className="glass-nav border-t border-border bg-[var(--glass-fill)]">
      <div className="mx-auto max-w-6xl px-6 pb-8 pt-10 sm:px-5">
        {/* Brand row: logo left, social icons right. */}
        <div className="flex items-center justify-between gap-6 border-b border-border pb-7">
          <AxisLogoLink href="/" size="compact" />
          {/* TODO: point these at real PropLane profiles once the accounts exist. */}
          <div className="flex items-center gap-5 text-muted">
            <a href="#" aria-label="PropLane on X" className="transition-colors hover:text-primary">
              <XIcon />
            </a>
            <a
              href="#"
              aria-label="PropLane on Instagram"
              className="transition-colors hover:text-primary"
            >
              <InstagramIcon />
            </a>
            <a
              href="#"
              aria-label="PropLane on YouTube"
              className="transition-colors hover:text-primary"
            >
              <YouTubeIcon />
            </a>
            <a
              href="#"
              aria-label="PropLane on LinkedIn"
              className="transition-colors hover:text-primary"
            >
              <LinkedInIcon />
            </a>
          </div>
        </div>

        {/* Link columns, left-aligned. */}
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

          {/* Contact */}
          <div className="min-w-0">
            <p className={columnHeading}>Contact</p>
            <ul className="mt-4 flex flex-col gap-3">
              <li>
                <a href="tel:+15103098345" className={`${footerLinkClass} tabular-nums`}>
                  (510) 309-8345
                </a>
              </li>
              <li>
                <a
                  href="mailto:info@axis-seattle-housing.com"
                  className={`${footerLinkClass} break-words`}
                >
                  info@axis-seattle-housing.com
                </a>
              </li>
              <li>
                <a
                  href="https://www.google.com/maps/search/?api=1&query=5259+Brooklyn+Ave+NE%2C+98105"
                  target="_blank"
                  rel="noreferrer"
                  className={footerLinkClass}
                >
                  5259 Brooklyn Ave NE, Seattle, WA
                </a>
              </li>
            </ul>
          </div>
        </div>
      </div>

      <div className="glass-nav border-t border-border bg-[var(--glass-fill)] px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">
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

function XIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M18.9 2.1h3.4l-7.4 8.5 8.7 11.5h-6.8l-5.3-7-6.1 7H1.9l7.9-9.1L1.5 2.1h7l4.8 6.4 5.6-6.4Zm-1.2 18h1.9L7.4 4H5.4l12.3 16.1Z" />
    </svg>
  );
}

function InstagramIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect width="18" height="18" x="3" y="3" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.2" cy="6.8" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

function YouTubeIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M23 12s0-3.4-.4-5a2.8 2.8 0 0 0-2-2C18.9 4.5 12 4.5 12 4.5s-6.9 0-8.6.5a2.8 2.8 0 0 0-2 2C1 8.6 1 12 1 12s0 3.4.4 5a2.8 2.8 0 0 0 2 2c1.7.5 8.6.5 8.6.5s6.9 0 8.6-.5a2.8 2.8 0 0 0 2-2c.4-1.6.4-5 .4-5Zm-13.2 3.2V8.8L15.4 12l-5.6 3.2Z" />
    </svg>
  );
}

function LinkedInIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M20.4 3H3.6A.6.6 0 0 0 3 3.6v16.8a.6.6 0 0 0 .6.6h16.8a.6.6 0 0 0 .6-.6V3.6a.6.6 0 0 0-.6-.6ZM8.3 18.4H5.7V9.8h2.7v8.6ZM7 8.6a1.6 1.6 0 1 1 0-3.1 1.6 1.6 0 0 1 0 3.1Zm11.4 9.8h-2.7v-4.2c0-1 0-2.3-1.4-2.3s-1.6 1.1-1.6 2.2v4.3H10V9.8h2.6V11h.1a2.8 2.8 0 0 1 2.5-1.4c2.7 0 3.2 1.8 3.2 4.1v4.7Z" />
    </svg>
  );
}
