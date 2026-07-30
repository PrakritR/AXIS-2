"use client";

import { FIELD_SELECT_MENU_OPTION_CLASS } from "@/components/ui/field-select-styles";
import { cn } from "@/lib/utils";

export const FILTER_LIST_VISIBLE_ROWS = 5;
const FILTER_LIST_ROW_PX = 40;
export const FILTER_LIST_MAX_HEIGHT_PX = FILTER_LIST_VISIBLE_ROWS * FILTER_LIST_ROW_PX;

type Option = { value: string; label: string };

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
      className="overflow-y-auto overscroll-contain rounded-xl border border-border bg-card [-webkit-overflow-scrolling:touch]"
      style={{ maxHeight: FILTER_LIST_MAX_HEIGHT_PX }}
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
}: {
  options: Option[];
  value: string;
  onChange: (next: string) => void;
  dataAttr?: string;
}) {
  return (
    <div
      role="listbox"
      data-attr={dataAttr}
      className="overflow-y-auto overscroll-contain rounded-xl border border-border bg-card [-webkit-overflow-scrolling:touch]"
      style={{ maxHeight: FILTER_LIST_MAX_HEIGHT_PX }}
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
            onClick={() => onChange(opt.value)}
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
