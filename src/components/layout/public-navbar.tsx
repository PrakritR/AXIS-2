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

  const enter = () => {
    if (timer.current) clearTimeout(timer.current);
    setOpen(true);
  };
  const leave = () => {
    timer.current = setTimeout(() => setOpen(false), 120);
  };

  return (
    <div className="relative" onMouseEnter={enter} onMouseLeave={leave}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`group relative flex items-center gap-1 rounded-full px-4 py-2 text-sm font-semibold transition-colors duration-150 ${
          active
            ? "text-[#2b5ce7]"
            : "text-slate-700 hover:text-slate-900"
        }`}
      >
        {label}
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          className={`mt-0.5 shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        >
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {active && (
          <span className="absolute bottom-0 left-4 right-4 h-0.5 rounded-full bg-[#2b5ce7]" />
        )}
      </button>

      <div
        className={`absolute left-1/2 top-full z-50 mt-2 -translate-x-1/2 transition-all duration-200 ${
          open ? "pointer-events-auto translate-y-0 opacity-100" : "pointer-events-none -translate-y-1 opacity-0"
        }`}
      >
        <div className="min-w-[200px] overflow-hidden rounded-2xl border border-slate-200/80 bg-white py-1.5 shadow-[0_8px_32px_-4px_rgba(15,23,42,0.15)]">
          {links.map(({ href, label: linkLabel }) => {
            const isActive = activeHref === href;
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium transition-colors duration-100 ${
                  isActive
                    ? "bg-[#eef2ff] text-[#2b5ce7]"
                    : "text-slate-700 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                {isActive && (
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#2b5ce7]" />
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

        <nav className="hidden items-center gap-1 lg:flex">
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
            className="inline-flex items-center justify-center rounded-full bg-[#2b5ce7] px-6 py-2.5 text-sm font-semibold text-white shadow-[0_0_20px_rgba(43,92,231,0.4)] transition-all duration-150 hover:bg-[#2451d4] hover:shadow-[0_0_28px_rgba(43,92,231,0.5)]"
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
                className="flex w-full items-center justify-center rounded-2xl bg-[#2b5ce7] py-3 text-sm font-semibold text-white shadow-[0_0_18px_rgba(43,92,231,0.35)]"
              >
                Portal
              </Link>
            </div>

            <div className="flex gap-4 border-t border-slate-100 pt-3 text-xs">
              <Link href="/manager/dashboard" className="font-semibold text-[#2b5ce7]" onClick={() => setMobileOpen(false)}>Manager</Link>
              <Link href="/resident/dashboard" className="font-semibold text-[#2b5ce7]" onClick={() => setMobileOpen(false)}>Resident</Link>
              <Link href="/admin/dashboard" className="font-semibold text-[#2b5ce7]" onClick={() => setMobileOpen(false)}>Admin</Link>
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
        active ? "bg-[#eef2ff] font-semibold text-[#2b5ce7]" : "text-slate-700 hover:bg-slate-50"
      }`}
    >
      {active && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#2b5ce7]" />}
      {!active && <span className="h-1.5 w-1.5 shrink-0" />}
      {label}
    </Link>
  );
}
