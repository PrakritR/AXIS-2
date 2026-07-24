/** Canonical field dropdown trigger/menu tokens — matches `Select` in `input.tsx`. */

export const FIELD_SELECT_TRIGGER_CLASS =
  "mt-1 flex min-h-[44px] h-[44px] w-full items-center justify-between gap-2 rounded-2xl border border-border bg-auth-input-bg px-4 text-left text-[16px] text-foreground shadow-[0_1px_2px_rgba(15,23,42,0.03)] outline-none transition-[border-color,background-color,box-shadow] duration-200 hover:border-primary/25 focus:border-primary/40 focus:ring-4 focus:ring-primary/10 disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm";

/** Compact width for toolbar/filter rows — same visual tokens as the form field trigger. */
export const FIELD_SELECT_TRIGGER_COMPACT_CLASS =
  "flex min-h-[44px] h-[44px] min-w-[9.5rem] max-w-full w-full items-center justify-between gap-2 rounded-2xl border border-border bg-auth-input-bg px-4 text-left text-sm text-foreground shadow-[0_1px_2px_rgba(15,23,42,0.03)] outline-none transition-[border-color,background-color,box-shadow] duration-200 hover:border-primary/25 focus:border-primary/40 focus:ring-4 focus:ring-primary/10 disabled:cursor-not-allowed disabled:opacity-50";

export const FIELD_SELECT_MENU_CLASS =
  "field-dropdown-menu max-h-64 overflow-auto rounded-2xl border border-border py-1 shadow-[0_16px_40px_-12px_rgba(15,23,42,0.35)]";

export const FIELD_SELECT_LABEL_CLASS = "text-[11px] font-bold uppercase tracking-[0.12em] text-muted";

export const FIELD_SELECT_CHEVRON_CLASS = "h-4 w-4 shrink-0 text-muted";
