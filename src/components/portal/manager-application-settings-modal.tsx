"use client";

import { useCallback, useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { ManagerApplicationFeeWaiverCodesModal } from "@/components/portal/manager-application-fee-waiver-codes-modal";
import { isDemoModeActive } from "@/lib/demo/demo-session";
import { validateManagerApplicationFeeCents } from "@/lib/manager-application-settings";
import { parseMoneyAmount } from "@/lib/parse-money";

function centsToDollarInput(cents: number | null): string {
  if (cents == null) return "";
  return (cents / 100).toFixed(2).replace(/\.00$/, "");
}

/**
 * The manager's ONE application-fee setting plus their fee-waiver codes, kept
 * together under the Applications section (captain decision, 2026-07: the fee
 * is configured here rather than per property listing, and the waiver lives
 * beside it). Saving here writes the whole-account fee via
 * `/api/portal/manager-application-settings`; the value is authoritative for
 * every listing once saved (see `src/lib/manager-application-settings.ts`).
 */
export function ManagerApplicationSettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { showToast } = useAppUi();
  const demo = isDemoModeActive();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feeInput, setFeeInput] = useState("");
  const [configured, setConfigured] = useState(false);
  const [suggested, setSuggested] = useState<number | null>(null);
  const [waiverOpen, setWaiverOpen] = useState(false);

  const load = useCallback(async () => {
    if (demo) {
      setFeeInput("50");
      setConfigured(true);
      setSuggested(5000);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/portal/manager-application-settings", { credentials: "include" });
      const data = (await res.json().catch(() => ({}))) as {
        settings?: { applicationFeeCents: number | null };
        suggestedFeeCents?: number | null;
        error?: string;
      };
      if (!res.ok) {
        showToast(data.error ?? "Could not load application settings.");
        return;
      }
      const cents = data.settings?.applicationFeeCents ?? null;
      setConfigured(cents != null);
      setSuggested(data.suggestedFeeCents ?? null);
      // Pre-fill: the saved value if configured, otherwise the suggested value
      // (from existing listings) so the manager confirms an explicit number —
      // nothing is persisted until they Save, so no listing's charge changes on
      // its own.
      setFeeInput(centsToDollarInput(cents != null ? cents : (data.suggestedFeeCents ?? null)));
    } catch {
      showToast("Could not load application settings.");
    } finally {
      setLoading(false);
    }
  }, [demo, showToast]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  async function save() {
    const trimmed = feeInput.trim();
    if (trimmed !== "" && !/\d/.test(trimmed)) {
      showToast("Enter a valid application fee.");
      return;
    }
    const validated = validateManagerApplicationFeeCents(
      trimmed === "" ? null : Math.round(parseMoneyAmount(trimmed) * 100),
    );
    if (!validated.ok) {
      showToast(validated.error);
      return;
    }
    const applicationFeeCents = validated.applicationFeeCents;
    if (demo) {
      setConfigured(applicationFeeCents != null);
      showToast("Application fee saved (demo).");
      onClose();
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/portal/manager-application-settings", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applicationFeeCents }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        settings?: { applicationFeeCents: number | null };
        error?: string;
      };
      if (!res.ok) {
        showToast(data.error ?? "Could not save application fee.");
        return;
      }
      showToast(
        applicationFeeCents == null
          ? "Application fee cleared."
          : `Application fee set to $${(applicationFeeCents / 100).toFixed(2).replace(/\.00$/, "")}.`,
      );
      onClose();
    } catch {
      showToast("Could not save application fee.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Modal open={open} onClose={onClose} title="Application settings">
        <div className="space-y-5">
          <div className="space-y-2">
            <label htmlFor="manager-application-fee" className="text-sm font-semibold text-foreground">
              Application fee
            </label>
            <p className="text-xs text-muted">
              Set once for every property you list. This is the only fee collected during the application — the security
              deposit is billed later under Payments, after approval.
            </p>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted">$</span>
              <Input
                id="manager-application-fee"
                inputMode="decimal"
                placeholder="50"
                value={feeInput}
                onChange={(e) => setFeeInput(e.target.value)}
                data-attr="manager-application-fee-input"
                disabled={loading || saving}
                className="max-w-[140px]"
              />
            </div>
            {!configured && suggested != null ? (
              <p className="text-xs text-muted">
                Suggested from your current listings: ${(suggested / 100).toFixed(2).replace(/\.00$/, "")}. Save to apply
                it to every property.
              </p>
            ) : null}
            <p className="text-xs text-muted">Enter $0 to make applications free. Leave blank to clear.</p>
          </div>

          <div className="flex w-full items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3.5">
            <div>
              <span className="text-sm font-semibold text-foreground">Fee waiver codes</span>
              <p className="text-xs text-muted">Let specific applicants skip the application fee entirely.</p>
            </div>
            <button
              type="button"
              onClick={() => setWaiverOpen(true)}
              data-attr="manager-application-waiver-codes-link"
              className="shrink-0 text-sm font-medium text-primary hover:underline"
            >
              Manage
            </button>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" className="px-4 text-[13px]" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button
              type="button"
              className="px-4 text-[13px]"
              onClick={() => void save()}
              disabled={loading || saving}
              data-attr="manager-application-fee-save"
            >
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      </Modal>

      <ManagerApplicationFeeWaiverCodesModal open={waiverOpen} onClose={() => setWaiverOpen(false)} />
    </>
  );
}
