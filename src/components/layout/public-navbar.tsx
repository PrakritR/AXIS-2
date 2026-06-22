"use client";

import { AxisLogoLink } from "@/components/brand/axis-logo";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Navbar1, type NavbarMenuItem } from "@/components/ui/navbar1";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

const RENT_LINKS = [
  {
    href: "/",
    label: "Axis Housing home",
    description: "Search rentals and explore the platform",
  },
  {
    href: "/rent/listings",
    label: "View all properties",
    description: "Browse available homes and apartments",
  },
  {
    href: "/rent/tours-contact",
    label: "Schedule tour",
    description: "Book a walkthrough at your preferred time",
  },
  {
    href: "/rent/apply",
    label: "Apply",
    description: "Start your online rental application",
  },
];

const PARTNER_LINKS = [
  {
    href: "/partner",
    label: "Partner overview",
    description: "Learn how Axis works for property teams",
  },
  {
    href: "/partner/pricing",
    label: "Software & pricing",
    description: "Plans and features for managers and owners",
  },
  {
    href: "/partner/contact",
    label: "Partner inquiries",
    description: "Talk with our team about getting started",
  },
];

function pathMatchesHref(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function pickActiveNavHref(pathname: string, links: readonly { href: string }[]): string | undefined {
  const matches = links.filter((l) => pathMatchesHref(pathname, l.href)).map((l) => l.href);
  if (matches.length === 0) return undefined;
  return matches.reduce((a, b) => (a.length >= b.length ? a : b));
}

function HomeIcon() {
  return (
    <svg className="size-5 shrink-0 text-primary" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M3 10.5L12 3l9 7.5V20a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1v-9.5z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function BuildingIcon() {
  return (
    <svg className="size-5 shrink-0 text-primary" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 20V8l8-4 8 4v12M9 20v-4h6v4M9 10h.01M15 10h.01M9 14h.01M15 14h.01"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg className="size-5 shrink-0 text-primary" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M8 3v2M16 3v2M4 9h16M6 5h12a2 2 0 012 2v13a2 2 0 01-2 2H6a2 2 0 01-2-2V7a2 2 0 012-2z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg className="size-5 shrink-0 text-primary" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path d="M14 2v6h6M9 13h6M9 17h6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function HandshakeIcon() {
  return (
    <svg className="size-5 shrink-0 text-primary" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 12l2-2 3 3-5 5-3-3M7 12l-2-2 3-3 5 5-3 3M2 12l4-4M22 12l-4-4"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TagIcon() {
  return (
    <svg className="size-5 shrink-0 text-primary" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M20 12l-8 8-8-8V4h8l8 8z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <circle cx="9" cy="9" r="1.5" fill="currentColor" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg className="size-5 shrink-0 text-primary" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 6h16v12H4V6zM4 7l8 6 8-6"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const RENT_ICONS = [HomeIcon, BuildingIcon, CalendarIcon, FileIcon];
const PARTNER_ICONS = [HandshakeIcon, TagIcon, MailIcon];

export function PublicNavbar() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);

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

  const menu: NavbarMenuItem[] = useMemo(
    () => [
      {
        title: "Rent with Axis",
        url: "/",
        active: rentActive,
        activeChildHref: activeRentHref,
        items: RENT_LINKS.map((link, i) => {
          const Icon = RENT_ICONS[i] ?? BuildingIcon;
          return {
            title: link.label,
            url: link.href,
            description: link.description,
            icon: <Icon />,
          };
        }),
      },
      {
        title: "Partner with Axis",
        url: "/partner",
        active: partnerActive,
        activeChildHref: activePartnerHref,
        items: PARTNER_LINKS.map((link, i) => {
          const Icon = PARTNER_ICONS[i] ?? HandshakeIcon;
          return {
            title: link.label,
            url: link.href,
            description: link.description,
            icon: <Icon />,
          };
        }),
      },
    ],
    [rentActive, partnerActive, activeRentHref, activePartnerHref],
  );

  return (
    <div
      id="axis-public-navbar"
      data-scrolled={scrolled ? "true" : "false"}
      className={`glass-nav sticky top-0 z-50 border-b pt-[env(safe-area-inset-top,0px)] transition-[background,box-shadow,border-color,backdrop-filter] duration-300 ease-out ${
        scrolled
          ? "border-border bg-[var(--glass-fill)] shadow-[0_1px_0_rgba(255,255,255,0.7)_inset,0_12px_36px_-24px_rgba(15,23,42,0.12)] supports-[backdrop-filter]:bg-[var(--glass-fill)]"
          : "border-transparent bg-[var(--glass-fill)]/80 shadow-none"
      }`}
    >
      <Navbar1
        logoSlot={<AxisLogoLink href="/" />}
        menu={menu}
        auth={{
          login: { text: "Log in", url: "#" },
          signup: { text: "Sign up", url: "#" },
        }}
        actionsSlot={<ThemeToggle />}
      />
    </div>
  );
}
