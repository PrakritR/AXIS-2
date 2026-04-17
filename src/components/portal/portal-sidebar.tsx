"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
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
    // /manager/properties/all -> ['manager','properties','all']
    return parts[1] ?? "dashboard";
  }, [pathname]);

  const accent =
    definition.accent === "teal"
      ? "from-teal-600 to-cyan-600"
      : definition.accent === "slate"
        ? "from-slate-800 to-slate-700"
        : "from-blue-600 to-indigo-600";

  return (
    <>
      <aside className="hidden w-72 shrink-0 border-r border-border bg-white lg:block">
        <div className={`bg-gradient-to-br px-6 py-6 text-white ${accent}`}>
          <p className="text-xs font-semibold uppercase tracking-wide text-white/80">
            Axis Housing
          </p>
          <p className="mt-2 text-lg font-semibold">{definition.title}</p>
          <Link
            href="/"
            className="mt-3 inline-flex text-sm font-semibold text-white/90 underline-offset-4 hover:underline"
          >
            ← Back to marketing site
          </Link>
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
                  active
                    ? "bg-slate-900 text-white"
                    : "text-slate-700 hover:bg-slate-50"
                }`}
              >
                <span>{s.label}</span>
                <span className="text-xs opacity-70">→</span>
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Mobile drawer */}
      <div className="lg:hidden">
        <div className="flex items-center justify-between border-b border-border bg-white px-4 py-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">
              {definition.title}
            </p>
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
          <div className="border-b border-border bg-white px-3 py-3">
            <div className="space-y-1">
              {definition.sections.map((s) => (
                <Link
                  key={s.section}
                  href={hrefForSection(definition, s.section)}
                  onClick={() => setOpen(false)}
                  className="block rounded-2xl px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
                >
                  {s.label}
                </Link>
              ))}
              <Link
                href="/"
                onClick={() => setOpen(false)}
                className="block rounded-2xl px-3 py-2 text-sm font-semibold text-primary hover:bg-accent"
              >
                ← Marketing site
              </Link>
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}
