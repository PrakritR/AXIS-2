"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

export type CheckboxMultiSelectOption = { value: string; label: string };
export type CheckboxMultiSelectGroup = { label: string; options: CheckboxMultiSelectOption[] };

function summarizeSelection(
  selected: string[],
  options: CheckboxMultiSelectOption[],
  emptyLabel = "None selected",
): string {
  if (selected.length === 0) return emptyLabel;
  if (selected.length === 1) {
    return options.find((o) => o.value === selected[0])?.label ?? "1 selected";
  }
  if (selected.length === 2) {
    const labels = selected
      .map((v) => options.find((o) => o.value === v)?.label)
      .filter(Boolean) as string[];
    if (labels.length === 2) return labels.join(", ");
  }
  return `${selected.length} selected`;
}

/** Compact multi-select dropdown with checkboxes (opaque menu). */
export function CheckboxMultiSelect({
  label,
  options,
  groups,
  selected,
  onChange,
  disabled,
  emptyMenuText = "No options",
  emptyLabel = "None selected",
  dataAttr,
  className,
  /** Toolbar pill like Services property filter — sits beside TabNav. */
  variant = "field",
}: {
  label: string;
  options?: CheckboxMultiSelectOption[];
  groups?: CheckboxMultiSelectGroup[];
  selected: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  emptyMenuText?: string;
  emptyLabel?: string;
  dataAttr?: string;
  className?: string;
  variant?: "field" | "pill";
}) {
  const listId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const pill = variant === "pill";

  const flatOptions = useMemo(() => {
    if (groups?.length) return groups.flatMap((g) => g.options);
    return options ?? [];
  }, [groups, options]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggle = (value: string) => {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  };

  const buttonLabel = summarizeSelection(selected, flatOptions, emptyLabel);

  return (
    <div ref={wrapRef} className={`relative ${pill ? "w-auto shrink-0" : "w-full"} ${className ?? ""}`}>
      {pill ? null : (
        <label className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted">{label}</label>
      )}
      <button
        type="button"
        disabled={disabled}
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        data-attr={dataAttr}
        className={
          pill
            ? "flex h-10 min-w-[9.5rem] max-w-[16rem] items-center justify-between gap-2 rounded-full border border-border bg-card px-3.5 text-left text-sm text-foreground outline-none transition hover:bg-accent/40 focus:border-primary focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            : "mt-1 flex h-10 w-full items-center justify-between gap-2 rounded-lg border border-border bg-[var(--background-solid,#0a0e18)] px-3 text-left text-sm text-foreground outline-none transition hover:brightness-110 focus:border-primary disabled:cursor-not-allowed disabled:opacity-50"
        }
        onClick={() => setOpen((v) => !v)}
      >
        <span className={`min-w-0 truncate ${selected.length === 0 ? "text-muted" : ""}`}>{buttonLabel}</span>
        <svg className="h-4 w-4 shrink-0 text-muted" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {open ? (
        <div
          id={listId}
          role="listbox"
          aria-multiselectable="true"
          className={`absolute z-50 mt-1 max-h-56 overflow-auto rounded-lg border border-border py-1 shadow-2xl ${pill ? "left-0 w-[min(18rem,calc(100vw-2rem))]" : "w-full"}`}
          style={{ backgroundColor: "var(--background-solid, #0a0e18)" }}
        >
          {flatOptions.length === 0 ? (
            <p className="px-3 py-2 text-sm text-muted">{emptyMenuText}</p>
          ) : groups?.length ? (
            groups.map((group) => (
              <div key={group.label}>
                <p className="px-3 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-muted">{group.label}</p>
                {group.options.map((opt) => {
                  const checked = selected.includes(opt.value);
                  return (
                    <label
                      key={opt.value}
                      role="option"
                      aria-selected={checked}
                      className="flex cursor-pointer items-start gap-2.5 px-3 py-1.5 text-sm hover:brightness-125"
                      style={{ backgroundColor: "var(--background-solid, #0a0e18)" }}
                    >
                      <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4 shrink-0 rounded border-border accent-primary"
                        checked={checked}
                        onChange={() => toggle(opt.value)}
                      />
                      <span className="leading-snug text-foreground">{opt.label}</span>
                    </label>
                  );
                })}
              </div>
            ))
          ) : (
            (options ?? []).map((opt) => {
              const checked = selected.includes(opt.value);
              return (
                <label
                  key={opt.value}
                  role="option"
                  aria-selected={checked}
                  className="flex cursor-pointer items-start gap-2.5 px-3 py-1.5 text-sm hover:brightness-125"
                  style={{ backgroundColor: "var(--background-solid, #0a0e18)" }}
                >
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-border accent-primary"
                    checked={checked}
                    onChange={() => toggle(opt.value)}
                  />
                  <span className="leading-snug text-foreground">{opt.label}</span>
                </label>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
}
