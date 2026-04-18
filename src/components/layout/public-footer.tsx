import { AxisLogoLink } from "@/components/brand/axis-logo";
import Link from "next/link";

const RENT_LINKS = [
  { href: "/rent/listings", label: "Properties" },
  { href: "/rent/tours-contact", label: "Schedule a tour" },
  { href: "/rent/apply", label: "Apply" },
];

const PARTNER_LINKS = [
  { href: "/partner", label: "Partner overview" },
  { href: "/partner/pricing", label: "Software & pricing" },
  { href: "/partner/contact", label: "Partner inquiries" },
];

const sectionHeading =
  "text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500";

export function PublicFooter() {
  return (
    <footer className="border-t border-slate-200/70 bg-[linear-gradient(180deg,#fafcff_0%,#f3f8ff_55%,#eef4fb_100%)]">
      <div className="mx-auto max-w-6xl px-6 py-14">
        <div className="flex flex-col gap-12 border-b border-slate-200/60 pb-10 lg:flex-row lg:items-start lg:justify-between lg:gap-16">
          <div className="max-w-[18rem] shrink-0 space-y-4">
            <AxisLogoLink href="/" />
            <p className="text-[15px] leading-relaxed tracking-[-0.01em] text-slate-600">
              Software and visibility for property owners and managers.
            </p>
          </div>

          <div className="grid min-w-0 flex-1 grid-cols-2 gap-x-8 gap-y-10 sm:grid-cols-4 lg:max-w-3xl lg:justify-self-end">
            {/* Rent */}
            <div className="lg:text-right">
              <p className={sectionHeading}>Rent</p>
              <ul className="mt-4 space-y-2.5">
                {RENT_LINKS.map(({ href, label }) => (
                  <li key={href}>
                    <Link
                      href={href}
                      className="block text-[15px] font-medium tracking-[-0.01em] text-slate-600 transition-[color,transform] duration-200 hover:text-primary lg:inline-block lg:hover:-translate-x-0.5"
                    >
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Partner */}
            <div className="lg:text-right">
              <p className={sectionHeading}>Partner</p>
              <ul className="mt-4 space-y-2.5">
                {PARTNER_LINKS.map(({ href, label }) => (
                  <li key={href}>
                    <Link
                      href={href}
                      className="block text-[15px] font-medium tracking-[-0.01em] text-slate-600 transition-[color,transform] duration-200 hover:text-primary lg:inline-block lg:hover:-translate-x-0.5"
                    >
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Locations */}
            <div className="lg:text-right">
              <p className={sectionHeading}>Locations</p>
              <div className="mt-4 space-y-1">
                <p className="text-[15px] leading-snug tracking-[-0.01em] text-slate-600">5259 Brooklyn Ave NE</p>
                <p className="text-[15px] leading-snug tracking-[-0.01em] text-slate-600">WA 98105</p>
                <p className="pt-1 text-[15px] font-medium tracking-[-0.01em] text-slate-500">United States</p>
                <div className="mt-3 lg:flex lg:justify-end">
                  <a
                    href="https://www.google.com/maps/search/?api=1&query=5259+Brooklyn+Ave+NE%2C+98105"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-[15px] font-semibold tracking-[-0.01em] text-primary transition-opacity duration-200 hover:opacity-90"
                  >
                    <PinIcon />
                    View on Google Maps
                  </a>
                </div>
              </div>
            </div>

            {/* Contact */}
            <div className="lg:text-right">
              <p className={sectionHeading}>Contact</p>
              <ul className="mt-4 space-y-3">
                <li className="lg:flex lg:justify-end">
                  <a
                    href="tel:+15103098345"
                    className="inline-flex items-center gap-2 text-[15px] font-medium tracking-[-0.01em] text-slate-600 transition-colors hover:text-primary"
                  >
                    <PhoneIcon />
                    (510) 309-8345
                  </a>
                </li>
                <li className="lg:flex lg:justify-end">
                  <a
                    href="mailto:info@axis-seattle-housing.com"
                    className="inline-flex max-w-full items-center gap-2 break-all text-left text-[15px] font-medium tracking-[-0.01em] text-slate-600 transition-colors hover:text-primary lg:text-right"
                  >
                    <MailIcon />
                    info@axis-seattle-housing.com
                  </a>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-slate-200/60 bg-white/40 px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-[2px] sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-center gap-2 text-center text-[13px] tracking-[-0.01em] text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:text-left">
          <span>© 2026 Axis. All rights reserved.</span>
          <span className="font-medium text-slate-500">Axis Housing</span>
        </div>
      </div>
    </footer>
  );
}

function PinIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0 text-primary"
      aria-hidden
    >
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0 text-primary"
      aria-hidden
    >
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0 text-primary"
      aria-hidden
    >
      <rect width="20" height="16" x="2" y="4" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </svg>
  );
}
