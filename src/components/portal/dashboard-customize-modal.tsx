"use client";

import { Modal } from "@/components/ui/modal";
import {
  MANAGER_DASHBOARD_SECTIONS,
  type DashboardSectionId,
  type DashboardVisibility,
} from "@/lib/dashboard-preferences";

/** Accessible on/off switch for a single dashboard section. */
function SectionToggle({
  label,
  description,
  checked,
  onChange,
  dataAttr,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  dataAttr?: string;
}) {
  return (
    <li className="flex items-start justify-between gap-3 rounded-xl border border-border bg-card px-3.5 py-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground">{label}</p>
        <p className="mt-0.5 text-xs text-muted">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={`${checked ? "Hide" : "Show"} ${label}`}
        data-attr={dataAttr}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 ${
          checked ? "bg-primary" : "bg-[var(--secondary)] border border-border"
        }`}
      >
        <span
          aria-hidden
          className={`inline-block size-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
            checked ? "translate-x-[1.375rem]" : "translate-x-0.5"
          }`}
        />
      </button>
    </li>
  );
}

/**
 * Per-user dashboard customization. A simple toggle list of the available
 * sections — no drag-and-drop layout engine. Changes persist immediately
 * (per user) via the visibility store, so the dashboard behind the modal
 * updates live as toggles flip.
 */
export function DashboardCustomizeModal({
  open,
  onClose,
  visibility,
  onToggle,
  onReset,
}: {
  open: boolean;
  onClose: () => void;
  visibility: DashboardVisibility;
  onToggle: (id: DashboardSectionId, visible: boolean) => void;
  onReset: () => void;
}) {
  const visibleCount = MANAGER_DASHBOARD_SECTIONS.filter((s) => visibility[s.id]).length;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Customize dashboard"
      panelClassName="max-w-md"
      footer={
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onReset}
            data-attr="dashboard-customize-reset"
            className="text-xs font-semibold text-muted hover:text-foreground"
          >
            Reset to defaults
          </button>
          <button
            type="button"
            onClick={onClose}
            data-attr="dashboard-customize-done"
            className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            Done
          </button>
        </div>
      }
    >
      <p className="text-xs text-muted">
        Choose which sections appear on your dashboard. {visibleCount} of{" "}
        {MANAGER_DASHBOARD_SECTIONS.length} shown. The stat row at the top always stays.
      </p>
      <ul className="mt-3 space-y-2">
        {MANAGER_DASHBOARD_SECTIONS.map((section) => (
          <SectionToggle
            key={section.id}
            label={section.label}
            description={section.description}
            checked={visibility[section.id]}
            onChange={(next) => onToggle(section.id, next)}
            dataAttr={`dashboard-customize-toggle-${section.id}`}
          />
        ))}
      </ul>
    </Modal>
  );
}
