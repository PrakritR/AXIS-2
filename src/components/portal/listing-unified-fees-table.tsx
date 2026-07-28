"use client";

import type { ManagerCustomFeeRow, ManagerListingSubmissionV1 } from "@/lib/manager-listing-submission";
import {
  LISTING_STANDARD_FEE_ROWS,
  type ListingStFeeToggleId,
  type ListingStFeeToggles,
  readListingFeeCellAmount,
} from "@/lib/listing-fee-term-toggles";
import { sanitizeMoneyInput } from "@/lib/listing-form-inputs";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function FeeMoneyInput({
  value,
  onChange,
  placeholder = "0",
  disabled,
  invalid,
  ariaLabel,
  dataField,
}: {
  value: string;
  onChange: (sanitized: string) => void;
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  ariaLabel: string;
  dataField?: string;
}) {
  return (
    <div className="relative w-full min-w-0 max-w-[9.5rem]" data-wizard-field={dataField}>
      <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-medium text-muted">
        $
      </span>
      <Input
        inputMode="decimal"
        aria-label={ariaLabel}
        disabled={disabled}
        className={cn("h-9 pl-6 text-sm tabular-nums", invalid && "border-red-500 ring-1 ring-red-500/30")}
        value={value}
        onChange={(e) => onChange(sanitizeMoneyInput(e.target.value))}
        placeholder={placeholder}
      />
    </div>
  );
}

function TermCheckbox({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (on: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-foreground">
      <input
        type="checkbox"
        className="h-3.5 w-3.5 shrink-0 rounded border-border"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="sr-only">{label}</span>
    </label>
  );
}

export function ListingUnifiedFeesTable({
  sub,
  isEntireHome,
  shortTermEnabled,
  longTermEnabled,
  stFeeToggles,
  onStToggle,
  onStAmount,
  onLtAmount,
  stepFieldErrors,
  customFees,
  onAddCustomFee,
  onRemoveCustomFee,
  onCustomFeeChange,
}: {
  sub: ManagerListingSubmissionV1;
  isEntireHome: boolean;
  shortTermEnabled: boolean;
  longTermEnabled: boolean;
  stFeeToggles: ListingStFeeToggles;
  onStToggle: (feeId: ListingStFeeToggleId, enabled: boolean) => void;
  onStAmount: (feeId: ListingStFeeToggleId, amount: string) => void;
  onLtAmount: (field: keyof ManagerListingSubmissionV1, amount: string) => void;
  stepFieldErrors: Record<string, string>;
  customFees: ManagerCustomFeeRow[];
  onAddCustomFee: () => void;
  onRemoveCustomFee: (index: number) => void;
  onCustomFeeChange: (index: number, patch: Partial<ManagerCustomFeeRow>) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full min-w-[32rem] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border bg-accent/30 text-left text-xs font-semibold uppercase tracking-wide text-muted">
            <th className="px-3 py-2.5 font-semibold normal-case tracking-normal text-foreground">Fee</th>
            <th className="px-3 py-2.5">Short-term</th>
            <th className="px-3 py-2.5">Long-term</th>
          </tr>
        </thead>
        <tbody>
          {LISTING_STANDARD_FEE_ROWS.map((row) => {
            const stToggleId = row.stField ? (row.id as ListingStFeeToggleId) : null;
            const stOn = stToggleId ? stFeeToggles[stToggleId] : false;
            const stAmount = row.stField ? readListingFeeCellAmount(sub, row.stField) : "";
            const ltAmount = row.ltField ? readListingFeeCellAmount(sub, row.ltField) : "";
            const stAvailable = Boolean(row.stField) && shortTermEnabled;
            const ltAvailable =
              Boolean(row.ltField) && longTermEnabled && !(row.id === "rent" && !isEntireHome);

            return (
              <tr key={row.id} className="border-b border-border/70 last:border-b-0">
                <td className="px-3 py-3 align-middle">
                  <div className="font-medium text-foreground">{row.label}</div>
                  {row.stHint || row.ltHint ? (
                    <div className="mt-0.5 text-[11px] text-muted">
                      {[row.stHint, row.ltHint].filter(Boolean).join(" · ")}
                    </div>
                  ) : null}
                </td>
                <td className="px-3 py-3 align-middle">
                  {!row.stField || !shortTermEnabled ? (
                    <span className="text-xs text-muted">—</span>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      <TermCheckbox
                        checked={stOn}
                        onChange={(on) => stToggleId && onStToggle(stToggleId, on)}
                        label={`Apply ${row.label} to short-term`}
                      />
                      {stAvailable && stOn ? (
                        <FeeMoneyInput
                          value={stAmount}
                          onChange={(v) => stToggleId && onStAmount(stToggleId, v)}
                          placeholder={row.id === "rent" ? "85" : "0"}
                          invalid={Boolean(row.stField && stepFieldErrors[String(row.stField)])}
                          ariaLabel={`Short-term ${row.label}`}
                          dataField={String(row.stField)}
                        />
                      ) : null}
                    </div>
                  )}
                  {row.stField && stepFieldErrors[String(row.stField)] ? (
                    <p className="mt-1 text-xs font-medium text-red-600">{stepFieldErrors[String(row.stField)]}</p>
                  ) : null}
                </td>
                <td className="px-3 py-3 align-middle">
                  {!row.ltField ? (
                    <span className="text-xs text-muted">—</span>
                  ) : row.id === "rent" && !isEntireHome ? (
                    <span className="text-xs text-muted">Per room ↑</span>
                  ) : !longTermEnabled ? (
                    <span className="text-xs text-muted">—</span>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      <TermCheckbox checked={ltAvailable} onChange={() => {}} label={`Apply ${row.label} to long-term`} disabled />
                      {ltAvailable ? (
                        <FeeMoneyInput
                          value={ltAmount}
                          onChange={(v) => row.ltField && onLtAmount(row.ltField, v)}
                          placeholder={row.id === "holdingDeposit" ? "100" : "0"}
                          invalid={Boolean(
                            row.ltField &&
                              (stepFieldErrors[String(row.ltField)] ||
                                (row.id === "rent" && isEntireHome && stepFieldErrors.monthlyRent)),
                          )}
                          ariaLabel={`Long-term ${row.label}`}
                          dataField={row.id === "rent" && isEntireHome ? "monthlyRent" : String(row.ltField)}
                        />
                      ) : null}
                    </div>
                  )}
                  {row.ltField && (stepFieldErrors[String(row.ltField)] || (row.id === "rent" && isEntireHome && stepFieldErrors.monthlyRent)) ? (
                    <p className="mt-1 text-xs font-medium text-red-600">
                      {row.id === "rent" && isEntireHome && stepFieldErrors.monthlyRent
                        ? stepFieldErrors.monthlyRent
                        : stepFieldErrors[String(row.ltField)]}
                    </p>
                  ) : null}
                </td>
              </tr>
            );
          })}

          {customFees.map((fee, i) => (
            <tr key={fee.id} className="border-b border-border/70 last:border-b-0">
              <td className="px-3 py-3 align-middle">
                <Input
                  className="h-9 text-sm"
                  value={fee.label}
                  onChange={(e) => onCustomFeeChange(i, { label: e.target.value })}
                  placeholder="Custom fee name"
                  aria-label={`Custom fee ${i + 1} name`}
                />
              </td>
              <td className="px-3 py-3 align-middle">
                <span className="text-xs text-muted">—</span>
              </td>
              <td className="px-3 py-3 align-middle">
                <div className="flex flex-wrap items-center gap-2">
                  <FeeMoneyInput
                    value={fee.amount.replace(/^\$/, "").trim()}
                    onChange={(v) => onCustomFeeChange(i, { amount: v })}
                    ariaLabel={`Custom fee ${i + 1} amount`}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="h-9 shrink-0 rounded-lg px-2.5 text-xs"
                    onClick={() => onRemoveCustomFee(i)}
                  >
                    Remove
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="border-t border-border px-3 py-2.5">
        <Button type="button" variant="outline" className="rounded-full text-xs" onClick={onAddCustomFee}>
          + Add fee
        </Button>
      </div>
    </div>
  );
}
