"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PortalCollapsibleSection } from "@/components/portal/portal-collapsible-section";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { isDemoModeActive } from "@/lib/demo/demo-session";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

/**
 * Permanent account deletion (required in-app by App Store guideline 5.1.1(v)).
 * Gated behind typing DELETE; on success the session is signed out and the
 * user lands on the public homepage.
 */
export function PortalDeleteAccountPanel() {
  const { showToast } = useAppUi();
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const confirmed = confirmText.trim().toUpperCase() === "DELETE";

  const deleteAccount = async () => {
    if (!confirmed || busy) return;
    if (isDemoModeActive()) {
      showToast("Account deletion is simulated in this demo.");
      setConfirmText("");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/account/delete", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: confirmText.trim() }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; ok?: boolean };
      if (!res.ok) {
        showToast(body.error ?? "Could not delete account.");
        return;
      }
      try {
        await createSupabaseBrowserClient().auth.signOut();
      } catch {
        // The auth user is already gone; the redirect clears local state.
      }
      window.location.href = "/";
    } catch {
      showToast("Network error — account not deleted.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <PortalCollapsibleSection
      title="Delete account"
      surfaceMuted={false}
      contentClassName="px-4 pb-5"
      toggleDataAttr="portal-delete-account-toggle"
    >
      <p className="text-sm leading-relaxed text-muted">
        Permanently deletes your login, profile, notification settings, and inbox. Records that belong to other
        people&rsquo;s accounts too (leases, payment history, work orders) are kept for their bookkeeping. Any active
        subscription is cancelled. <span className="font-semibold text-foreground">This cannot be undone.</span>
      </p>
      <div className="mt-4 space-y-2">
        <label className="text-xs font-semibold text-muted" htmlFor="portal-delete-confirm">
          Type DELETE to confirm
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <Input
            id="portal-delete-confirm"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="DELETE"
            autoComplete="off"
            className="max-w-[200px] rounded-xl"
            disabled={busy}
          />
          <Button
            type="button"
            variant="danger"
            className="border border-danger/40"
            disabled={!confirmed || busy}
            onClick={() => void deleteAccount()}
            data-attr="delete-account-confirm"
          >
            {busy ? "Deleting…" : "Delete my account"}
          </Button>
        </div>
      </div>
    </PortalCollapsibleSection>
  );
}
