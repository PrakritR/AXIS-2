"use client";

import { useState } from "react";
import Link from "next/link";
import { SmsConsentCheckbox } from "@/components/marketing/sms-consent-checkbox";

/**
 * The interactive opt-in control on the public /sms-consent page. It is a client
 * island, but Next renders its initial HTML server-side, so a reviewer with no
 * JavaScript still sees the phone field and the unchecked consent checkbox with
 * the full A2P 10DLC / CTIA disclosures baked into `SmsConsentCheckbox`.
 *
 * Consent is genuinely OPTIONAL: this page never gates anything. The stored,
 * compliance-timestamped opt-in that actually turns on texting happens when the
 * same checkbox is submitted inside a PropLane rental application — so on submit
 * here we confirm the choice and point the visitor to apply, without claiming a
 * message was sent.
 */
export function SmsOptInForm() {
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const phoneTrimmed = phone.trim();
  const canSubmit = consent && phoneTrimmed.length > 0;

  if (submitted) {
    return (
      <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50/60 px-5 py-5 text-sm text-foreground [html[data-theme=dark]_&]:bg-emerald-500/10">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">Consent confirmed</p>
        <p className="mt-2 leading-relaxed">
          Thanks — you opted in for texts about your rental application and account at{" "}
          <span className="font-semibold">{phoneTrimmed}</span>. Enter this number on a PropLane rental
          application to finish signing up for messages. Reply STOP at any time to opt out, or HELP for help.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href="/rent/browse"
            data-attr="sms-consent-start-application"
            className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:brightness-105"
          >
            Start a rental application
          </Link>
          <button
            type="button"
            onClick={() => {
              setSubmitted(false);
              setConsent(false);
              setPhone("");
            }}
            className="rounded-full border border-border px-5 py-2 text-sm font-semibold text-foreground hover:bg-accent/30"
          >
            Start over
          </button>
        </div>
      </div>
    );
  }

  return (
    <form
      data-attr="sms-consent-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!canSubmit) return;
        setSubmitted(true);
      }}
      className="space-y-4"
    >
      <div className="space-y-2">
        <label htmlFor="sms-consent-phone" className="block text-sm font-semibold text-foreground">
          Mobile phone number
        </label>
        <input
          id="sms-consent-phone"
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="(206) 555-0100"
          className="w-full rounded-xl border border-border bg-accent/30 px-3.5 py-2.5 text-sm text-foreground outline-none transition-all placeholder:text-muted/70 focus:border-primary focus:bg-card focus:ring-2 focus:ring-primary/15"
        />
      </div>

      <SmsConsentCheckbox inputId="sms-consent-checkbox" checked={consent} onChange={setConsent} />

      <button
        type="submit"
        disabled={!canSubmit}
        data-attr="sms-consent-submit"
        className="w-full rounded-2xl bg-primary py-3.5 text-sm font-semibold text-white shadow-sm transition-all hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Opt in to text messages
      </button>
      <p className="text-center text-xs text-muted">
        Consent is optional. You do not need to opt in to submit a rental application.
      </p>
    </form>
  );
}
