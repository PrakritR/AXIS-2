import type { ReactNode } from "react";

/** Outer frame for tabbed portal tables — light border, minimal shadow. */
export const PORTAL_DATA_TABLE_WRAP =
  "overflow-hidden rounded-xl border border-slate-200/70 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]";

export const PORTAL_DATA_TABLE_SCROLL = "overflow-x-auto";

/** Table header row (use under `<thead>`). */
export const PORTAL_TABLE_HEAD_ROW = "border-b border-slate-200/60 bg-slate-50/40";

/** Primary data row. */
export const PORTAL_TABLE_TR =
  "border-b border-slate-100/90 align-top transition-colors last:border-0 hover:bg-slate-50/40";

/** Expanded detail row (full-width cell below the summary row). */
export const PORTAL_TABLE_DETAIL_ROW = "border-b border-slate-100/90 bg-slate-50/25 last:border-0";

/** Compact body cell padding. */
export const PORTAL_TABLE_TD = "px-4 py-2.5 align-top text-sm text-slate-700";

/** Detail row cell padding. */
export const PORTAL_TABLE_DETAIL_CELL = "px-4 py-3 align-top";

/**
 * Action strip in an expanded detail row — subtle divider + compact buttons.
 * Default `bottom`: border above the strip (content above, actions below).
 * `top`: border below the strip (toolbar first, lease preview / thread below).
 */
export function PortalTableDetailActions({
  children,
  placement = "bottom",
}: {
  children: ReactNode;
  placement?: "top" | "bottom";
}) {
  if (children == null) return null;
  const edge =
    placement === "top"
      ? "mt-3 mb-4 border-b border-slate-200/50 pb-4"
      : "mt-4 border-t border-slate-200/50 pt-4";
  return <div className={`flex flex-wrap items-center gap-1.5 ${edge}`}>{children}</div>;
}

/** “Details” / “Hide” toggle on the summary row (use with `Button variant="outline"`). */
export const PORTAL_TABLE_ROW_TOGGLE_CLASS =
  "h-8 min-h-0 !rounded-md border-slate-200/80 px-3 py-0 text-xs font-medium text-slate-700 !shadow-none hover:!translate-y-0";

/** Secondary actions in {@link PortalTableDetailActions} (use with `Button variant="outline"`). */
export const PORTAL_DETAIL_BTN =
  "h-8 min-h-0 !rounded-md border-slate-200/80 px-3 py-0 text-xs font-medium text-slate-700 !shadow-none hover:!translate-y-0";

/** Primary / success action in detail toolbar (use with `Button variant="outline"`). */
export const PORTAL_DETAIL_BTN_PRIMARY =
  "h-8 min-h-0 !rounded-md !border-emerald-600 !bg-emerald-600 px-3 py-0 text-xs font-medium !text-white hover:!border-emerald-700 hover:!bg-emerald-700 !shadow-none hover:!translate-y-0";

export function PortalDataTableEmpty({ message }: { message: string }) {
  return (
    <div className={PORTAL_DATA_TABLE_WRAP}>
      <div className="flex flex-col items-center justify-center bg-slate-50/20 px-4 py-14 text-center sm:py-16">
        <p className="text-sm text-slate-500">{message}</p>
      </div>
    </div>
  );
}
