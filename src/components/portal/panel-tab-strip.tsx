"use client";

/** Pill tabs for filtering a portal panel (demo — local state). */
export function PortalPanelTabs({
  ariaLabel,
  tabs,
  active,
  onChange,
}: {
  ariaLabel: string;
  tabs: { id: string; label: string }[];
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label={ariaLabel}>
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={active === t.id}
          onClick={() => onChange(t.id)}
          className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
            active === t.id ? "bg-primary text-white shadow-sm" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
