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

export function PublicFooter() {
  return (
    <footer className="border-t border-slate-200/80 bg-white">
      <div className="mx-auto max-w-6xl px-6 py-14">
        <div className="space-y-4 border-b border-slate-100 pb-8">
          <AxisLogoLink href="/" />
          <p className="text-sm leading-relaxed text-slate-500">
            Software and visibility for property owners and managers.
          </p>
        </div>

        <div className="grid gap-10 pt-8 md:grid-cols-3">
        {/* Rent */}
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">Rent</p>
          <ul className="mt-4 space-y-2.5">
            {RENT_LINKS.map(({ href, label }) => (
              <li key={href}>
                <Link
                  href={href}
                  className="text-sm font-medium text-slate-700 transition-[color,transform] duration-200 hover:text-primary hover:translate-x-0.5"
                >
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        {/* Partner */}
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">Partner</p>
          <ul className="mt-4 space-y-2.5">
            {PARTNER_LINKS.map(({ href, label }) => (
              <li key={href}>
                <Link
                  href={href}
                  className="text-sm font-medium text-slate-700 transition-[color,transform] duration-200 hover:text-primary hover:translate-x-0.5"
                >
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        {/* Locations */}
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">Locations</p>
          <div className="mt-4 space-y-1">
            <p className="text-sm text-slate-700">5259 Brooklyn Ave NE</p>
            <p className="text-sm text-slate-700">WA 98105</p>
            <p className="mt-2 text-sm font-medium text-slate-500">United States</p>
            <a
              href="https://www.google.com/maps/search/?api=1&query=5259+Brooklyn+Ave+NE%2C+98105"
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-primary transition-[opacity,transform] duration-200 hover:underline hover:opacity-90"
            >
              <PinIcon />
              View on Google Maps
            </a>
          </div>
        </div>
        </div>
      </div>

      <div className="border-t border-slate-100 px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-center gap-2 text-center text-xs text-slate-400 sm:flex-row sm:items-center sm:justify-between sm:text-left">
          <span>© 2026 Axis. All rights reserved.</span>
          <span className="font-medium text-slate-500">Axis Housing</span>
        </div>
      </div>
    </footer>
  );
}

function PinIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" />
    </svg>
  );
}
