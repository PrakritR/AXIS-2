"use client";

import { AxisLogoLink } from "@/components/brand/axis-logo";
import { PublicNavbarPortalStrip } from "@/components/layout/public-navbar-portal-strip";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

const RENT_LINKS = [
  { href: "/rent/listings", label: "View all properties" },
  { href: "/rent/tours-contact", label: "Schedule tour" },
  { href: "/rent/apply", label: "Apply" },
];

const PARTNER_LINKS = [
  { href: "/partner", label: "Partner overview" },
  { href: "/partner/pricing", label: "Software & pricing" },
  { href: "/partner/contact", label: "Partner inquiries" },
];

type MenuKey = "rent" | "partner";

/** Path is this route or a deeper segment (`/partner/pricing` must not match only `/partner`). */
function pathMatchesHref(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Pick the longest matching link so `/partner/pricing` highlights Software & pricing, not Partner overview. */
function pickActiveNavHref(pathname: string, links: readonly { href: string }[]): string | undefined {
  const matches = links.filter((l) => pathMatchesHref(pathname, l.href)).map((l) => l.href);
  if (matches.length === 0) return undefined;
  return matches.reduce((a, b) => (a.length >= b.length ? a : b));
}

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
    const handler = () => setScrolled(window.scrollY > 20);
    handler();
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

  const rentActive = useMemo(() => pathname === "/" || pathname.startsWith("/rent"), [pathname]);
  const partnerActive = useMemo(() => pathname.startsWith("/partner"), [pathname]);
  const activeRentHref = useMemo(() => pickActiveNavHref(pathname, RENT_LINKS), [pathname]);
  const activePartnerHref = useMemo(() => pickActiveNavHref(pathname, PARTNER_LINKS), [pathname]);
  return (
    <div
      id="axis-public-navbar"
      className={`sticky top-0 z-50 border-b pt-[env(safe-area-inset-top,0px)] transition-[background,box-shadow,border-color,backdrop-filter] duration-300 ease-out ${
        scrolled
          ? "border-slate-200/80 bg-white/80 shadow-[0_1px_0_rgba(255,255,255,0.7)_inset,0_12px_40px_-20px_rgba(15,23,42,0.12)] backdrop-blur-xl supports-[backdrop-filter]:bg-white/70"
          : "border-transparent bg-white/95 shadow-none backdrop-blur-none"
      }`}
    >
      <div className="mx-auto grid min-h-[52px] w-full max-w-6xl grid-cols-[1fr_auto] items-center gap-3 px-4 sm:px-5 sm:min-h-[56px] lg:grid-cols-[auto_1fr_auto]">
        <div className="justify-self-start">
          <AxisLogoLink href="/" />
        </div>

        <nav
          className="hidden items-center justify-center gap-1 justify-self-center lg:flex"
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

        <div className="flex items-center justify-end justify-self-end gap-2">
          <div className="hidden lg:block">
            <PublicNavbarPortalStrip />
          </div>

          {/* Mobile menu button */}
          <button
            type="button"
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-2 rounded-full border border-slate-200/90 bg-white px-4 py-2 text-sm font-medium text-[#1d1d1f] transition hover:bg-slate-50 lg:hidden"
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
      </div>

      {/* Mobile drawer */}
      <div
        className={`overflow-hidden transition-all duration-300 ease-in-out lg:hidden ${
          mobileOpen ? "max-h-[520px] opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <div className="border-t border-slate-100 bg-white px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-4 sm:px-5">
          <div className="space-y-1">
            <MobileSection label="Rent with Axis">
              <MobileLink href="/" label="Axis Housing home" active={pathname === "/"} onClose={() => setMobileOpen(false)} />
              {RENT_LINKS.map(({ href, label }) => (
                <MobileLink
                  key={href}
                  href={href}
                  label={label}
                  active={activeRentHref === href}
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
                    active={activePartnerHref === href}
                    onClose={() => setMobileOpen(false)}
                  />
                ))}
              </MobileSection>
            </div>
            <div className="pt-4">
              <div className="flex w-full flex-col items-stretch gap-2">
                <PublicNavbarPortalStrip className="w-full justify-center" onInteract={() => setMobileOpen(false)} />
              </div>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-2 border-t border-black/[0.06] pt-3 text-xs">
              <Link href="/auth/sign-in" className="font-semibold text-[#007aff]" onClick={() => setMobileOpen(false)}>
                Sign in
              </Link>
              <Link href="/auth/create-account" className="font-semibold text-[#007aff]" onClick={() => setMobileOpen(false)}>
                Create account
              </Link>
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
    <div className="relative inline-flex items-center gap-0.5">
      <Link
        href="/"
        className={`relative flex items-center rounded-full px-3 py-2 text-[15px] font-medium outline-none transition-colors duration-200 ${
          active ? "text-[#007aff]" : "text-[#1d1d1f]/85 hover:text-[#1d1d1f]"
        } ${open ? "bg-slate-100/80" : "hover:bg-slate-100/60"}`}
      >
        Rent with Axis
      </Link>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Rent menu"
        onClick={(e) => {
          e.preventDefault();
          onToggleChevron();
        }}
        className={`relative flex items-center rounded-full p-2 outline-none transition-colors duration-200 ${
          active ? "text-[#007aff]" : "text-[#1d1d1f]/85 hover:text-[#1d1d1f]"
        } ${open ? "bg-slate-100/80" : "hover:bg-slate-100/60"}`}
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden className={`shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`}>
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {active && (
        <span className="pointer-events-none absolute bottom-0 left-2 right-8 h-[2px] rounded-full bg-[#007aff] transition-all duration-300" />
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
        className={`relative flex items-center gap-1.5 rounded-full px-4 py-2 text-[15px] font-medium outline-none transition-colors duration-200 ${
          active ? "text-[#007aff]" : "text-[#1d1d1f]/85 hover:text-[#1d1d1f]"
        } ${open ? "bg-slate-100/80" : "hover:bg-slate-100/60"}`}
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
      className={`absolute left-1/2 top-full z-50 -translate-x-1/2 pt-4 transition-all duration-200 ${
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
              className={`flex items-center gap-3 px-4 py-2.5 text-[14px] font-medium transition-[transform,background-color,color] duration-200 ease-out active:scale-[0.99] ${
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
      className={`flex min-h-[44px] items-center gap-2.5 rounded-xl px-3 py-3 text-[14px] font-medium transition-[background-color,color,transform] duration-200 sm:min-h-0 sm:py-2.5 ${
        active ? "bg-[#007aff]/[0.08] font-semibold text-[#007aff]" : "text-[#1d1d1f]/80 hover:bg-black/[0.04]"
      }`}
    >
      {active && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#007aff]" />}
      {!active && <span className="h-1.5 w-1.5 shrink-0" />}
      {label}
    </Link>
  );
}
