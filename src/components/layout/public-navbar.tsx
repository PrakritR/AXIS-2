"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";

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
        className={`relative inline-flex items-center gap-1.5 pb-2 text-sm font-semibold transition ${
          active ? "text-slate-900" : "text-slate-700 hover:text-slate-900"
        }`}
      >
        {label}
        <span className="text-[10px] font-normal text-slate-500">▾</span>
        {active ? (
          <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-[#2563eb]" />
        ) : null}
      </button>
      {open ? (
        <div className="absolute left-0 top-full z-50 pt-2">
          <div className="min-w-[220px] rounded-2xl border border-slate-200/90 bg-white p-2 shadow-[0_20px_50px_-12px_rgba(15,23,42,0.2)]">
            {items.map((it) => (
              <Link
                key={it.href}
                href={it.href}
                className="block rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50"
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

  const rentActive = useMemo(
    () => pathname === "/" || pathname.startsWith("/rent"),
    [pathname],
  );
  const partnerActive = useMemo(() => pathname.startsWith("/partner"), [pathname]);

  const rentItems: Item[] = [
    { label: "Schedule tour", href: "/rent/tours" },
    { label: "Apply", href: "/rent/apply" },
    { label: "Property listings", href: "/rent/listings" },
    { label: "Listings hub", href: "/rent" },
    { label: "FAQ", href: "/rent/faq" },
    { label: "Contact", href: "/rent/contact" },
  ];

  const partnerItems: Item[] = [
    { label: "Pricing", href: "/partner/pricing" },
    { label: "Contact", href: "/partner/contact" },
    { label: "Partner overview", href: "/partner" },
  ];

  return (
    <div className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4">
        <Link href="/" className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#2563eb] text-sm font-black tracking-tight text-white">
            AX
          </span>
          <span className="leading-[1.1]">
            <span className="block text-[11px] font-bold uppercase tracking-[0.22em] text-slate-900">
              AXIS
            </span>
            <span className="block text-[11px] font-bold uppercase tracking-[0.22em] text-slate-900">
              SEATTLE
            </span>
          </span>
        </Link>

        <nav className="hidden items-center gap-10 lg:flex">
          <Dropdown label="Rent with Axis" items={rentItems} active={rentActive} />
          <Dropdown label="Partner with Axis" items={partnerItems} active={partnerActive} />
        </nav>

        <div className="hidden lg:block">
          <Link
            href="/auth/sign-in"
            className="inline-flex items-center justify-center rounded-full bg-slate-900 px-7 py-2.5 text-sm font-semibold text-white shadow-[0_0_24px_rgba(37,99,235,0.45)] transition hover:bg-slate-800"
          >
            Portal
          </Link>
        </div>

        <button
          type="button"
          className="inline-flex rounded-full border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-800 lg:hidden"
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
            {rentItems.map((it) => (
              <Link
                key={it.href}
                href={it.href}
                className="block py-1 text-sm font-semibold text-slate-800"
                onClick={() => setMobileOpen(false)}
              >
                {it.label}
              </Link>
            ))}
            <p className="pt-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">Partner with Axis</p>
            {partnerItems.map((it) => (
              <Link
                key={it.href}
                href={it.href}
                className="block py-1 text-sm font-semibold text-slate-800"
                onClick={() => setMobileOpen(false)}
              >
                {it.label}
              </Link>
            ))}
            <Link href="/auth/sign-in" onClick={() => setMobileOpen(false)}>
              <span className="mt-3 flex w-full items-center justify-center rounded-full bg-slate-900 py-3 text-sm font-semibold text-white shadow-[0_0_20px_rgba(37,99,235,0.4)]">
                Portal
              </span>
            </Link>
            <div className="border-t border-slate-100 pt-3 text-xs text-slate-500">
              <Link href="/manager/dashboard" className="mr-3 font-semibold text-[#2563eb]" onClick={() => setMobileOpen(false)}>
                Manager
              </Link>
              <Link href="/resident/dashboard" className="mr-3 font-semibold text-[#2563eb]" onClick={() => setMobileOpen(false)}>
                Resident
              </Link>
              <Link href="/admin/dashboard" className="font-semibold text-[#2563eb]" onClick={() => setMobileOpen(false)}>
                Admin
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
