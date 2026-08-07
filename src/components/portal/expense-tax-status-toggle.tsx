"use client";

import {
  PORTAL_TOOLBAR_GROUP,
  PORTAL_TOOLBAR_PILL_BUTTON,
  PORTAL_TOOLBAR_PILL_BUTTON_ACTIVE,
} from "@/components/portal/portal-metrics";
import { cn } from "@/lib/utils";

export function ExpenseTaxStatusToggle({
  deductible,
  onChange,
  compact = false,
  className,
}: {
  deductible: boolean;
  onChange: (deductible: boolean) => void;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(PORTAL_TOOLBAR_GROUP, compact ? "p-0.5" : "p-1", className)}
      role="group"
      aria-label="Tax status"
      data-attr="expense-tax-status-toggle"
    >
      <button
        type="button"
        className={cn(
          PORTAL_TOOLBAR_PILL_BUTTON,
          compact && "min-h-8 px-3 text-xs",
          deductible && PORTAL_TOOLBAR_PILL_BUTTON_ACTIVE,
        )}
        aria-pressed={deductible}
        onClick={() => onChange(true)}
        data-attr="expense-tax-status-deductible"
      >
        Deductible
      </button>
      <button
        type="button"
        className={cn(
          PORTAL_TOOLBAR_PILL_BUTTON,
          compact && "min-h-8 px-3 text-xs",
          !deductible && PORTAL_TOOLBAR_PILL_BUTTON_ACTIVE,
        )}
        aria-pressed={!deductible}
        onClick={() => onChange(false)}
        data-attr="expense-tax-status-non-deductible"
      >
        Non-deductible
      </button>
    </div>
  );
}
