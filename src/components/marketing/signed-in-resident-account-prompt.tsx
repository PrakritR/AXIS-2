"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { markPublicApplyGuestContinue } from "@/lib/rental-application/public-apply-session";

/**
 * Shown on the PUBLIC apply surface when the visitor is signed in but does NOT
 * hold the resident role (a manager or vendor). Per the account model, they
 * create a SEPARATE resident account — additively, on the same login and email —
 * and then apply from inside the resident portal.
 *
 * This is a DISTINCT surface from the anonymous "Before you apply" gate
 * (`public-apply-account-prompt.tsx`), which another lane owns; do not merge the
 * two. Guest apply remains available here for anyone who wants no account.
 */
export function SignedInResidentAccountPrompt({
  propertyId,
  propertyTitle,
  onContinueGuest,
}: {
  propertyId: string;
  propertyTitle?: string;
  onContinueGuest: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const listing = propertyTitle?.trim() || "this home";

  const createResidentAccount = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/create-resident-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const body = (await res.json().catch(() => ({}))) as { redirectTo?: string; error?: string };
      if (!res.ok) {
        setError(body.error || "Could not create your resident account. Please try again.");
        setBusy(false);
        return;
      }
      const base = body.redirectTo || "/resident/applications/apply";
      const pid = propertyId.trim();
      // Full navigation so the freshly-set active-portal cookie and the new
      // resident role are re-read by the resident portal's server guard.
      window.location.assign(pid ? `${base}?propertyId=${encodeURIComponent(pid)}` : base);
    } catch {
      setError("Could not create your resident account. Please try again.");
      setBusy(false);
    }
  };

  return (
    <div className="mb-6 rounded-2xl border border-border bg-card p-5 shadow-[0_16px_48px_-28px_rgba(15,23,42,0.18)] sm:rounded-3xl sm:p-6">
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary">You&apos;re signed in</p>
      <h2 className="mt-2 text-lg font-bold tracking-tight text-foreground sm:text-xl">
        Create your resident account to apply
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        To rent {listing}, we&apos;ll set up a separate resident account on your existing login: same email, no new
        password, and its own resident portal kept separate from your current account. Switch between them anytime
        without signing out.
      </p>
      {error ? (
        <p className="mt-3 text-sm font-medium text-danger" role="alert">
          {error}
        </p>
      ) : null}
      <div className="mt-4 space-y-2.5">
        <Button
          type="button"
          className="min-h-[44px] w-full rounded-full text-[15px] font-semibold"
          data-attr="signed-in-create-resident-account"
          disabled={busy}
          onClick={() => createResidentAccount()}
        >
          {busy ? "Creating…" : "Create resident account & apply"}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="min-h-[44px] w-full rounded-full text-[15px] font-semibold"
          data-attr="signed-in-apply-as-guest"
          disabled={busy}
          onClick={() => {
            markPublicApplyGuestContinue(propertyId);
            onContinueGuest();
          }}
        >
          Apply as a guest instead
        </Button>
      </div>
    </div>
  );
}
