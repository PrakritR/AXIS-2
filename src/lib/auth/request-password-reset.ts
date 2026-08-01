export const PASSWORD_RESET_ENDPOINT = "/api/auth/password-reset";

export type RequestPasswordResetResult = { ok: true } | { ok: false; message: string };

const GENERIC_FAILURE = "Could not send reset link. Try again shortly.";

/**
 * One client entry point for "email me a reset link" — the sign-in page and the
 * in-portal Login & security panel both go through it, so there is a single
 * implementation of the recovery flow. The route always answers generically for
 * unknown addresses, so a caller can never learn whether an account exists.
 */
export async function requestPasswordReset(email: string): Promise<RequestPasswordResetResult> {
  try {
    const res = await fetch(PASSWORD_RESET_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    if (res.ok) return { ok: true };
    const payload = (await res.json().catch(() => null)) as { error?: unknown } | null;
    const message = typeof payload?.error === "string" && payload.error.trim() ? payload.error : GENERIC_FAILURE;
    return { ok: false, message };
  } catch {
    return { ok: false, message: GENERIC_FAILURE };
  }
}
