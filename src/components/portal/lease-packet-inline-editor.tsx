"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { LeaseSectionEditor } from "@/components/portal/lease-section-editor";
import { patchLeasePacketFromManager } from "@/lib/lease-packet-edit.client";
import {
  buildLeasePacketUpdateFromForm,
  leasePacketFormAutoLeaseEnd,
  leasePacketFormRegeneratesDocument,
  leasePacketFormValuesEqual,
  leasePacketFormValuesFromRow,
  LEASE_PACKET_TERM_OPTIONS,
  type LeasePacketFormValues,
} from "@/lib/lease-packet-edit-form";
import type { LeasePipelineRow } from "@/lib/lease-pipeline-storage";
import { shouldAutoComputeLeaseEnd } from "@/lib/rental-application/lease-dates";
import { SHORT_TERM_LEASE_TERM } from "@/lib/rental-application/lease-terms";
import { cn } from "@/lib/utils";

const fieldLabelClass = "mb-1.5 block text-xs font-semibold uppercase tracking-[0.12em] text-muted";

const LEASE_EDIT_SECTIONS = [
  { id: "lease-section-placement", label: "Placement" },
  { id: "lease-section-terms", label: "Terms" },
  { id: "lease-section-fees", label: "Fees" },
  { id: "lease-section-notes", label: "Notes" },
  { id: "lease-section-document", label: "Document" },
] as const;

type Props = {
  row: LeasePipelineRow;
  managerUserId?: string | null;
  onSaved: (row: LeasePipelineRow) => void;
  className?: string;
  /** Panel layout: section nav + scrollable fields + sticky save bar (lease edit modal left column). */
  layout?: "default" | "panel";
};

function patchFormValues(values: LeasePacketFormValues, patch: Partial<LeasePacketFormValues>): LeasePacketFormValues {
  const next = { ...values, ...patch };
  if (patch.leaseTerm !== undefined || patch.leaseStart !== undefined || patch.rentalType !== undefined) {
    if (shouldAutoComputeLeaseEnd(next.leaseTerm, next.rentalType)) {
      next.leaseEnd = leasePacketFormAutoLeaseEnd(next);
    }
  }
  if (patch.rentalType === "short_term" && next.leaseTerm !== SHORT_TERM_LEASE_TERM) {
    next.leaseTerm = SHORT_TERM_LEASE_TERM;
  }
  if (patch.rentalType === "standard" && next.leaseTerm === SHORT_TERM_LEASE_TERM) {
    next.leaseTerm = "";
  }
  return next;
}

export function LeasePacketInlineEditor({ row, managerUserId, onSaved, className, layout = "default" }: Props) {
  const { showToast } = useAppUi();
  const baseline = useMemo(() => leasePacketFormValuesFromRow(row), [row]);
  const [values, setValues] = useState<LeasePacketFormValues>(baseline);
  const [saving, setSaving] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setValues(leasePacketFormValuesFromRow(row));
  }, [row]);

  const dirty = !leasePacketFormValuesEqual(values, baseline);
  const willRegenerate = dirty && leasePacketFormValuesRegeneratesDocument(baseline, values);
  const leaseEndAuto = shouldAutoComputeLeaseEnd(values.leaseTerm, values.rentalType);
  const isPanel = layout === "panel";

  const update = (patch: Partial<LeasePacketFormValues>) => {
    setValues((cur) => patchFormValues(cur, patch));
  };

  const reset = () => setValues(baseline);

  const jumpToSection = (sectionId: string) => {
    const root = scrollRef.current;
    if (!root) return;
    const target = root.querySelector<HTMLElement>(`#${sectionId}`);
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const save = async () => {
    const built = buildLeasePacketUpdateFromForm(row.id, values, baseline);
    if (!built.ok) {
      showToast(built.error);
      return;
    }
    setSaving(true);
    try {
      const result = await patchLeasePacketFromManager(built.input, managerUserId);
      if (!result.ok) {
        showToast(result.error);
        return;
      }
      showToast(willRegenerate ? "Lease updated and document regenerated." : "Lease updated.");
      onSaved(result.row);
    } finally {
      setSaving(false);
    }
  };

  const termOptions =
    values.rentalType === "short_term"
      ? [SHORT_TERM_LEASE_TERM]
      : LEASE_PACKET_TERM_OPTIONS.filter((t) => t !== SHORT_TERM_LEASE_TERM);

  return (
    <form
      className={cn(
        "flex min-h-0 flex-col",
        isPanel ? "h-full gap-0" : "gap-4",
        className,
      )}
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      data-attr="lease-packet-inline-editor"
    >
      {isPanel ? (
        <div className="shrink-0 border-b border-border pb-3">
          <p className="text-sm font-semibold text-foreground">{row.residentName || "Resident"}</p>
          <p className="mt-0.5 text-xs text-muted">Edit lease terms and every document section (1–26 and addenda A–E). Save to update the preview.</p>
          <nav className="mt-3 flex flex-wrap gap-1.5" aria-label="Lease form sections">
            {LEASE_EDIT_SECTIONS.map((section) => (
              <button
                key={section.id}
                type="button"
                onClick={() => jumpToSection(section.id)}
                className="rounded-full border border-border bg-card px-2.5 py-1 text-xs font-medium text-muted transition hover:border-primary/30 hover:text-foreground"
                data-attr={`lease-edit-jump-${section.id}`}
              >
                {section.label}
              </button>
            ))}
          </nav>
        </div>
      ) : null}

      {willRegenerate ? (
        <p
          className={cn(
            "rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950",
            isPanel ? "mx-0 mt-3 shrink-0" : "",
          )}
        >
          Term or fee changes will regenerate the lease document. It stays in manager review until you send it.
        </p>
      ) : null}

      <div
        ref={scrollRef}
        className={cn(
          "min-h-0 flex-1 overflow-y-auto overscroll-contain pr-0.5 [-webkit-overflow-scrolling:touch]",
          isPanel ? "mt-3 space-y-5 pb-2" : "space-y-4",
        )}
      >
        <section id="lease-section-placement" className="scroll-mt-2 space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Placement</h3>
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-1 lg:grid-cols-2">
            <div>
              <label className={fieldLabelClass} htmlFor="lease-edit-unit">
                Unit label
              </label>
              <Input
                id="lease-edit-unit"
                value={values.unit}
                onChange={(e) => update({ unit: e.target.value })}
                placeholder="e.g. Room A · 123 Main St"
                data-attr="lease-edit-unit"
              />
            </div>
            <div>
              <label className={fieldLabelClass} htmlFor="lease-edit-room">
                Room
              </label>
              <Input
                id="lease-edit-room"
                value={values.roomChoice}
                onChange={(e) => update({ roomChoice: e.target.value })}
                placeholder="Room on lease"
                data-attr="lease-edit-room"
              />
            </div>
          </div>
        </section>

        <section id="lease-section-terms" className="scroll-mt-2 space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Lease terms</h3>
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-1 lg:grid-cols-2">
            <div>
              <label className={fieldLabelClass} htmlFor="lease-edit-stay-type">
                Stay type
              </label>
              <Select
                id="lease-edit-stay-type"
                value={values.rentalType}
                onChange={(e) => update({ rentalType: e.target.value as LeasePacketFormValues["rentalType"] })}
                data-attr="lease-edit-stay-type"
              >
                <option value="standard">Long-term</option>
                <option value="short_term">Short-term</option>
              </Select>
            </div>
            <div>
              <label className={fieldLabelClass} htmlFor="lease-edit-term">
                Lease term
              </label>
              <Select
                id="lease-edit-term"
                value={values.leaseTerm}
                onChange={(e) => update({ leaseTerm: e.target.value })}
                data-attr="lease-edit-term"
              >
                <option value="">Select term</option>
                {termOptions.map((term) => (
                  <option key={term} value={term}>
                    {term}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className={fieldLabelClass} htmlFor="lease-edit-start">
                Start date
              </label>
              <Input
                id="lease-edit-start"
                type="date"
                value={values.leaseStart}
                onChange={(e) => update({ leaseStart: e.target.value })}
                data-attr="lease-edit-start"
              />
            </div>
            <div>
              <label className={fieldLabelClass} htmlFor="lease-edit-end">
                End date
              </label>
              <Input
                id="lease-edit-end"
                type="date"
                value={values.leaseEnd}
                onChange={(e) => update({ leaseEnd: e.target.value })}
                disabled={leaseEndAuto}
                data-attr="lease-edit-end"
              />
              {leaseEndAuto ? <p className="mt-1 text-xs text-muted">Calculated from start date and term.</p> : null}
            </div>
          </div>
        </section>

        <section id="lease-section-fees" className="scroll-mt-2 space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Fees</h3>
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-1 lg:grid-cols-2">
            {(
              [
                ["monthlyRent", "Monthly rent", "lease-edit-rent"],
                ["monthlyUtilities", "Monthly utilities", "lease-edit-utilities"],
                ["securityDeposit", "Security deposit", "lease-edit-deposit"],
                ["moveInFee", "Move-in fee", "lease-edit-move-in"],
              ] as const
            ).map(([key, label, attr]) => (
              <div key={key}>
                <label className={fieldLabelClass} htmlFor={attr}>
                  {label}
                </label>
                <Input
                  id={attr}
                  inputMode="decimal"
                  value={values[key]}
                  onChange={(e) => update({ [key]: e.target.value })}
                  placeholder="0"
                  data-attr={attr}
                />
              </div>
            ))}
          </div>
        </section>

        <section id="lease-section-notes" className="scroll-mt-2 space-y-2">
          <label className={fieldLabelClass} htmlFor="lease-edit-notes">
            Internal notes
          </label>
          <Textarea
            id="lease-edit-notes"
            value={values.notes}
            onChange={(e) => update({ notes: e.target.value })}
            rows={4}
            placeholder="Notes visible to managers only"
            data-attr="lease-edit-notes"
          />
        </section>

        <LeaseSectionEditor
          row={row}
          managerUserId={managerUserId}
          onSaved={onSaved}
          embedded
          className="scroll-mt-2 border-t border-border pt-5"
        />
      </div>

      <div
        className={cn(
          "flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-border bg-card pt-3",
          isPanel && dirty ? "shadow-[0_-4px_12px_-4px_rgba(0,0,0,0.08)]" : "",
          isPanel ? "mt-2" : "",
        )}
      >
        <Button type="button" variant="outline" className="rounded-full" disabled={!dirty || saving} onClick={reset}>
          Reset
        </Button>
        <Button
          type="submit"
          variant="primary"
          className="rounded-full"
          disabled={!dirty || saving}
          data-attr="lease-edit-save"
        >
          {saving ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}

function leasePacketFormValuesRegeneratesDocument(before: LeasePacketFormValues, after: LeasePacketFormValues): boolean {
  return leasePacketFormRegeneratesDocument(before, after);
}
