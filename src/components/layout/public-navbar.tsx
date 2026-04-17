"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";

type Item = { label: string; href: string };

function Dropdown({
  label,
  items,
  active,
}: {
  label: string;
  items: Item[];
  active: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold transition ${
          active ? "text-foreground" : "text-muted hover:text-foreground"
        }`}
      >
        {label}
        <span className="text-xs">▾</span>
      </button>
      <span
        className={`absolute left-3 right-3 top-full h-0.5 rounded-full bg-primary ${
          active ? "opacity-100" : "opacity-0"
        }`}
      />
      {open ? (
        <div className="absolute left-0 top-full z-50 pt-2">
          <div className="min-w-[220px] rounded-2xl border border-border bg-card p-2 shadow-xl">
            {items.map((it) => (
              <Link
                key={it.href}
                href={it.href}
                className="block rounded-xl px-3 py-2 text-sm font-semibold text-foreground hover:bg-slate-50"
              >
                {it.label}
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function PublicNavbar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const rentActive = useMemo(() => pathname.startsWith("/rent"), [pathname]);
  const partnerActive = useMemo(
    () => pathname.startsWith("/partner"),
    [pathname],
  );

  const portals: (Item & { prefix: string })[] = [
    { label: "Manager portal", href: "/manager/dashboard", prefix: "/manager" },
    { label: "Resident portal", href: "/resident/dashboard", prefix: "/resident" },
    { label: "Admin portal", href: "/admin/dashboard", prefix: "/admin" },
  ];

  const rentItems: Item[] = [
    { label: "Listings hub", href: "/rent" },
    { label: "Property listings", href: "/rent/listings" },
    { label: "Apply", href: "/rent/apply" },
    { label: "Schedule tour", href: "/rent/tours" },
    { label: "FAQ", href: "/rent/faq" },
    { label: "Contact", href: "/rent/contact" },
  ];

  const partnerItems: Item[] = [
    { label: "Partner overview", href: "/partner" },
    { label: "Pricing", href: "/partner/pricing" },
    { label: "Contact", href: "/partner/contact" },
  ];

  return (
    <div className="border-b border-border bg-white/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4">
        <Link href="/" className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary text-sm font-black text-white">
            AX
          </span>
          <span className="leading-tight">
            <span className="block text-xs font-semibold tracking-wide text-muted">
              AXIS
            </span>
            <span className="block text-sm font-semibold text-foreground">
              Housing
            </span>
          </span>
        </Link>

        <nav className="hidden items-center gap-2 lg:flex">
          <Link
            href="/"
            className={`rounded-full px-3 py-2 text-sm font-semibold ${
              pathname === "/" ? "text-foreground" : "text-muted hover:text-foreground"
            }`}
          >
            Home
          </Link>
          <Dropdown label="Rent with Axis" items={rentItems} active={rentActive} />
          <Dropdown
            label="Partner with Axis"
            items={partnerItems}
            active={partnerActive}
          />
          {portals.map((p) => (
            <Link
              key={p.href}
              href={p.href}
              className={`rounded-full px-3 py-2 text-sm font-semibold ${
                pathname.startsWith(p.prefix)
                  ? "text-foreground"
                  : "text-muted hover:text-foreground"
              }`}
            >
              {p.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-2 lg:flex">
          <Link href="/auth/sign-in">
            <Button type="button" variant="primary">
              Portal
            </Button>
          </Link>
        </div>

        <button
          type="button"
          className="inline-flex rounded-full border border-border px-3 py-2 text-sm font-semibold lg:hidden"
          onClick={() => setMobileOpen((v) => !v)}
        >
          Menu
        </button>
      </div>

      {mobileOpen ? (
        <div className="border-t border-border bg-white px-4 py-4 lg:hidden">
          <div className="space-y-2">
            <Link className="block font-semibold" href="/" onClick={() => setMobileOpen(false)}>
              Home
            </Link>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">
              Rent with Axis
            </p>
            {rentItems.map((it) => (
              <Link
                key={it.href}
                href={it.href}
                className="block py-1 text-sm font-semibold"
                onClick={() => setMobileOpen(false)}
              >
                {it.label}
              </Link>
            ))}
            <p className="pt-2 text-xs font-semibold uppercase tracking-wide text-muted">
              Partner with Axis
            </p>
            {partnerItems.map((it) => (
              <Link
                key={it.href}
                href={it.href}
                className="block py-1 text-sm font-semibold"
                onClick={() => setMobileOpen(false)}
              >
                {it.label}
              </Link>
            ))}
            <p className="pt-2 text-xs font-semibold uppercase tracking-wide text-muted">
              Portals
            </p>
            {portals.map((it) => (
              <Link
                key={it.href}
                href={it.href}
                className="block py-1 text-sm font-semibold"
                onClick={() => setMobileOpen(false)}
              >
                {it.label}
              </Link>
            ))}
            <Link href="/auth/sign-in" onClick={() => setMobileOpen(false)}>
              <Button type="button" className="mt-3 w-full" variant="primary">
                Portal sign in
              </Button>
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
