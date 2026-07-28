"use client";

import { useCallback, useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { isDemoModeActive } from "@/lib/demo/demo-session";
import { validateManagerApplicationFeeCents } from "@/lib/manager-application-settings";
import { parseMoneyAmount } from "@/lib/parse-money";

function centsToDollarInput(cents: number | null): string {
  if (cents == null) return "";
  return (cents / 100).toFixed(2).replace(/\.00$/, "");
}

/**
 * The manager's ONE application-fee setting plus an optional single waiver code,
 * kept together under the Applications section. Saving writes the whole-account
 * fee via `/api/portal/manager-application-settings`; the value is authoritative
 * for every listing once saved (see `src/lib/manager-application-settings.ts`).
 */
export function ManagerApplicationSettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { showToast } = useAppUi();
  const demo = isDemoModeActive();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feeInput, setFeeInput] = useState("");
  const [configured, setConfigured] = useState(false);
  const [suggested, setSuggested] = useState<number | null>(null);
  const [waiverCode, setWaiverCode] = useState("");
  const [allowWaiver, setAllowWaiver] = useState(false);

  const load = useCallback(async () => {
    if (demo) {
      setFeeInput("50");
      setConfigured(true);
      setSuggested(5000);
      setWaiverCode("WELCOME50");
      setAllowWaiver(true);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/portal/manager-application-settings", { credentials: "include" });
      const data = (await res.json().catch(() => ({}))) as {
        settings?: { applicationFeeCents: number | null };
        suggestedFeeCents?: number | null;
        waiverCode?: string | null;
        error?: string;
      };
      if (!res.ok) {
        showToast(data.error ?? "Could not load application settings.");
        return;
      }
      const cents = data.settings?.applicationFeeCents ?? null;
      setConfigured(cents != null);
      setSuggested(data.suggestedFeeCents ?? null);
      setFeeInput(centsToDollarInput(cents != null ? cents : (data.suggestedFeeCents ?? null)));
      const code = (data.waiverCode ?? "").trim();
      setWaiverCode(code);
      setAllowWaiver(code.length > 0);
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
    const nextWaiver = allowWaiver ? waiverCode.trim() : "";
    if (demo) {
      setConfigured(applicationFeeCents != null);
      showToast("Application settings saved (demo).");
      onClose();
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/portal/manager-application-settings", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applicationFeeCents, waiverCode: nextWaiver }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        settings?: { applicationFeeCents: number | null };
        waiverCode?: string | null;
        error?: string;
      };
      if (!res.ok) {
        showToast(data.error ?? "Could not save application settings.");
        return;
      }
      showToast(
        applicationFeeCents == null
          ? "Application fee cleared."
          : `Application fee set to $${(applicationFeeCents / 100).toFixed(2).replace(/\.00$/, "")}.`,
      );
      onClose();
    } catch {
      showToast("Could not save application settings.");
    } finally {
      setSaving(false);
    }
  }

  return (
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

        <div className="space-y-2 rounded-xl border border-border bg-card px-4 py-3.5">
          <label className="flex cursor-pointer items-start gap-2">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded border-border"
              checked={allowWaiver}
              onChange={(e) => setAllowWaiver(e.target.checked)}
              data-attr="manager-application-waiver-enabled"
              disabled={loading || saving}
            />
            <span>
              <span className="text-sm font-semibold text-foreground">Allow waiver code</span>
              <p className="text-xs text-muted">Let applicants skip the application fee with one account-wide code.</p>
            </span>
          </label>
          {allowWaiver ? (
            <div className="space-y-1 pl-6">
              <label htmlFor="manager-application-waiver-code" className="text-xs font-medium text-muted">
                Waiver code
              </label>
              <Input
                id="manager-application-waiver-code"
                value={waiverCode}
                onChange={(e) => setWaiverCode(e.target.value)}
                placeholder="e.g. WELCOME50"
                data-attr="manager-application-waiver-code-input"
                disabled={loading || saving}
                className="max-w-[220px] font-mono uppercase"
              />
              <p className="text-xs text-muted">4–32 letters, numbers, or hyphens. Leave blank and save to clear.</p>
            </div>
          ) : null}
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
  );
}
