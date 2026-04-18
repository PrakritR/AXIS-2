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

  const useMinShell =
    definition.kind === "admin" || definition.kind === "resident" || definition.kind === "manager" || definition.kind === "owner";
  const hasSignOut =
    definition.kind === "resident" || definition.kind === "manager" || definition.kind === "owner" || definition.kind === "admin";

  const accent =
    definition.accent === "teal"
      ? "from-teal-600 to-cyan-600"
      : definition.accent === "slate"
        ? "from-slate-800 to-slate-700"
        : "from-[#007aff] to-[#339cff]";

  const adminNavIcons = definition.kind === "admin";

  const desktopAside = useMinShell ? (
    <aside className="hidden w-[15.5rem] shrink-0 border-r border-slate-200/70 bg-slate-50/60 lg:flex lg:flex-col lg:self-stretch">
      <nav className="flex min-h-0 flex-1 flex-col px-2.5 py-5">
        <div className="min-h-0 flex-1 space-y-0.5">
          {definition.sections.map((s) => {
            const href = hrefForSection(definition, s.section);
            const active = activeSection === s.section;
            return (
              <Link
                key={s.section}
                href={href}
                className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? "bg-primary text-white shadow-[0_2px_14px_-2px_rgba(0,122,255,0.45)]"
                    : "text-slate-700 hover:bg-white/70 hover:text-slate-900"
                }`}
              >
                {adminNavIcons ? (
                  <span className="shrink-0 opacity-90" aria-hidden>
                    <AdminPortalNavIcon section={s.section} />
                  </span>
                ) : null}
                <span className="min-w-0">{s.label}</span>
              </Link>
            );
          })}
        </div>
        {hasSignOut ? (
          <div className="mt-auto border-t border-slate-200/70 pt-3">
            <Link
              href="/auth/sign-in"
              className="block rounded-xl px-3 py-2 text-sm font-medium text-slate-600 hover:bg-white/70 hover:text-slate-900"
            >
              Sign out
            </Link>
          </div>
        ) : null}
      </nav>
    </aside>
  ) : (
    <aside className="hidden w-72 shrink-0 border-r border-border bg-white lg:block">
      <div className={`bg-gradient-to-br px-6 py-6 text-white ${accent}`}>
        <p className="text-xs font-semibold uppercase tracking-wide text-white/80">Axis Housing</p>
        <p className="mt-2 text-lg font-semibold">{definition.title}</p>
      </div>
      <nav className="space-y-1 px-3 py-4">
        {definition.sections.map((s) => {
          const href = hrefForSection(definition, s.section);
          const active = activeSection === s.section;
          return (
            <Link
              key={s.section}
              href={href}
              className={`flex items-center justify-between rounded-2xl px-3 py-2 text-sm font-semibold transition ${
                active ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-50"
              }`}
            >
              <span>{s.label}</span>
              <span className="text-xs opacity-70">→</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );

  return (
    <>
      {desktopAside}

      <div className="lg:hidden">
        <div
          className={`flex items-center justify-between border-b px-4 py-3 ${
            useMinShell ? "border-slate-200/90 bg-slate-50/90" : "border-border bg-white"
          }`}
        >
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">{definition.title}</p>
            <p className="text-sm font-semibold text-foreground">Menu</p>
          </div>
          <button
            type="button"
            className="rounded-full border border-border bg-white px-3 py-1 text-sm font-semibold"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? "Close" : "Open"}
          </button>
        </div>
        {open ? (
          <div className={`border-b px-3 py-3 ${useMinShell ? "border-slate-200/90 bg-slate-50" : "border-border bg-white"}`}>
            <div className="space-y-1">
              {definition.sections.map((s) => {
                const active = activeSection === s.section;
                return (
                  <Link
                    key={s.section}
                    href={hrefForSection(definition, s.section)}
                    onClick={() => setOpen(false)}
                    className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium ${
                      useMinShell
                        ? active
                          ? "bg-primary text-white shadow-[0_2px_14px_-2px_rgba(0,122,255,0.45)]"
                          : "text-slate-700 hover:bg-white/80"
                        : "text-slate-800 hover:bg-slate-50"
                    }`}
                  >
                    {adminNavIcons ? (
                      <span className="shrink-0 opacity-90" aria-hidden>
                        <AdminPortalNavIcon section={s.section} />
                      </span>
                    ) : null}
                    <span className="min-w-0">{s.label}</span>
                  </Link>
                );
              })}
            </div>
            {hasSignOut ? (
              <div className={`mt-3 border-t pt-3 ${useMinShell ? "border-slate-200/80" : "border-border"}`}>
                <Link
                  href="/auth/sign-in"
                  onClick={() => setOpen(false)}
                  className="block rounded-xl px-3 py-2 text-sm font-medium text-slate-600 hover:bg-white/80"
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
