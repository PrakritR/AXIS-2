"use client";

import { useCallback, useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { isDemoModeActive } from "@/lib/demo/demo-session";

/**
 * The manager's account-wide promo code (round 32). This dialog once also set the
 * account-wide application fee, but the fee is now authoritative per listing
 * ([app-fee-authority] option B) and the account-wide value is only a new-listing default,
 * so it no longer needs an editor here. One control remains: the promo code that makes an
 * application free. An empty code turns it off. Saving writes via
 * `/api/portal/manager-application-settings`.
 */
export function ManagerApplicationSettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { showToast } = useAppUi();
  const demo = isDemoModeActive();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [waiverCode, setWaiverCode] = useState("");
  // The account-wide application fee is no longer edited here. We still carry its stored
  // value untouched so saving the promo code re-sends it verbatim and never clears it — the
  // PATCH route treats an omitted `applicationFeeCents` as a clear, and round 24 forbids
  // deleting stored data.
  const [feeCents, setFeeCents] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (demo) {
      setWaiverCode("WELCOME50");
      setFeeCents(5000);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/portal/manager-application-settings", { credentials: "include" });
      const data = (await res.json().catch(() => ({}))) as {
        settings?: { applicationFeeCents: number | null };
        waiverCode?: string | null;
        error?: string;
      };
      if (!res.ok) {
        showToast(data.error ?? "Could not load promo code.");
        return;
      }
      setFeeCents(data.settings?.applicationFeeCents ?? null);
      setWaiverCode((data.waiverCode ?? "").trim());
    } catch {
      showToast("Could not load promo code.");
    } finally {
      setLoading(false);
    }
  }, [demo, showToast]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  async function save() {
    const nextWaiver = waiverCode.trim();
    if (demo) {
      showToast("Promo code saved (demo).");
      onClose();
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/portal/manager-application-settings", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        // Re-send the stored fee unchanged so the promo-code save never clears it.
        body: JSON.stringify({ applicationFeeCents: feeCents, waiverCode: nextWaiver }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        showToast(data.error ?? "Could not save promo code.");
        return;
      }
      showToast(nextWaiver ? "Promo code saved." : "Promo code cleared.");
      onClose();
    } catch {
      showToast("Could not save promo code.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Promo code">
      <div className="space-y-4">
        <Input
          aria-label="Promo code"
          value={waiverCode}
          onChange={(e) => setWaiverCode(e.target.value)}
          placeholder="E.G. WELCOME50"
          data-attr="manager-application-waiver-code-input"
          disabled={loading || saving}
          className="max-w-[220px] font-mono uppercase"
        />
        <div className="flex justify-end gap-2 pt-1">
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
