"use client";

import { ChevronDown } from "lucide-react";
import { createContext, useContext, useId, useState, type ReactNode } from "react";
import { FIELD_SELECT_MENU_OPTION_CLASS } from "@/components/ui/field-select-styles";
import { cn } from "@/lib/utils";

export const FILTER_FIELD_LABEL_CLASS = "mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted";

export const FILTER_LIST_VISIBLE_ROWS = 5;
const FILTER_LIST_ROW_PX = 40;
export const FILTER_LIST_MAX_HEIGHT_PX = FILTER_LIST_VISIBLE_ROWS * FILTER_LIST_ROW_PX;

/** Fixed portal filter shell — same width/height for modal, sheet, and desktop dropdown. */
export const PORTAL_FILTER_PANEL_WIDTH_CLASS = "w-[min(22rem,calc(100vw-2rem))]";
export const PORTAL_FILTER_PANEL_HEIGHT_CLASS = "h-[28rem]";
export const PORTAL_FILTER_PANEL_SIZE_CLASS = `${PORTAL_FILTER_PANEL_WIDTH_CLASS} ${PORTAL_FILTER_PANEL_HEIGHT_CLASS}`;
/** Single-field filter sheets — size to content instead of a tall empty modal. */
export const PORTAL_FILTER_PANEL_COMPACT_CLASS = `${PORTAL_FILTER_PANEL_WIDTH_CLASS} h-auto max-h-[min(70vh,20rem)]`;
export const PORTAL_FILTER_BODY_CLASS =
  "flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain p-4 [-webkit-overflow-scrolling:touch]";

const FILTER_TRIGGER_CLASS =
  "flex min-h-[44px] w-full items-center justify-between gap-2 rounded-2xl border border-border bg-auth-input-bg px-4 py-2.5 text-left text-sm text-foreground shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-[border-color,background-color,box-shadow] duration-200 hover:border-primary/25 focus-visible:border-primary/40 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/10";

type Option = { value: string; label: string };

type FilterFieldsAccordionContextValue = {
  openId: string | null;
  setOpenId: (id: string | null) => void;
};

const FilterFieldsAccordionContext = createContext<FilterFieldsAccordionContextValue | null>(null);

export function useFilterAccordionClose(): () => void {
  const accordion = useContext(FilterFieldsAccordionContext);
  return () => accordion?.setOpenId(null);
}

/** One open dropdown at a time — Excel-style filter sheet behavior. */
export function FilterFieldsAccordion({ children }: { children: ReactNode }) {
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <FilterFieldsAccordionContext.Provider value={{ openId, setOpenId }}>
      <div className="grid gap-4">{children}</div>
    </FilterFieldsAccordionContext.Provider>
  );
}

export function filterMultiSelectSummary(
  selected: string[],
  options: Option[],
  allLabel = "All",
): string {
  if (selected.length === 0) return allLabel;
  const labels = selected
    .map((value) => options.find((o) => o.value === value)?.label ?? value)
    .filter(Boolean);
  const joined = labels.join(", ");
  if (joined.length > 96) return `${joined.slice(0, 93)}…`;
  return joined;
}

export function filterSingleSelectSummary(value: string, options: Option[], allLabel = "All"): string {
  if (!value) return allLabel;
  return options.find((o) => o.value === value)?.label ?? value;
}

/** Excel-style in-cell dropdown: one text box; click to reveal inline options. */
export function FilterCollapsibleSection({
  label,
  summary,
  children,
  dataAttr,
  sectionId,
  defaultOpen = false,
  open: controlledOpen,
  onOpenChange,
  empty = false,
}: {
  label: string;
  summary: string;
  children: ReactNode;
  dataAttr?: string;
  /** When inside {@link FilterFieldsAccordion}, only one section opens at a time. */
  sectionId?: string;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** When true, summary uses placeholder styling (nothing selected). */
  empty?: boolean;
}) {
  const accordion = useContext(FilterFieldsAccordionContext);
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const triggerId = useId();

  const openFromAccordion = sectionId && accordion ? accordion.openId === sectionId : undefined;
  const open = openFromAccordion ?? controlledOpen ?? uncontrolledOpen;

  const setOpen = (next: boolean) => {
    if (sectionId && accordion) {
      accordion.setOpenId(next ? sectionId : null);
    } else if (onOpenChange) {
      onOpenChange(next);
    } else {
      setUncontrolledOpen(next);
    }
  };

  const isPlaceholder = empty;

  return (
    <div data-attr={dataAttr}>
      <p className={FILTER_FIELD_LABEL_CLASS}>{label}</p>
      <button
        type="button"
        id={triggerId}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={cn(FILTER_TRIGGER_CLASS, open && "rounded-b-none border-b-transparent")}
        onClick={() => setOpen(!open)}
      >
        <span className={cn("min-w-0 flex-1 truncate", isPlaceholder ? "text-muted/70" : "text-foreground")}>
          {summary}
        </span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open ? (
        <div className="-mt-px overflow-hidden rounded-b-2xl border border-t-0 border-border bg-card shadow-[0_4px_12px_rgba(15,23,42,0.06)]">
          <div
            className="overflow-hidden bg-card"
            style={{ height: FILTER_LIST_MAX_HEIGHT_PX }}
          >
            {children}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Inline checkbox list for filter sheets — avoids portaled menus blocked by modal focus traps. */
export function FilterCheckboxList({
  options,
  selected,
  onChange,
  emptyMenuText = "No options",
  dataAttr,
}: {
  options: Option[];
  selected: string[];
  onChange: (next: string[]) => void;
  emptyMenuText?: string;
  dataAttr?: string;
}) {
  const toggle = (value: string) => {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  };

  return (
    <div
      role="listbox"
      aria-multiselectable="true"
      data-attr={dataAttr}
      className="h-full overflow-y-auto overscroll-contain bg-card [-webkit-overflow-scrolling:touch]"
    >
      {options.length === 0 ? (
        <p className="px-3 py-2 text-sm text-muted">{emptyMenuText}</p>
      ) : (
        options.map((opt) => {
          const checked = selected.includes(opt.value);
          return (
            <label
              key={opt.value}
              role="option"
              aria-selected={checked}
              className={cn(
                "flex cursor-pointer items-start gap-2.5 px-3 py-2 text-sm",
                FIELD_SELECT_MENU_OPTION_CLASS,
                checked && "bg-primary/5",
              )}
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
  );
}

/** Inline single-select list for filter sheets (sort, calendar house, etc.). */
export function FilterSingleSelectList({
  options,
  value,
  onChange,
  dataAttr,
  onPick,
}: {
  options: Option[];
  value: string;
  onChange: (next: string) => void;
  dataAttr?: string;
  /** Called after a value is chosen (e.g. close the parent dropdown). */
  onPick?: () => void;
}) {
  return (
    <div
      role="listbox"
      data-attr={dataAttr}
      className="h-full overflow-y-auto overscroll-contain bg-card [-webkit-overflow-scrolling:touch]"
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value || "__all__"}
            type="button"
            role="option"
            aria-selected={active}
            className={cn(
              "flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm",
              FIELD_SELECT_MENU_OPTION_CLASS,
              active ? "bg-primary/10 text-foreground" : "text-foreground",
            )}
            onClick={() => {
              onChange(opt.value);
              onPick?.();
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
  );
}
