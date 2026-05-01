"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { MouseEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { AdminPortalNavIcon } from "@/components/portal/admin-portal-nav-icons";
import { PortalRoleSwitcher } from "@/components/portal/portal-role-switcher";
import type { PortalDefinition } from "@/lib/portal-types";

function hrefForSection(def: PortalDefinition, section: string) {
  const meta = def.sections.find((s) => s.section === section);
  if (!meta) return def.basePath;
  if (!meta.tabs.length) return `${def.basePath}/${section}`;
  return `${def.basePath}/${section}/${meta.tabs[0].id}`;
}

export function PortalSidebar({ definition }: { definition: PortalDefinition }) {
  const pathname = usePathname();
  const [accountOpen, setAccountOpen] = useState(false);
  const navItems = useMemo(
    () =>
      definition.sections.map((section) => ({
        section: section.section,
        label: section.label,
        href: hrefForSection(definition, section.section),
      })),
    [definition],
  );

  const activeSection = useMemo(() => {
    const parts = pathname.split("/").filter(Boolean);
    return parts[1] ?? "dashboard";
  }, [pathname]);

  const hasSignOut =
    definition.kind === "resident" ||
    definition.kind === "manager" ||
    definition.kind === "owner" ||
    definition.kind === "admin" ||
    definition.kind === "pro";

  const accentBar =
    definition.accent === "teal"
      ? "bg-teal-600"
      : definition.accent === "slate"
        ? "bg-slate-900"
        : "bg-[#0a84ff]";

  const accentHeader =
    definition.accent === "teal"
      ? "bg-teal-700"
      : definition.accent === "slate"
        ? "bg-slate-900"
        : "bg-[#0a84ff]";

  const adminNavIcons = definition.kind === "admin";

  const leavePaymentsSection = (event: MouseEvent<HTMLAnchorElement>, targetSection: string, href: string) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    if (activeSection !== "payments" || targetSection === "payments") return;
    event.preventDefault();
    window.location.assign(href);
  };

  useEffect(() => {
    if (!accountOpen || typeof document === "undefined") return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [accountOpen]);

  const desktopAside = (
    <aside className="relative z-40 hidden h-full min-h-0 w-72 shrink-0 self-stretch flex-col overflow-hidden border-r border-slate-200/80 bg-[#fbfbfd] lg:flex">
      <div className={`px-6 py-6 text-white ${accentHeader}`}>
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/72">Axis Housing</p>
        <p className="mt-2 text-lg font-semibold tracking-[-0.02em] leading-snug">{definition.title}</p>
      </div>
      <nav className="flex min-h-0 flex-1 flex-col overflow-hidden px-3 py-4">
        <div className="min-h-0 flex-1 overflow-y-auto space-y-1">
          {navItems.map((s) => {
            const active = activeSection === s.section;
            return (
              <Link
                key={s.section}
                href={s.href}
                prefetch
                onClick={(event) => leavePaymentsSection(event, s.section, s.href)}
                className={`flex min-h-10 items-center gap-2.5 rounded-2xl px-3 py-2.5 text-sm font-medium transition ${
                  active ? "bg-white text-slate-950 shadow-[0_10px_26px_-22px_rgba(15,23,42,0.35)]" : "text-slate-600 hover:bg-white hover:text-slate-950"
                }`}
              >
                {adminNavIcons ? (
                  <span className="shrink-0 opacity-90" aria-hidden>
                    <AdminPortalNavIcon section={s.section} />
                  </span>
                ) : null}
                <span className="min-w-0 flex-1">{s.label}</span>
                <span className={`text-xs tabular-nums ${active ? "text-slate-400" : "text-slate-400"}`} aria-hidden>
                  →
                </span>
              </Link>
            );
          })}
        </div>
        {hasSignOut ? (
          <div className="mt-auto border-t border-slate-100 pt-3 space-y-0.5">
            <PortalRoleSwitcher currentKind={definition.kind} />
            <Link
              href="/auth/sign-in"
              className="block rounded-2xl px-3 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-white hover:text-slate-900"
            >
              Sign out
            </Link>
          </div>
        ) : null}
      </nav>
    </aside>
  );

  return (
    <>
      {desktopAside}

      {/* Mobile: persistent portal nav (marketing navbar stays above via layout). */}
      <div className="shrink-0 lg:hidden">
        <div className="border-b border-slate-200/80 bg-[#fbfbfd] lg:hidden">
          <div className="flex items-center gap-2.5 px-3 pt-2 sm:px-4">
            <div className={`h-11 w-1.5 shrink-0 rounded-full ${accentBar}`} aria-hidden />
            <div className="min-w-0 flex-1 py-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Axis Housing</p>
              <p className="truncate text-sm font-semibold leading-snug text-slate-900">{definition.title}</p>
            </div>
            {hasSignOut ? (
              <button
                type="button"
                className="min-h-11 shrink-0 rounded-full border border-slate-200 bg-white px-3.5 text-sm font-semibold text-slate-800 shadow-[0_1px_2px_rgba(15,23,42,0.05)]"
                onClick={() => setAccountOpen(true)}
              >
                Account
              </button>
            ) : null}
          </div>
          <div className="mt-1.5 flex gap-1.5 overflow-x-auto px-3 pb-2 pt-0.5 [-ms-overflow-style:none] [scrollbar-width:none] sm:px-4 [&::-webkit-scrollbar]:hidden">
            {navItems.map((s) => {
              const active = activeSection === s.section;
              return (
                <Link
                  key={s.section}
                  href={s.href}
                  prefetch
                  onClick={(event) => leavePaymentsSection(event, s.section, s.href)}
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold whitespace-nowrap transition sm:text-[13px] ${
                    active
                      ? "bg-white text-slate-950 shadow-[0_6px_20px_-14px_rgba(15,23,42,0.45)] ring-1 ring-slate-200/90"
                      : "bg-slate-200/50 text-slate-700 ring-1 ring-transparent hover:bg-slate-200/70"
                  }`}
                >
                  {adminNavIcons ? (
                    <span className="shrink-0 opacity-90" aria-hidden>
                      <AdminPortalNavIcon section={s.section} />
                    </span>
                  ) : null}
                  {s.label}
                </Link>
              );
            })}
          </div>
        </div>

        {accountOpen && hasSignOut ? (
          <>
            <button
              type="button"
              className="fixed inset-0 z-[90] bg-slate-950/45 backdrop-blur-[1px] lg:hidden"
              aria-label="Close account menu"
              onClick={() => setAccountOpen(false)}
            />
            <div className="fixed right-0 bottom-0 left-0 z-[100] max-h-[min(70vh,28rem)] overflow-y-auto rounded-t-2xl border border-slate-200/90 bg-[#fbfbfd] px-4 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom,0px))] shadow-[0_-20px_48px_-20px_rgba(15,23,42,0.35)] lg:hidden">
              <div className="mx-auto mb-3 h-1 w-10 shrink-0 rounded-full bg-slate-300/90" aria-hidden />
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Account</p>
              <div className="mt-3 space-y-1 border-t border-slate-100 pt-3">
                <PortalRoleSwitcher currentKind={definition.kind} />
                <Link
                  href="/auth/sign-in"
                  className="block rounded-2xl px-3 py-3 text-center text-sm font-semibold text-slate-700 ring-1 ring-slate-200/80 transition hover:bg-white"
                  onClick={() => setAccountOpen(false)}
                >
                  Sign out
                </Link>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </>
  );
}
