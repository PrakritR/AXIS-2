import Link from "next/link";
import type { ReactNode } from "react";

export type TabItem = { href: string; label: string; id: string };

export function TabNav({
  items,
  activeId,
}: {
  items: TabItem[];
  activeId: string;
}) {
  return (
    <div className="flex flex-wrap gap-2 rounded-full border border-border bg-slate-50 p-1">
      {items.map((t) => {
        const active = t.id === activeId;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`rounded-full px-3 py-1.5 text-sm font-semibold transition ${
              active
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted hover:bg-white hover:text-foreground"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}

export function PillTabs({
  items,
  activeId,
  onChange,
}: {
  items: { id: string; label: string }[];
  activeId: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2 rounded-full border border-border bg-slate-50 p-1">
      {items.map((t) => {
        const active = t.id === activeId;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            className={`rounded-full px-3 py-1.5 text-sm font-semibold transition ${
              active
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted hover:bg-white hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

export function SectionTabs({
  title,
  tabs,
  activeId,
  actions,
}: {
  title: string;
  tabs: TabItem[];
  activeId: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {title}
        </h1>
        <div className="mt-3">
          <TabNav items={tabs} activeId={activeId} />
        </div>
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}
