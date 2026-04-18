"use client";

import { AxisLogoLink } from "@/components/brand/axis-logo";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

const RENT_LINKS = [
  { href: "/rent/tours-contact", label: "Schedule tour" },
  { href: "/rent/apply", label: "Apply" },
  { href: "/rent/listings", label: "Rental listings" },
];

const PARTNER_LINKS = [
  { href: "/partner", label: "Partner overview" },
  { href: "/partner/pricing", label: "Software & pricing" },
  { href: "/partner/contact", label: "Partner inquiries" },
];

type MenuKey = "rent" | "partner";

export function PublicNavbar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [openKey, setOpenKey] = useState<MenuKey | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };

  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpenKey(null), 200);
  };

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

  const isAdminPortal = pathname.startsWith("/admin");
  const isResidentPortal = pathname.startsWith("/resident");
  const rentActive = useMemo(() => pathname === "/" || pathname.startsWith("/rent"), [pathname]);
  const partnerActive = useMemo(() => pathname.startsWith("/partner"), [pathname]);
  const activeRentHref = RENT_LINKS.find((l) => pathname.startsWith(l.href))?.href;
  const activePartnerHref = PARTNER_LINKS.find((l) => pathname.startsWith(l.href))?.href;
  const logoHref = isAdminPortal ? "/admin/dashboard" : isResidentPortal ? "/resident/dashboard" : "/";
  const portalHref = isAdminPortal ? "/admin/dashboard" : isResidentPortal ? "/resident/dashboard" : "/auth/sign-in";

  return (
    <div
      className={`sticky top-0 z-40 transition-all duration-300 ${
        scrolled
          ? "border-b border-black/[0.06] bg-white/80 shadow-[0_1px_20px_rgba(0,0,0,0.06)] backdrop-blur-2xl"
          : "bg-white/60 backdrop-blur-xl"
      }`}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3">
        <AxisLogoLink href={logoHref} />

        <nav
          className="hidden items-center gap-1 lg:flex"
          onMouseLeave={scheduleClose}
        >
          <div
            className="relative"
            onMouseEnter={() => {
              cancelClose();
              setOpenKey("rent");
            }}
          >
            <RentWithAxisTrigger
              active={rentActive}
              open={openKey === "rent"}
              onToggleChevron={() => setOpenKey((k) => (k === "rent" ? null : "rent"))}
            />
            <DropdownPanel
              open={openKey === "rent"}
              links={RENT_LINKS}
              activeHref={activeRentHref}
              onNavigate={() => setOpenKey(null)}
              cancelClose={cancelClose}
            />
          </div>

          <div
            className="relative"
            onMouseEnter={() => {
              cancelClose();
              setOpenKey("partner");
            }}
          >
            <PartnerDropdownTrigger active={partnerActive} open={openKey === "partner"} onToggle={() => setOpenKey((k) => (k === "partner" ? null : "partner"))} label="Partner with Axis" />
            <DropdownPanel
              open={openKey === "partner"}
              links={PARTNER_LINKS}
              activeHref={activePartnerHref}
              onNavigate={() => setOpenKey(null)}
              cancelClose={cancelClose}
            />
          </div>
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          <Link
            href={portalHref}
            className="inline-flex items-center justify-center rounded-full px-5 py-2 text-[14px] font-semibold text-white transition-all duration-200 hover:-translate-y-[1px] active:translate-y-0 active:scale-[0.98]"
            style={{
              background: "linear-gradient(135deg, #007aff, #339cff)",
              boxShadow: "0 4px 20px rgba(0,122,255,0.32)",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.boxShadow = "0 6px 28px rgba(0,122,255,0.45)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 20px rgba(0,122,255,0.32)";
            }}
          >
            Portal
          </Link>
        </div>

        {/* Mobile menu button */}
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-full border border-black/[0.08] bg-white/80 px-4 py-2 text-sm font-medium text-[#1d1d1f] transition hover:bg-black/[0.04] lg:hidden"
          onClick={() => setMobileOpen((v) => !v)}
        >
          {mobileOpen ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M3 12h18M3 6h18M3 18h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
          )}
          Menu
        </button>
      </div>

      {/* Mobile drawer */}
      <div
        className={`overflow-hidden transition-all duration-300 ease-in-out lg:hidden ${
          mobileOpen ? "max-h-[520px] opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <div className="border-t border-black/[0.06] bg-white/90 px-5 pb-6 pt-4 backdrop-blur-2xl">
          <div className="space-y-1">
            <MobileSection label="Rent with Axis">
              <MobileLink href="/" label="Axis Housing home" active={pathname === "/"} onClose={() => setMobileOpen(false)} />
              {RENT_LINKS.map(({ href, label }) => (
                <MobileLink key={href} href={href} label={label} active={pathname.startsWith(href)} onClose={() => setMobileOpen(false)} />
              ))}
            </MobileSection>
            <div className="pt-1">
              <MobileSection label="Partner with Axis">
                {PARTNER_LINKS.map(({ href, label }) => (
                  <MobileLink key={href} href={href} label={label} active={pathname.startsWith(href)} onClose={() => setMobileOpen(false)} />
                ))}
              </MobileSection>
            </div>
            <div className="pt-4">
              <Link
                href={portalHref}
                onClick={() => setMobileOpen(false)}
                className="flex w-full items-center justify-center rounded-full py-3 text-[14px] font-semibold text-white"
                style={{ background: "linear-gradient(135deg, #007aff, #339cff)", boxShadow: "0 4px 20px rgba(0,122,255,0.3)" }}
              >
                Portal
              </Link>
            </div>
            <div className="flex gap-4 border-t border-black/[0.06] pt-3 text-xs">
              <Link href="/manager/dashboard" className="font-semibold text-[#007aff]" onClick={() => setMobileOpen(false)}>Manager</Link>
              <Link href="/resident/dashboard" className="font-semibold text-[#007aff]" onClick={() => setMobileOpen(false)}>Resident</Link>
              <Link href="/admin/dashboard" className="font-semibold text-[#007aff]" onClick={() => setMobileOpen(false)}>Admin</Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function RentWithAxisTrigger({
  active,
  open,
  onToggleChevron,
}: {
  active: boolean;
  open: boolean;
  onToggleChevron: () => void;
}) {
  return (
    <div className="relative inline-flex items-stretch overflow-hidden rounded-full border border-black/[0.06] bg-black/[0.02] shadow-sm">
      <Link
        href="/"
        className={`relative flex items-center px-4 py-2 text-[15px] font-medium outline-none transition-all duration-200 ${
          active ? "text-[#007aff]" : "text-[#1d1d1f]/80 hover:text-[#1d1d1f]"
        } ${open ? "bg-black/[0.04]" : "hover:bg-black/[0.04]"}`}
      >
        Rent with Axis
      </Link>
      <span className="w-px shrink-0 self-stretch bg-black/[0.08]" aria-hidden />
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Rent menu"
        onClick={(e) => {
          e.preventDefault();
          onToggleChevron();
        }}
        className={`relative flex items-center pr-3 pl-2 py-2 outline-none transition-all duration-200 ${
          active ? "text-[#007aff]" : "text-[#1d1d1f]/80 hover:text-[#1d1d1f]"
        } ${open ? "bg-black/[0.04]" : "hover:bg-black/[0.04]"}`}
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden className={`shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`}>
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {active && (
        <span className="pointer-events-none absolute bottom-0 left-3 right-3 h-[2px] rounded-full bg-[#007aff] transition-all duration-300" />
      )}
    </div>
  );
}

function PartnerDropdownTrigger({
  label,
  active,
  open,
  onToggle,
}: {
  label: string;
  active: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={onToggle}
        className={`relative flex items-center gap-1.5 rounded-full px-4 py-2 text-[15px] font-medium outline-none transition-all duration-200 ${
          active ? "text-[#007aff]" : "text-[#1d1d1f]/80 hover:text-[#1d1d1f]"
        } ${open ? "bg-black/[0.04]" : "hover:bg-black/[0.04]"}`}
      >
        <span>{label}</span>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden className={`shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`}>
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {active && (
          <span className="absolute bottom-0 left-4 right-4 h-[2px] rounded-full bg-[#007aff] transition-all duration-300" />
        )}
      </button>
    </div>
  );
}

function DropdownPanel({
  open,
  links,
  activeHref,
  onNavigate,
  cancelClose,
}: {
  open: boolean;
  links: { href: string; label: string }[];
  activeHref?: string;
  onNavigate: () => void;
  cancelClose: () => void;
}) {
  return (
    <div
      className={`absolute left-1/2 top-full z-50 -translate-x-1/2 pt-3 transition-all duration-200 ${
        open ? "pointer-events-auto translate-y-0 opacity-100" : "pointer-events-none -translate-y-1 opacity-0"
      }`}
      onMouseEnter={cancelClose}
    >
      <div className="min-w-[220px] overflow-hidden rounded-2xl border border-black/[0.06] bg-white/90 py-1.5 shadow-[0_20px_60px_-12px_rgba(0,0,0,0.18)] backdrop-blur-2xl">
        {links.map(({ href, label: linkLabel }) => {
          const isActive = activeHref === href;
          return (
            <Link
              key={href}
              href={href}
              onClick={() => onNavigate()}
              className={`flex items-center gap-3 px-4 py-2.5 text-[14px] font-medium transition-colors duration-100 ${
                isActive
                  ? "bg-[#007aff]/[0.08] text-[#007aff]"
                  : "text-[#1d1d1f]/80 hover:bg-black/[0.04] hover:text-[#1d1d1f]"
              }`}
            >
              {isActive && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#007aff]" />}
              {!isActive && <span className="h-1.5 w-1.5 shrink-0" />}
              {linkLabel}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function MobileSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="px-2 py-2 text-[10px] font-bold uppercase tracking-widest text-[#6e6e73]">{label}</p>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function MobileLink({ href, label, active, onClose }: { href: string; label: string; active: boolean; onClose: () => void }) {
  return (
    <Link
      href={href}
      onClick={onClose}
      className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-[14px] font-medium transition-colors ${
        active ? "bg-[#007aff]/[0.08] font-semibold text-[#007aff]" : "text-[#1d1d1f]/80 hover:bg-black/[0.04]"
      }`}
    >
      {active && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#007aff]" />}
      {!active && <span className="h-1.5 w-1.5 shrink-0" />}
      {label}
    </Link>
  );
}
