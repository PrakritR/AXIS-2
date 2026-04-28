"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
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
  const [open, setOpen] = useState(false);

  const activeSection = useMemo(() => {
    const parts = pathname.split("/").filter(Boolean);
    return parts[1] ?? "dashboard";
  }, [pathname]);

  const hasSignOut =
    definition.kind === "resident" || definition.kind === "manager" || definition.kind === "owner" || definition.kind === "admin";

  const accent =
    definition.accent === "teal"
      ? "bg-teal-700"
      : definition.accent === "slate"
        ? "bg-slate-900"
        : "bg-[#0a84ff]";

  const adminNavIcons = definition.kind === "admin";

  /** Matches `/pro` Axis Pro Portal: gradient header, white rail, slate-900 active row + arrow affordance. */
  const desktopAside = (
    <aside className="hidden w-72 shrink-0 flex-col border-r border-slate-200/80 bg-[#fbfbfd] lg:flex">
      <div className={`px-6 py-6 text-white ${accent}`}>
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/72">Axis Housing</p>
        <p className="mt-2 text-lg font-semibold tracking-[-0.02em] leading-snug">{definition.title}</p>
      </div>
      <nav className="flex min-h-0 flex-1 flex-col px-3 py-4">
        <div className="min-h-0 flex-1 space-y-1">
          {definition.sections.map((s) => {
            const href = hrefForSection(definition, s.section);
            const active = activeSection === s.section;
            return (
              <a
                key={s.section}
                href={href}
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
              </a>
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

      <div className="lg:hidden">
          <div className="flex items-center justify-between border-b border-slate-200/80 bg-[#fbfbfd] px-4 py-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{definition.title}</p>
            <p className="text-sm font-semibold text-slate-900">Menu</p>
          </div>
          <button
            type="button"
            className="min-h-10 rounded-full border border-slate-200 bg-white px-4 py-1 text-sm font-medium text-slate-800 shadow-[0_1px_2px_rgba(15,23,42,0.05)]"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? "Close" : "Open"}
          </button>
        </div>
        {open ? (
          <div className="border-b border-slate-200/80 bg-[#fbfbfd] px-3 py-3">
            <div className="space-y-1">
              {definition.sections.map((s) => {
                const active = activeSection === s.section;
                const href = hrefForSection(definition, s.section);
                return (
                  <a
                    key={s.section}
                    href={href}
                    onClick={() => setOpen(false)}
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
                  </a>
                );
              })}
            </div>
            {hasSignOut ? (
              <div className="mt-3 border-t border-slate-100 pt-3 space-y-0.5">
                <PortalRoleSwitcher currentKind={definition.kind} />
                <Link
                  href="/auth/sign-in"
                  onClick={() => setOpen(false)}
                  className="block rounded-2xl px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-white"
                >
                  Sign out
                </Link>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </>
  );
}
