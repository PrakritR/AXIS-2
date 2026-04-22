"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import { AdminPortalNavIcon } from "@/components/portal/admin-portal-nav-icons";
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
      ? "from-teal-600 to-cyan-600"
      : definition.accent === "slate"
        ? "from-slate-800 to-slate-700"
        : "from-[#007aff] to-[#339cff]";

  const adminNavIcons = definition.kind === "admin";

  /** Matches `/pro` Axis Pro Portal: gradient header, white rail, slate-900 active row + arrow affordance. */
  const desktopAside = (
    <aside className="hidden w-72 shrink-0 flex-col border-r border-slate-200/90 bg-white lg:flex">
      <div className={`bg-gradient-to-br px-6 py-6 text-white ${accent}`}>
        <p className="text-xs font-semibold uppercase tracking-wide text-white/80">Axis Housing</p>
        <p className="mt-2 text-lg font-semibold leading-snug">{definition.title}</p>
      </div>
      <nav className="flex min-h-0 flex-1 flex-col px-3 py-4">
        <div className="min-h-0 flex-1 space-y-1">
          {definition.sections.map((s) => {
            const href = hrefForSection(definition, s.section);
            const active = activeSection === s.section;
            return (
              <Link
                key={s.section}
                href={href}
                className={`flex items-center gap-2.5 rounded-2xl px-3 py-2 text-sm font-semibold transition ${
                  active ? "bg-slate-900 text-white shadow-sm" : "text-slate-700 hover:bg-slate-50"
                }`}
              >
                {adminNavIcons ? (
                  <span className="shrink-0 opacity-90" aria-hidden>
                    <AdminPortalNavIcon section={s.section} />
                  </span>
                ) : null}
                <span className="min-w-0 flex-1">{s.label}</span>
                <span className={`text-xs tabular-nums ${active ? "text-white/70" : "text-slate-400"}`} aria-hidden>
                  →
                </span>
              </Link>
            );
          })}
        </div>
        {hasSignOut ? (
          <div className="mt-auto border-t border-slate-100 pt-3">
            <Link
              href="/auth/sign-in"
              className="block rounded-2xl px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
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
        <div className="flex items-center justify-between border-b border-slate-200/90 bg-white px-4 py-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{definition.title}</p>
            <p className="text-sm font-semibold text-slate-900">Menu</p>
          </div>
          <button
            type="button"
            className="rounded-full border border-slate-200 bg-white px-3 py-1 text-sm font-semibold text-slate-800 shadow-sm"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? "Close" : "Open"}
          </button>
        </div>
        {open ? (
          <div className="border-b border-slate-200/90 bg-white px-3 py-3">
            <div className="space-y-1">
              {definition.sections.map((s) => {
                const active = activeSection === s.section;
                return (
                  <Link
                    key={s.section}
                    href={hrefForSection(definition, s.section)}
                    onClick={() => setOpen(false)}
                    className={`flex items-center gap-2.5 rounded-2xl px-3 py-2 text-sm font-semibold transition ${
                      active ? "bg-slate-900 text-white shadow-sm" : "text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    {adminNavIcons ? (
                      <span className="shrink-0 opacity-90" aria-hidden>
                        <AdminPortalNavIcon section={s.section} />
                      </span>
                    ) : null}
                    <span className="min-w-0 flex-1">{s.label}</span>
                  </Link>
                );
              })}
            </div>
            {hasSignOut ? (
              <div className="mt-3 border-t border-slate-100 pt-3">
                <Link
                  href="/auth/sign-in"
                  onClick={() => setOpen(false)}
                  className="block rounded-2xl px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
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
