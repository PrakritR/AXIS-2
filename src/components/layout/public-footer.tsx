import { AxisLogoLink } from "@/components/brand/axis-logo";
import Link from "next/link";

export function PublicFooter() {
  return (
    <footer className="border-t border-slate-200/80 bg-white">
      <div className="mx-auto grid max-w-6xl gap-10 px-6 py-14 md:grid-cols-4">

        {/* Brand */}
        <div className="space-y-4">
          <AxisLogoLink href="/" />
          <p className="text-sm leading-relaxed text-slate-500">
            Software and visibility for Seattle property owners and operators.
          </p>
          <div className="space-y-2">
            <a
              href="tel:+15103098345"
              className="flex items-center gap-2 text-sm font-medium text-slate-700 hover:text-[#3b66f5]"
            >
              <PhoneIcon />
              (510) 309-8345
            </a>
            <a
              href="mailto:info@axis-seattle-housing.com"
              className="flex items-center gap-2 text-sm font-medium text-slate-700 hover:text-[#3b66f5]"
            >
              <MailIcon />
              info@axis-seattle-housing.com
            </a>
          </div>
        </div>

        {/* Partner */}
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">Partner</p>
          <ul className="mt-4 space-y-2.5">
            {[
              { href: "/partner", label: "About us" },
              { href: "/partner/pricing", label: "Use our software" },
              { href: "/partner/contact", label: "Contact" },
            ].map(({ href, label }) => (
              <li key={href}>
                <Link href={href} className="text-sm font-medium text-slate-700 hover:text-[#3b66f5]">
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        {/* Homes */}
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">Homes</p>
          <ul className="mt-4 space-y-2.5">
            {[
              { href: "/rent/listings", label: "Rental listings" },
              { href: "/", label: "Axis marketing site" },
            ].map(({ href, label }) => (
              <li key={label}>
                <Link href={href} className="text-sm font-medium text-slate-700 hover:text-[#3b66f5]">
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        {/* Location */}
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">Location</p>
          <div className="mt-4 space-y-1">
            <p className="text-sm text-slate-700">5259 Brooklyn Ave NE</p>
            <p className="text-sm text-slate-700">Seattle, WA 98105</p>
            <p className="mt-2 text-sm font-medium text-slate-500">Seattle, WA</p>
            <a
              href="https://maps.google.com/?q=5259+Brooklyn+Ave+NE+Seattle+WA+98105"
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-[#3b66f5] hover:underline"
            >
              <PinIcon />
              View on Google Maps
            </a>
          </div>
        </div>
      </div>

      <div className="border-t border-slate-100 px-6 py-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between text-xs text-slate-400">
          <span>© 2026 Axis. All rights reserved.</span>
          <span className="font-medium text-slate-500">Axis &nbsp;·&nbsp; Seattle, WA</span>
        </div>
      </div>
    </footer>
  );
}

function PhoneIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-slate-400">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.38 2 2 0 0 1 3.58 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.55a16 16 0 0 0 6.54 6.54l1.21-1.21a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-slate-400">
      <rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" />
    </svg>
  );
}
