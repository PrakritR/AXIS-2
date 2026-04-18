"use client";

import { AxisLogoLink } from "@/components/brand/axis-logo";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";

function NavPill({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold transition sm:px-4 sm:text-sm ${
        active
          ? "bg-white text-slate-900 shadow-sm ring-2 ring-[#2b5ce7]"
          : "text-slate-600 hover:bg-white/90 hover:text-slate-900"
      }`}
    >
      {label}
    </Link>
  );
}

function SectionLabel({
  children,
  active,
}: {
  children: string;
  active: boolean;
}) {
  return (
    <span className="relative inline-flex items-center gap-1 pb-1 text-sm font-semibold text-slate-900">
      {children}
      <span className="text-[10px] font-normal text-slate-500">▾</span>
      {active ? (
        <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-[#2b5ce7]" />
      ) : null}
    </span>
  );
}

export function PublicNavbar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isAdminPortal = pathname.startsWith("/admin");
  const isResidentPortal = pathname.startsWith("/resident");
  const isAuth = pathname.startsWith("/auth");

  const rentActive = useMemo(
    () => pathname === "/" || pathname.startsWith("/rent"),
    [pathname],
  );
  const partnerActive = useMemo(() => pathname.startsWith("/partner"), [pathname]);

  const tourContactActive =
    pathname.startsWith("/rent/tours-contact") || pathname === "/rent/tours";
  const applyActive = pathname.startsWith("/rent/apply");
  const propertiesActive = pathname.startsWith("/rent/listings");
  const pricingActive = pathname.startsWith("/partner/pricing");
  const partnerContactActive = pathname.startsWith("/partner/contact");

  const logoVariant =
    isAuth ? "portalHeader" : isAdminPortal || isResidentPortal ? "adminHeader" : "default";
  const logoHref = isAdminPortal ? "/admin/dashboard" : isResidentPortal ? "/resident/dashboard" : "/";

  return (
    <div className="border-b border-slate-200/90 bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-3 px-4 py-3 sm:py-4">
        <AxisLogoLink href={logoHref} variant={logoVariant} />

        <nav className="hidden min-w-0 flex-1 flex-col gap-4 px-2 lg:flex lg:flex-row lg:items-center lg:justify-center lg:gap-8 xl:gap-12">
          <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
            <SectionLabel active={rentActive}>Rent with Axis</SectionLabel>
            <div className="flex flex-wrap items-center justify-center gap-1 rounded-full bg-slate-100/90 p-1 ring-1 ring-slate-200/80">
              <NavPill
                href="/rent/tours-contact"
                label="Schedule tour & contact"
                active={tourContactActive}
              />
              <NavPill href="/rent/apply" label="Apply" active={applyActive} />
              <NavPill href="/rent/listings" label="Properties" active={propertiesActive} />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
            <SectionLabel active={partnerActive}>Partner with Axis</SectionLabel>
            <div className="flex flex-wrap items-center justify-center gap-1 rounded-full bg-slate-100/90 p-1 ring-1 ring-slate-200/80">
              <NavPill href="/partner/pricing" label="Pricing" active={pricingActive} />
              <NavPill href="/partner/contact" label="Contact" active={partnerContactActive} />
            </div>
          </div>
        </nav>

        <div className="hidden lg:block">
          <Link
            href={
              isAdminPortal ? "/admin/dashboard" : isResidentPortal ? "/resident/dashboard" : "/auth/sign-in"
            }
            className="inline-flex items-center justify-center rounded-full bg-[#2b5ce7] px-7 py-2.5 text-sm font-semibold text-white shadow-[0_0_22px_rgba(43,92,231,0.45)] transition hover:bg-blue-600"
          >
            Portal
          </Link>
        </div>

        <button
          type="button"
          className="inline-flex rounded-full border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-800 md:ml-auto lg:hidden"
          onClick={() => setMobileOpen((v) => !v)}
        >
          Menu
        </button>
      </div>

      {mobileOpen ? (
        <div className="border-t border-slate-200 bg-white px-4 py-4 lg:hidden">
          <div className="space-y-3">
            <Link className="block font-semibold text-slate-900" href="/" onClick={() => setMobileOpen(false)}>
              Home
            </Link>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Rent with Axis</p>
            <Link
              className="block py-1 text-sm font-semibold text-slate-800"
              href="/rent/tours-contact"
              onClick={() => setMobileOpen(false)}
            >
              Schedule tour & contact
            </Link>
            <Link className="block py-1 text-sm font-semibold text-slate-800" href="/rent/apply" onClick={() => setMobileOpen(false)}>
              Apply
            </Link>
            <Link className="block py-1 text-sm font-semibold text-slate-800" href="/rent/listings" onClick={() => setMobileOpen(false)}>
              Properties
            </Link>
            <p className="pt-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">Partner with Axis</p>
            <Link className="block py-1 text-sm font-semibold text-slate-800" href="/partner/pricing" onClick={() => setMobileOpen(false)}>
              Pricing
            </Link>
            <Link className="block py-1 text-sm font-semibold text-slate-800" href="/partner/contact" onClick={() => setMobileOpen(false)}>
              Contact
            </Link>
            <Link
              href={
                isAdminPortal ? "/admin/dashboard" : isResidentPortal ? "/resident/dashboard" : "/auth/sign-in"
              }
              onClick={() => setMobileOpen(false)}
            >
              <span className="mt-3 flex w-full items-center justify-center rounded-full bg-[#2b5ce7] py-3 text-sm font-semibold text-white shadow-[0_0_20px_rgba(43,92,231,0.4)]">
                Portal
              </span>
            </Link>
            <div className="border-t border-slate-100 pt-3 text-xs text-slate-500">
              <Link href="/manager/dashboard" className="mr-3 font-semibold text-[#2b5ce7]" onClick={() => setMobileOpen(false)}>
                Manager
              </Link>
              <Link href="/resident/dashboard" className="mr-3 font-semibold text-[#2b5ce7]" onClick={() => setMobileOpen(false)}>
                Resident
              </Link>
              <Link href="/admin/dashboard" className="font-semibold text-[#2b5ce7]" onClick={() => setMobileOpen(false)}>
                Admin
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
