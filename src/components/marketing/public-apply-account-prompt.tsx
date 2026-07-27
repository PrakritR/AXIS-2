"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import {
  hasPublicApplyGuestContinue,
  markPublicApplyGuestContinue,
  publicApplyCreateAccountHref,
  publicApplySignInHref,
} from "@/lib/rental-application/public-apply-session";

/**
 * Shown before the public rental wizard when the applicant is not signed in.
 * Recommends creating a resident account (then applying from the portal); sign-in
 * is for returning residents; guest apply remains the last option.
 */
export function PublicApplyAccountPrompt({
  propertyId,
  propertyTitle,
  onContinueGuest,
}: {
  propertyId: string;
  propertyTitle?: string;
  onContinueGuest: () => void;
}) {
  const [resolved, setResolved] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [guestChosen, setGuestChosen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (hasPublicApplyGuestContinue(propertyId)) {
      setGuestChosen(true);
      setResolved(true);
      return;
    }
    void (async () => {
      try {
        const supabase = createSupabaseBrowserClient();
        const { data } = await supabase.auth.getSession();
        if (!cancelled) {
          setSignedIn(Boolean(data.session?.user));
          setResolved(true);
        }
      } catch {
        if (!cancelled) setResolved(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [propertyId]);

  const continueAsGuest = () => {
    markPublicApplyGuestContinue(propertyId);
    setGuestChosen(true);
    onContinueGuest();
  };

  if (!resolved || signedIn || guestChosen) return null;

  const listing = propertyTitle?.trim() || "this home";

  return (
    <div className="mb-6 rounded-2xl border border-border bg-card p-5 shadow-[0_16px_48px_-28px_rgba(15,23,42,0.18)] sm:rounded-3xl sm:p-6">
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary">Before you apply</p>
      <h2 className="mt-2 text-lg font-bold tracking-tight text-foreground sm:text-xl">
        Create your resident account
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        We recommend a resident account for {listing} — create one and apply from your portal, where you can track your
        application, messages, and payments. Already have an account? Sign in. Or apply as a guest and we&apos;ll email
        setup instructions to the address you use.
      </p>
      <div className="mt-4 space-y-2.5">
        <Link
          href={publicApplyCreateAccountHref(propertyId)}
          className="btn-cobalt inline-flex min-h-[44px] w-full items-center justify-center rounded-full px-6 text-[15px] font-semibold"
          data-attr="public-apply-create-account"
        >
          Create account
        </Link>
        <Link
          href={publicApplySignInHref(propertyId)}
          className="inline-flex min-h-[44px] w-full items-center justify-center rounded-full border border-border px-6 text-[15px] font-semibold text-foreground"
          data-attr="public-apply-sign-in"
        >
          Sign in
        </Link>
        <Button
          type="button"
          variant="ghost"
          className="min-h-[44px] w-full rounded-full text-[15px] font-semibold text-muted"
          data-attr="public-apply-continue-guest"
          onClick={continueAsGuest}
        >
          Continue without an account
        </Button>
      </div>
    </div>
  );
}
