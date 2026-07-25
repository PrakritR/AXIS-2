import Link from "next/link";

/**
 * Carrier-compliant (A2P 10DLC / CTIA) SMS opt-in control. Rendered on every
 * public form that collects a phone number and can lead to an outbound text.
 * Invariants required for carrier review — do not change without re-checking
 * the campaign requirements:
 *  - unchecked by default (never pre-selected),
 *  - optional: submitting without it must still succeed,
 *  - not bundled with any other agreement,
 *  - names the sender + message types + frequency/rate + STOP/HELP,
 *  - links to the Privacy Policy and Terms of Service.
 */
export function SmsConsentCheckbox({
  checked,
  onChange,
  inputId,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  inputId: string;
}) {
  return (
    <label
      htmlFor={inputId}
      data-attr="sms-consent-checkbox"
      className="flex cursor-pointer items-start gap-3 rounded-2xl border border-border bg-accent/20 px-4 py-3"
    >
      <input
        id={inputId}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-border text-primary focus:ring-primary/30"
      />
      <span className="text-xs leading-relaxed text-muted">
        I agree to receive text messages from PropLane about tour scheduling and my rental inquiry at the
        number provided. Message frequency varies. Message and data rates may apply. Reply STOP to opt out,
        HELP for help. See our{" "}
        <Link href="/privacy" target="_blank" className="font-semibold text-primary hover:underline">
          Privacy Policy
        </Link>{" "}
        and{" "}
        <Link href="/tos" target="_blank" className="font-semibold text-primary hover:underline">
          Terms of Service
        </Link>
        . Consent is optional and not required to book a tour or send a message.
      </span>
    </label>
  );
}
