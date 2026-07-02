import { AxisLogoLink } from "@/components/brand/axis-logo";
import Link from "next/link";

const PARTNER_LINKS = [
  { href: "/partner", label: "Partner overview" },
  { href: "/partner/pricing", label: "Software & pricing" },
  { href: "/partner/contact", label: "Partner inquiries" },
];

const sectionHeading =
  "text-end text-[11px] font-normal uppercase tracking-[0.22em] text-muted";

const footerLinkClass =
  "block text-end text-[15px] font-normal text-muted transition-[color,opacity] duration-200 hover:text-primary hover:opacity-95";

export function PublicFooter({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <footer className="glass-nav border-t border-border bg-[var(--glass-fill)]">
        <div className="px-4 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:px-6">
          <div className="mx-auto flex max-w-6xl flex-col items-center justify-center gap-1 text-center text-[12px] font-normal text-muted sm:flex-row sm:items-center sm:justify-between sm:text-left">
            <span>© 2026 Axis. All rights reserved.</span>
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
              <span className="text-muted">Axis</span>
            </div>
          </div>
        </div>
      </footer>
    );
  }

  return (
    <footer className="glass-nav border-t border-border bg-[var(--glass-fill)]">
      <div className="mx-auto max-w-6xl rounded-t-2xl px-6 pb-6 pt-10 sm:px-5">
        <div className="flex flex-col gap-8 border-b border-border pb-6 lg:flex-row lg:items-start lg:justify-between lg:gap-12">
          <div className="max-w-[18rem] shrink-0 space-y-3">
            <AxisLogoLink href="/" />
            <p className="text-[15px] font-normal leading-relaxed text-muted">
              Software and visibility for property owners and managers.
            </p>
          </div>

          <div className="grid min-w-0 flex-1 grid-cols-2 gap-x-8 gap-y-7 sm:grid-cols-3 lg:max-w-3xl lg:justify-self-end">
            {/* Partner */}
            <div className="min-w-0 lg:text-end">
              <p className={sectionHeading}>Partner</p>
              <ul className="mt-3 flex flex-col items-end gap-2">
                {PARTNER_LINKS.map(({ href, label }) => (
                  <li key={href} className="w-full lg:w-auto">
                    <Link href={href} className={footerLinkClass}>
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Locations */}
            <div className="min-w-0 lg:text-end">
              <p className={sectionHeading}>Locations</p>
              <div className="mt-3 flex flex-col items-end gap-1 text-end">
                <p className="text-[15px] font-normal leading-snug text-muted">5259 Brooklyn Ave NE</p>
                <p className="text-[15px] font-normal leading-snug text-muted">WA 98105</p>
                <p className="pt-0.5 text-[15px] font-normal text-muted/80">United States</p>
                <div className="mt-2.5 flex w-full justify-end">
                  <a
                    href="https://www.google.com/maps/search/?api=1&query=5259+Brooklyn+Ave+NE%2C+98105"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex max-w-full items-center gap-2 text-[15px] font-normal text-primary transition-opacity duration-200 hover:opacity-90"
                  >
                    <PinIcon />
                    <span className="min-w-0 leading-snug">View on Google Maps</span>
                  </a>
                </div>
              </div>
            </div>

            {/* Contact */}
            <div className="min-w-0 lg:text-end">
              <p className={sectionHeading}>Contact</p>
              <div className="mt-3 flex flex-col items-end gap-2.5">
                <a
                  href="tel:+15103098345"
                  className="inline-flex max-w-full items-center gap-2 text-[15px] font-normal tabular-nums text-muted transition-colors hover:text-primary"
                >
                  <PhoneIcon />
                  <span className="min-w-0">(510) 309-8345</span>
                </a>
                <a
                  href="mailto:info@axis-seattle-housing.com"
                  className="max-w-full break-words text-[15px] font-normal leading-snug text-muted transition-colors hover:text-primary"
                >
                  <MailIcon className="mr-2 inline-block align-[-2px]" />
                  <span>info@axis-seattle-housing.com</span>
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="glass-nav border-t border-border bg-[var(--glass-fill)] px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-center gap-1.5 text-center text-[13px] font-normal text-muted sm:flex-row sm:items-center sm:justify-between sm:text-left">
          <span>© 2026 Axis. All rights reserved.</span>
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
            <span className="text-muted">Axis</span>
          </div>
        </div>
      </div>
    </footer>
  );
}

function PinIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 translate-y-px text-primary ${className}`}
      aria-hidden
    >
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function PhoneIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 translate-y-px text-primary ${className}`}
      aria-hidden
    >
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}

function MailIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 translate-y-px text-primary ${className}`}
      aria-hidden
    >
      <rect width="20" height="16" x="2" y="4" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </svg>
  );
}
