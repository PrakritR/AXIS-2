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

const MAPS_URL = "https://www.google.com/maps/search/?api=1&query=5259+Brooklyn+Ave+NE%2C+98105";
const PHONE = "(510) 309-8345";
const PHONE_HREF = "tel:+15103098345";
const EMAIL = "info@axis-seattle-housing.com";

function FooterColumn({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{title}</p>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-9 items-center text-[15px] font-medium text-slate-600 transition-colors hover:text-primary"
    >
      {children}
    </Link>
  );
}

function ContactRow({
  href,
  icon,
  label,
  external,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  external?: boolean;
}) {
  const cls =
    "group flex items-center gap-3 rounded-xl px-1 py-1.5 text-left transition-colors hover:bg-white/70";
  const inner = (
    <>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary transition-colors group-hover:bg-primary/15">
        {icon}
      </span>
      <span className="min-w-0 text-[15px] font-medium leading-snug text-slate-700 transition-colors group-hover:text-primary">
        {label}
      </span>
    </>
  );
  if (external) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={cls}>
        {inner}
      </a>
    );
  }
  return (
    <a href={href} className={cls}>
      {inner}
    </a>
  );
}

export function PublicFooter() {
  return (
    <footer className="relative mt-auto border-t border-slate-200/80 bg-[linear-gradient(180deg,#f8fafc_0%,#f1f5f9_100%)]">
      <div className="mx-auto max-w-6xl px-5 py-12 sm:px-6 sm:py-14 lg:py-16">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,2fr)] lg:gap-14 xl:gap-16">
          {/* Brand */}
          <div className="max-w-sm space-y-4">
            <AxisLogoLink href="/" />
            <p className="text-[15px] leading-relaxed text-slate-600">
              Software and visibility for property managers — listings, tours, applications, and resident
              workflows in one place.
            </p>
          </div>

          {/* Link columns */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-4 sm:gap-x-8">
            <FooterColumn title="Rent">
              <ul className="space-y-1">
                {RENT_LINKS.map(({ href, label }) => (
                  <li key={href}>
                    <FooterLink href={href}>{label}</FooterLink>
                  </li>
                ))}
              </ul>
            </FooterColumn>

            <FooterColumn title="Partner">
              <ul className="space-y-1">
                {PARTNER_LINKS.map(({ href, label }) => (
                  <li key={href}>
                    <FooterLink href={href}>{label}</FooterLink>
                  </li>
                ))}
              </ul>
            </FooterColumn>

            <FooterColumn title="Location">
              <address className="not-italic">
                <p className="text-[15px] font-medium leading-snug text-slate-700">5259 Brooklyn Ave NE</p>
                <p className="mt-1 text-[15px] leading-snug text-slate-600">Seattle, WA 98105</p>
                <p className="mt-1 text-sm text-slate-500">United States</p>
              </address>
              <a
                href={MAPS_URL}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-primary transition-opacity hover:opacity-80"
              >
                <PinIcon className="h-4 w-4" />
                View on Google Maps
              </a>
            </FooterColumn>

            <FooterColumn title="Contact">
              <div className="space-y-1">
                <ContactRow href={PHONE_HREF} icon={<PhoneIcon className="h-4 w-4" />} label={PHONE} />
                <ContactRow href={`mailto:${EMAIL}`} icon={<MailIcon className="h-4 w-4" />} label={EMAIL} />
              </div>
            </FooterColumn>
          </div>
        </div>
      </div>

      <div className="border-t border-slate-200/70 bg-white/60 px-5 py-4 backdrop-blur-sm sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 text-center sm:flex-row sm:text-left">
          <p className="text-sm text-slate-500">© {new Date().getFullYear()} Axis. All rights reserved.</p>
          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-sm font-medium text-slate-500">
            <Link href="/auth/sign-in" className="transition-colors hover:text-primary">
              Sign in
            </Link>
            <Link href="/partner" className="transition-colors hover:text-primary">
              List with Axis
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}

function PinIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
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
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}

function MailIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <rect width="20" height="16" x="2" y="4" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </svg>
  );
}
