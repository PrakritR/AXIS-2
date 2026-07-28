"use client";

import type { ManagerCustomFeeRow, ManagerListingSubmissionV1 } from "@/lib/manager-listing-submission";
import {
  LISTING_STANDARD_FEE_ROWS,
  type ListingFeeRowId,
  type ListingLtFeeToggles,
  type ListingStFeeToggles,
  readListingFeeCellAmount,
} from "@/lib/listing-fee-term-toggles";
import { LISTING_FEE_PRESETS, type ListingFeeRow } from "@/lib/listing-fees";
import { sanitizeMoneyInput } from "@/lib/listing-form-inputs";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * The one remove control used on EVERY deletable item across the Fees UI — standard
 * fee rows, custom fees, room dropdowns, and bundle dropdowns — so the affordance is
 * identical everywhere (mirrors the wizard's LISTING_WIZARD_REMOVE_BTN).
 */
const FEE_REMOVE_BTN =
  "h-9 shrink-0 rounded-lg px-2.5 text-xs border-rose-200 text-rose-800 portal-danger-outline";

/** "rent" is the core price row and is never removable; every other standard row is. */
function rowIsRemovable(id: ListingFeeRowId): boolean {
  return id !== "rent";
}

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
}: {
  checked: boolean;
  onChange: (on: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-foreground">
      <input
        type="checkbox"
        className="h-3.5 w-3.5 shrink-0 rounded border-border"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="sr-only">{label}</span>
    </label>
  );
}

/**
 * Standard rows are backed by fixed submission fields, but the unified migration
 * also materializes each one as a preset-tagged row in `customFees` — which is
 * where a fee's cadence actually lives. This maps a table row to that row so the
 * long-term cadence control can read and write it.
 */
const PRESET_ID_FOR_ROW: Partial<Record<ListingFeeRowId, string>> = {
  securityDeposit: "security_deposit",
  moveInFee: "move_in_fee",
  holdingDeposit: "holding_deposit",
  parkingMonthly: "parking_monthly",
  hoaMonthly: "hoa_monthly",
  otherMonthlyFees: "other_monthly",
  monthToMonthSurcharge: "mtm_surcharge",
};

function FeeCadenceSelect({
  value,
  onChange,
  ariaLabel,
}: {
  value: "one-time" | "monthly";
  onChange: (next: "one-time" | "monthly") => void;
  ariaLabel: string;
}) {
  return (
    <select
      className="h-9 shrink-0 rounded-lg border border-border bg-card px-2 text-xs text-foreground"
      value={value}
      onChange={(e) => onChange(e.target.value === "one-time" ? "one-time" : "monthly")}
      aria-label={ariaLabel}
    >
      <option value="monthly">Monthly</option>
      <option value="one-time">One-time</option>
    </select>
  );
}

export function ListingUnifiedFeesTable({
  sub,
  isEntireHome,
  stFeeToggles,
  ltFeeToggles,
  onStToggle,
  onLtToggle,
  onStAmount,
  onLtAmount,
  onLtAmountForRow,
  stepFieldErrors,
  customFees,
  onAddCustomFee,
  onRemoveCustomFee,
  onCustomFeeChange,
  onPresetCadenceChange,
  hiddenRowIds,
  removedRowIds,
  onRemoveStandardRow,
  onAddStandardRow,
}: {
  sub: ManagerListingSubmissionV1;
  isEntireHome: boolean;
  stFeeToggles: ListingStFeeToggles;
  ltFeeToggles: ListingLtFeeToggles;
  onStToggle: (feeId: ListingFeeRowId, enabled: boolean) => void;
  onLtToggle: (feeId: ListingFeeRowId, enabled: boolean) => void;
  onStAmount: (feeId: ListingFeeRowId, amount: string) => void;
  onLtAmount: (field: keyof ManagerListingSubmissionV1, amount: string) => void;
  onLtAmountForRow: (feeId: ListingFeeRowId, amount: string) => void;
  stepFieldErrors: Record<string, string>;
  customFees: ManagerCustomFeeRow[];
  onAddCustomFee: () => void;
  onRemoveCustomFee: (index: number) => void;
  onCustomFeeChange: (index: number, patch: Partial<ManagerCustomFeeRow>) => void;
  /** Set cadence for a preset fee that has no materialized row yet (new listing). */
  onPresetCadenceChange?: (presetId: string, next: "one-time" | "monthly") => void;
  /** Standard rows hidden entirely for this rental model (e.g. securityDeposit lives per-room). */
  hiddenRowIds?: ReadonlySet<ListingFeeRowId>;
  /** Standard rows the manager deleted this session — hidden but re-addable via + Add fee. */
  removedRowIds: ReadonlySet<ListingFeeRowId>;
  /** Delete a standard fee row: clears its amounts and drops it from the table. */
  onRemoveStandardRow: (feeId: ListingFeeRowId) => void;
  /** Re-add a previously-removed standard fee row from the + Add fee menu. */
  onAddStandardRow: (feeId: ListingFeeRowId) => void;
}) {
  const visibleRows = LISTING_STANDARD_FEE_ROWS.filter(
    (row) => !hiddenRowIds?.has(row.id) && !removedRowIds.has(row.id),
  );
  // Presets the manager can re-add: removed rows that this rental model still allows.
  const readdableRows = LISTING_STANDARD_FEE_ROWS.filter(
    (row) => rowIsRemovable(row.id) && removedRowIds.has(row.id) && !hiddenRowIds?.has(row.id),
  );

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full min-w-[34rem] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border bg-accent/30 text-left text-xs font-semibold uppercase tracking-wide text-muted">
            <th className="px-3 py-2.5 font-semibold normal-case tracking-normal text-foreground">Fee</th>
            <th className="px-3 py-2.5">Short-term</th>
            <th className="px-3 py-2.5">Long-term</th>
            <th className="px-3 py-2.5 text-right"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((row) => {
            const rowId = row.id;
            const stOn = stFeeToggles[rowId];
            const ltOn = ltFeeToggles[rowId];
            const stAmount = row.stField ? readListingFeeCellAmount(sub, row.stField) : "";
            const ltAmount = row.ltField ? readListingFeeCellAmount(sub, row.ltField) : "";
            const rentLtPerRoom = row.id === "rent" && !isEntireHome;

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
                  {row.stField ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <TermCheckbox
                        checked={stOn}
                        onChange={(on) => onStToggle(rowId, on)}
                        label={`Apply ${row.label} to short-term`}
                      />
                      {stOn ? (
                        <FeeMoneyInput
                          value={stAmount}
                          onChange={(v) => onStAmount(rowId, v)}
                          placeholder={row.id === "rent" ? "85" : "0"}
                          invalid={Boolean(stepFieldErrors[String(row.stField)])}
                          ariaLabel={`Short-term ${row.label}`}
                          dataField={String(row.stField)}
                        />
                      ) : null}
                    </div>
                  ) : (
                    <span className="text-xs text-muted">—</span>
                  )}
                  {row.stField && stepFieldErrors[String(row.stField)] ? (
                    <p className="mt-1 text-xs font-medium text-red-600">{stepFieldErrors[String(row.stField)]}</p>
                  ) : null}
                </td>
                <td className="px-3 py-3 align-middle">
                  {row.ltField || row.id === "rent" ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <TermCheckbox
                        checked={ltOn}
                        onChange={(on) => onLtToggle(rowId, on)}
                        label={`Apply ${row.label} to long-term`}
                      />
                      {ltOn && !rentLtPerRoom ? (
                        <FeeMoneyInput
                          value={ltAmount}
                          onChange={(v) =>
                            row.ltField ? onLtAmount(row.ltField, v) : onLtAmountForRow(rowId, v)
                          }
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
                      {ltOn && rentLtPerRoom ? (
                        <span className="text-xs text-muted">Set per room above</span>
                      ) : null}
                      {ltOn && !rentLtPerRoom
                        ? (() => {
                            const presetId = PRESET_ID_FOR_ROW[rowId];
                            if (!presetId) return null;
                            const idx = customFees.findIndex(
                              (f) => (f as ListingFeeRow).presetId === presetId,
                            );
                            // A brand-new listing has no materialized fee rows yet, so
                            // fall back to the preset's own cadence instead of hiding
                            // the control until the listing has been saved once.
                            const presetCadence = LISTING_FEE_PRESETS.find(
                              (p) => p.presetId === presetId,
                            )?.cadence;
                            const fallback: "one-time" | "monthly" =
                              presetCadence === "monthly" ? "monthly" : "one-time";
                            const current =
                              idx >= 0
                                ? customFees[idx]!.frequency === "one-time"
                                  ? "one-time"
                                  : "monthly"
                                : fallback;
                            return (
                              <FeeCadenceSelect
                                value={current}
                                onChange={(next) =>
                                  idx >= 0
                                    ? onCustomFeeChange(idx, { frequency: next })
                                    : onPresetCadenceChange?.(presetId, next)
                                }
                                ariaLabel={`${row.label} payment frequency`}
                              />
                            );
                          })()
                        : null}
                    </div>
                  ) : (
                    <span className="text-xs text-muted">—</span>
                  )}
                  {row.ltField && (stepFieldErrors[String(row.ltField)] || (row.id === "rent" && isEntireHome && stepFieldErrors.monthlyRent)) ? (
                    <p className="mt-1 text-xs font-medium text-red-600">
                      {row.id === "rent" && isEntireHome && stepFieldErrors.monthlyRent
                        ? stepFieldErrors.monthlyRent
                        : stepFieldErrors[String(row.ltField)]}
                    </p>
                  ) : null}
                </td>
                <td className="px-3 py-3 text-right align-middle">
                  {rowIsRemovable(rowId) ? (
                    <Button
                      type="button"
                      variant="outline"
                      className={FEE_REMOVE_BTN}
                      onClick={() => onRemoveStandardRow(rowId)}
                      aria-label={`Remove ${row.label}`}
                    >
                      Remove
                    </Button>
                  ) : (
                    <span className="text-xs text-muted">—</span>
                  )}
                </td>
              </tr>
            );
          })}

          {/* Only genuinely custom rows belong here. Preset-backed rows are already
              rendered above as standard fees, so listing them again duplicated every
              fee once the legacy->unified migration started materializing presets
              into customFees. Indices are captured before filtering because the
              change/remove callbacks address the unfiltered array. */}
          {customFees
            .map((fee, i) => ({ fee, i }))
            .filter(({ fee }) => {
              const presetId = (fee as ListingFeeRow).presetId;
              return !presetId || presetId === "custom";
            })
            .map(({ fee, i }) => (
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
                  <FeeCadenceSelect
                    value={fee.frequency === "one-time" ? "one-time" : "monthly"}
                    onChange={(next) => onCustomFeeChange(i, { frequency: next })}
                    ariaLabel={`Custom fee ${i + 1} payment frequency`}
                  />
                </div>
              </td>
              <td className="px-3 py-3 text-right align-middle">
                <Button
                  type="button"
                  variant="outline"
                  className={FEE_REMOVE_BTN}
                  onClick={() => onRemoveCustomFee(i)}
                  aria-label={`Remove custom fee ${i + 1}`}
                >
                  Remove
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex flex-wrap items-center gap-2 border-t border-border px-3 py-2.5">
        {readdableRows.length > 0 ? (
          <select
            className="h-8 rounded-full border border-border bg-card px-3 text-xs text-foreground"
            value=""
            onChange={(e) => {
              const id = e.target.value as ListingFeeRowId;
              if (id) onAddStandardRow(id);
            }}
            aria-label="Add a fee back to the table"
          >
            <option value="">+ Add fee…</option>
            {readdableRows.map((row) => (
              <option key={row.id} value={row.id}>
                {row.label}
              </option>
            ))}
          </select>
        ) : null}
        <Button type="button" variant="outline" className="rounded-full text-xs" onClick={onAddCustomFee}>
          + Add custom fee
        </Button>
      </div>
    </div>
  );
}
