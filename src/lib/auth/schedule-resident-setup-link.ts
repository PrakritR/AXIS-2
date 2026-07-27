import { after } from "next/server";
import { POST as sendResidentSetupLink } from "@/app/api/auth/resident-setup-link/route";

/**
 * Verification-gated re-inheritance support: after a self-serve resident
 * signup (email/password or OAuth) mints a clean, default-deny profile, email
 * the one-time setup link for this address. If a prior guest application
 * exists for it, USING that link is the only thing that ever links/inherits
 * it — signup itself never does. Scheduled with `after()` so the create
 * account → apply flow never blocks on the inbox round-trip.
 *
 * `after()` throws when called outside an active request scope (e.g. a route
 * handler invoked directly in a unit test, rather than through the real
 * Next.js server). That must never turn an already-successful, already-safe
 * account creation into a 500 for the caller, so the scheduling itself — not
 * just the email send inside it — is best-effort.
 */
export function scheduleResidentSetupLinkEmail(email: string): void {
  try {
    after(async () => {
      try {
        await sendResidentSetupLink(
          new Request("http://localhost/api/auth/resident-setup-link", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email }),
          }),
        );
      } catch {
        /* non-critical — the "lost my email" resend on create-account is the backup */
      }
    });
  } catch {
    /* not in a request scope — best effort only, never fails the caller */
  }
}
