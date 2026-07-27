"use client";

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import { useIsClient } from "@/hooks/use-is-client";
import {
  FIELD_SELECT_CHEVRON_CLASS,
  FIELD_SELECT_LABEL_CLASS,
  FIELD_SELECT_MENU_CLASS,
  FIELD_SELECT_MENU_OPTION_CLASS,
  FIELD_SELECT_TRIGGER_CLASS,
  FIELD_SELECT_TRIGGER_COMPACT_CLASS,
  FIELD_SELECT_TRIGGER_INLINE_CLASS,
  partitionFieldSelectClasses,
} from "@/components/ui/field-select-styles";

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

function triggerClassForVariant(variant: "field" | "pill", hideLabel: boolean, extra?: string) {
  const base =
    variant === "pill"
      ? FIELD_SELECT_TRIGGER_COMPACT_CLASS
      : hideLabel
        ? FIELD_SELECT_TRIGGER_INLINE_CLASS
        : FIELD_SELECT_TRIGGER_CLASS;
  return extra ? `${base} ${extra}`.trim() : base;
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
  /** When set and `selected` is non-empty, shown on the trigger instead of summarizing selected labels. */
  selectionTriggerLabel,
  dataAttr,
  className,
  labelClassName,
  hideLabel = false,
  /** Toolbar compact width — same visual tokens as form fields. */
  variant = "field",
  menuFooter,
}: {
  label: string;
  options?: CheckboxMultiSelectOption[];
  groups?: CheckboxMultiSelectGroup[];
  selected: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  emptyMenuText?: string;
  emptyLabel?: string;
  selectionTriggerLabel?: string;
  dataAttr?: string;
  className?: string;
  labelClassName?: string;
  hideLabel?: boolean;
  variant?: "field" | "pill";
  menuFooter?: React.ReactNode;
}) {
  const listId = useId();
  const isClient = useIsClient();
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [menuRect, setMenuRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const pill = variant === "pill";
  const { wrapperClassName, triggerClassName } = partitionFieldSelectClasses(className);

  const flatOptions = useMemo(() => {
    if (groups?.length) return groups.flatMap((g) => g.options);
    return options ?? [];
  }, [groups, options]);

  const updateMenuRect = () => {
    const button = buttonRef.current;
    if (!button) return;
    const rect = button.getBoundingClientRect();
    setMenuRect({
      top: rect.bottom + 4,
      left: rect.left,
      width: rect.width,
    });
  };

  useLayoutEffect(() => {
    if (!open) {
      setMenuRect(null);
      return;
    }
    updateMenuRect();
    window.addEventListener("resize", updateMenuRect);
    window.addEventListener("scroll", updateMenuRect, true);
    return () => {
      window.removeEventListener("resize", updateMenuRect);
      window.removeEventListener("scroll", updateMenuRect, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (wrapRef.current?.contains(target)) return;
      if (document.getElementById(listId)?.contains(target)) return;
      setOpen(false);
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
  }, [listId, open]);

  const toggle = (value: string) => {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  };

  const buttonLabel =
    selected.length > 0 && selectionTriggerLabel
      ? selectionTriggerLabel
      : summarizeSelection(selected, flatOptions, emptyLabel);

  const menu =
    open && menuRect && isClient ? (
      <div
        id={listId}
        role="listbox"
        aria-multiselectable="true"
        className={`fixed z-[10000] ${FIELD_SELECT_MENU_CLASS} ${pill ? "w-[min(18rem,calc(100vw-2rem))]" : ""}`}
        style={{
          top: menuRect.top,
          left: menuRect.left,
          width: pill ? undefined : menuRect.width,
          backgroundColor: "#ffffff",
        }}
      >
        {flatOptions.length === 0 ? (
          <p className="field-dropdown-menu-option px-3 py-2 text-sm text-muted">{emptyMenuText}</p>
        ) : groups?.length ? (
          groups.map((group) => (
            <div key={group.label}>
              <p className="field-dropdown-menu-option sticky top-0 z-[1] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-muted">
                {group.label}
              </p>
              {group.options.map((opt) => {
                const checked = selected.includes(opt.value);
                return (
                  <label
                    key={opt.value}
                    role="option"
                    aria-selected={checked}
                    className={`flex cursor-pointer items-start gap-2.5 px-3 py-2 text-sm ${FIELD_SELECT_MENU_OPTION_CLASS}`}
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
                className={`flex cursor-pointer items-start gap-2.5 px-3 py-2 text-sm ${FIELD_SELECT_MENU_OPTION_CLASS}`}
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
        {menuFooter ? (
          <div className={`border-t border-border ${FIELD_SELECT_MENU_OPTION_CLASS}`}>{menuFooter}</div>
        ) : null}
      </div>
    ) : null;

  return (
    <div ref={wrapRef} className={`relative ${pill ? "w-auto shrink-0" : "w-full"} ${wrapperClassName}`.trim()}>
      {!hideLabel && !pill ? (
        <label className={labelClassName ?? FIELD_SELECT_LABEL_CLASS}>{label}</label>
      ) : null}
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        data-attr={dataAttr}
        className={triggerClassForVariant(variant, pill || hideLabel, triggerClassName)}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={`min-w-0 truncate ${selected.length === 0 ? "text-muted" : ""}`}>{buttonLabel}</span>
        <ChevronDown className={FIELD_SELECT_CHEVRON_CLASS} aria-hidden />
      </button>

      {menu ? createPortal(menu, document.body) : null}
    </div>
  );
}

/** Single-select field dropdown — same trigger/menu styling as CheckboxMultiSelect. */
export function FieldSingleSelect({
  label,
  options,
  value,
  onChange,
  disabled,
  placeholder = "Select…",
  dataAttr,
  className,
  wrapperClassName: wrapperClassNameProp,
  triggerClassName: triggerClassNameProp,
  labelClassName,
  hideLabel = false,
  variant = "field",
}: {
  label: string;
  options: CheckboxMultiSelectOption[];
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  placeholder?: string;
  dataAttr?: string;
  /** @deprecated Prefer wrapperClassName + triggerClassName */
  className?: string;
  wrapperClassName?: string;
  triggerClassName?: string;
  labelClassName?: string;
  hideLabel?: boolean;
  variant?: "field" | "pill";
}) {
  const listId = useId();
  const isClient = useIsClient();
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [menuRect, setMenuRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const pill = variant === "pill";
  const partitioned = partitionFieldSelectClasses(className);
  const wrapperClassName = wrapperClassNameProp ?? partitioned.wrapperClassName;
  const triggerClassName = triggerClassNameProp ?? partitioned.triggerClassName;

  const buttonLabel = options.find((o) => o.value === value)?.label ?? placeholder;

  const updateMenuRect = () => {
    const button = buttonRef.current;
    if (!button) return;
    const rect = button.getBoundingClientRect();
    setMenuRect({
      top: rect.bottom + 4,
      left: rect.left,
      width: rect.width,
    });
  };

  useLayoutEffect(() => {
    if (!open) {
      setMenuRect(null);
      return;
    }
    updateMenuRect();
    window.addEventListener("resize", updateMenuRect);
    window.addEventListener("scroll", updateMenuRect, true);
    return () => {
      window.removeEventListener("resize", updateMenuRect);
      window.removeEventListener("scroll", updateMenuRect, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (wrapRef.current?.contains(target)) return;
      if (document.getElementById(listId)?.contains(target)) return;
      setOpen(false);
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
  }, [listId, open]);

  const menu =
    open && menuRect && isClient ? (
      <div
        id={listId}
        role="listbox"
        // z-index must clear modal overlays (the listing wizard's is z-[9999]); this
        // menu is portaled to document.body as a sibling of the modal, so a lower
        // value renders it *behind* the modal and every option click lands on the
        // modal instead — the dropdowns then silently refuse selections.
        className={`fixed z-[10000] ${FIELD_SELECT_MENU_CLASS} ${pill ? "w-[min(18rem,calc(100vw-2rem))]" : ""}`}
        style={{
          top: menuRect.top,
          left: menuRect.left,
          width: pill ? undefined : menuRect.width,
          backgroundColor: "#ffffff",
        }}
      >
        {options.map((opt) => {
          const active = opt.value === value;
          return (
            <button
              key={opt.value}
              type="button"
              role="option"
              aria-selected={active}
              className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm ${FIELD_SELECT_MENU_OPTION_CLASS} ${
                active ? "text-foreground" : "text-foreground"
              }`}
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
            >
              <span className="flex h-4 w-4 shrink-0 items-center justify-center text-primary" aria-hidden>
                {active ? "✓" : ""}
              </span>
              <span className="leading-snug">{opt.label}</span>
            </button>
          );
        })}
      </div>
    ) : null;

  return (
    <div ref={wrapRef} className={`relative ${pill ? "w-auto shrink-0" : "w-full"} ${wrapperClassName}`.trim()}>
      {!hideLabel && !pill ? (
        <label className={labelClassName ?? FIELD_SELECT_LABEL_CLASS}>{label}</label>
      ) : null}
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        data-attr={dataAttr}
        className={triggerClassForVariant(variant, hideLabel || pill, triggerClassName)}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={`min-w-0 truncate ${value ? "" : "text-muted"}`}>{buttonLabel}</span>
        <ChevronDown className={FIELD_SELECT_CHEVRON_CLASS} aria-hidden />
      </button>

      {menu ? createPortal(menu, document.body) : null}
    </div>
  );
}
