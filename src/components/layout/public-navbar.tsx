"use client";

import { AxisLogoLink } from "@/components/brand/axis-logo";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useRef, useState } from "react";

const RENT_LINKS = [
  { href: "/rent/tours-contact", label: "Schedule tour & contact" },
  { href: "/rent/apply", label: "Apply" },
  { href: "/rent/listings", label: "Properties" },
];

const PARTNER_LINKS = [
  { href: "/partner", label: "Property Management" },
  { href: "/partner/pricing", label: "Pricing" },
  { href: "/partner/contact", label: "Contact" },
];

function NavDropdown({
  label,
  links,
  active,
  activeHref,
}: {
  label: string;
  links: { href: string; label: string }[];
  active: boolean;
  activeHref?: string;
}) {
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelClose = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  const scheduleClose = () => {
    cancelClose();
    timer.current = setTimeout(() => setOpen(false), 220);
  };

  const openNow = () => {
    cancelClose();
    setOpen(true);
  };

  return (
    <div
      className="relative inline-flex touch-manipulation"
      onMouseEnter={openNow}
      onMouseLeave={scheduleClose}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
        className={`relative flex min-h-11 min-w-0 cursor-pointer select-none items-center gap-1.5 rounded-full px-5 py-2.5 text-sm font-semibold outline-none transition-colors duration-150 ${
          active
            ? "text-primary"
            : "text-slate-700 hover:bg-slate-50 hover:text-slate-900"
        } ${open ? "bg-slate-50" : ""}`}
      >
        <span className="whitespace-nowrap">{label}</span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          className={`shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          aria-hidden
        >
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {active && (
          <span className="absolute bottom-0.5 left-4 right-4 h-0.5 rounded-full bg-primary" />
        )}
      </button>

      {/* pt-2 = invisible hover bridge so pointer can reach menu without leaving the hit tree */}
      <div
        className={`absolute left-1/2 top-full z-50 -translate-x-1/2 pt-2 transition-opacity duration-150 ${
          open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        }`}
        onMouseEnter={cancelClose}
      >
        <div
          role="menu"
          className="min-w-[220px] overflow-hidden rounded-2xl border border-slate-200/90 bg-white py-1.5 shadow-[0_12px_40px_-8px_rgba(15,23,42,0.18)]"
        >
          {links.map(({ href, label: linkLabel }) => {
            const isActive = activeHref === href;
            return (
              <Link
                key={href}
                href={href}
                role="menuitem"
                onClick={() => setOpen(false)}
                className={`flex items-center gap-2.5 px-4 py-3 text-sm font-medium transition-colors duration-100 ${
                  isActive
                    ? "bg-accent text-primary"
                    : "text-slate-700 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                {isActive && (
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                )}
                {!isActive && <span className="h-1.5 w-1.5 shrink-0" />}
                {linkLabel}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function PublicNavbar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isAdminPortal = pathname.startsWith("/admin");
  const isResidentPortal = pathname.startsWith("/resident");

  const rentActive = useMemo(
    () => pathname === "/" || pathname.startsWith("/rent"),
    [pathname],
  );
  const partnerActive = useMemo(() => pathname.startsWith("/partner"), [pathname]);

  const activeRentHref = RENT_LINKS.find((l) => pathname.startsWith(l.href))?.href;
  const activePartnerHref = PARTNER_LINKS.find((l) => pathname.startsWith(l.href))?.href;

  const logoHref = isAdminPortal ? "/admin/dashboard" : isResidentPortal ? "/resident/dashboard" : "/";
  const portalHref = isAdminPortal ? "/admin/dashboard" : isResidentPortal ? "/resident/dashboard" : "/auth/sign-in";

  return (
    <div className="border-b border-slate-200/80 bg-white/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:py-3.5">
        <AxisLogoLink href={logoHref} />

        <nav className="hidden items-center gap-2 lg:flex">
          <NavDropdown
            label="Rent with Axis"
            links={RENT_LINKS}
            active={rentActive}
            activeHref={activeRentHref}
          />
          <NavDropdown
            label="Partner with Axis"
            links={PARTNER_LINKS}
            active={partnerActive}
            activeHref={activePartnerHref}
          />
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          <Link
            href={portalHref}
            className="inline-flex items-center justify-center rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground shadow-[0_0_22px_rgba(59,102,245,0.42)] transition-all duration-150 hover:brightness-[0.96] hover:shadow-[0_0_28px_rgba(59,102,245,0.48)]"
          >
            Portal
          </Link>
        </div>

        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 lg:hidden"
          onClick={() => setMobileOpen((v) => !v)}
        >
          {mobileOpen ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M3 12h18M3 6h18M3 18h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          )}
          Menu
        </button>
      </div>

      <div
        className={`overflow-hidden transition-all duration-300 ease-in-out lg:hidden ${
          mobileOpen ? "max-h-[500px] opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <div className="border-t border-slate-100 bg-white px-4 pb-5 pt-4">
          <div className="space-y-1">
            <MobileSection label="Rent with Axis">
              {RENT_LINKS.map(({ href, label }) => (
                <MobileLink
                  key={href}
                  href={href}
                  label={label}
                  active={pathname.startsWith(href)}
                  onClose={() => setMobileOpen(false)}
                />
              ))}
            </MobileSection>

            <div className="pt-1">
              <MobileSection label="Partner with Axis">
                {PARTNER_LINKS.map(({ href, label }) => (
                  <MobileLink
                    key={href}
                    href={href}
                    label={label}
                    active={pathname.startsWith(href)}
                    onClose={() => setMobileOpen(false)}
                  />
                ))}
              </MobileSection>
            </div>

            <div className="pt-3">
              <Link
                href={portalHref}
                onClick={() => setMobileOpen(false)}
                className="flex w-full items-center justify-center rounded-2xl bg-primary py-3 text-sm font-semibold text-primary-foreground shadow-[0_0_18px_rgba(59,102,245,0.38)]"
              >
                Portal
              </Link>
            </div>

            <div className="flex gap-4 border-t border-slate-100 pt-3 text-xs">
              <Link href="/manager/dashboard" className="font-semibold text-primary" onClick={() => setMobileOpen(false)}>Manager</Link>
              <Link href="/resident/dashboard" className="font-semibold text-primary" onClick={() => setMobileOpen(false)}>Resident</Link>
              <Link href="/admin/dashboard" className="font-semibold text-primary" onClick={() => setMobileOpen(false)}>Admin</Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MobileSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="px-1 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">{label}</p>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function MobileLink({
  href,
  label,
  active,
  onClose,
}: {
  href: string;
  label: string;
  active: boolean;
  onClose: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClose}
      className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
        active ? "bg-accent font-semibold text-primary" : "text-slate-700 hover:bg-slate-50"
      }`}
    >
      {active && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
      {!active && <span className="h-1.5 w-1.5 shrink-0" />}
      {label}
    </Link>
  );
}
