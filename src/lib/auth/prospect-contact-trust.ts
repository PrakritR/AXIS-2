import { isPrimaryAdminEmail } from "@/lib/auth/primary-admin";

export function normalizeProspectContactEmail(email: string | null | undefined): string {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

/**
 * Prospect inbox/tour linking must not trust a client-supplied email unless a
 * tour inquiry row already proved it. Message handoff and signed-in promote
 * paths use the authenticated session email only.
 */
export function resolveTrustedProspectContactEmail(input: {
  authEmail: string;
  requestedContactEmail?: string | null;
  tourInquiryEmailVerified: boolean;
  verifiedInquiryEmail?: string | null;
}):
  | { ok: true; contactEmail: string; authEmail?: string }
  | { ok: false; error: string } {
  const auth = normalizeProspectContactEmail(input.authEmail);
  if (!auth.includes("@")) {
    return { ok: false, error: "Profile email is required." };
  }

  if (input.tourInquiryEmailVerified) {
    const inquiryEmail = normalizeProspectContactEmail(input.verifiedInquiryEmail);
    if (!inquiryEmail.includes("@")) {
      return { ok: false, error: "Could not create your account. Check your details and try again." };
    }
    return {
      ok: true,
      contactEmail: inquiryEmail,
      authEmail: inquiryEmail !== auth ? auth : undefined,
    };
  }

  const requested = normalizeProspectContactEmail(input.requestedContactEmail);
  if (requested && requested !== auth) {
    return {
      ok: false,
      error: "Could not link your prospect activity. Sign in with the same email you used on the form.",
    };
  }

  return { ok: true, contactEmail: auth };
}

/** profiles.email is self-service writable — never allow the primary-admin fallback address. */
export function isBlockedSelfServiceProfileEmail(email: string | null | undefined): boolean {
  return isPrimaryAdminEmail(email);
}
