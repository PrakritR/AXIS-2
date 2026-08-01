import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * SECURITY DEFINER function added in `…_current_user_has_password.sql`. It answers one
 * boolean about the CALLER'S OWN row, keyed on `auth.uid()`.
 */
export const HAS_PASSWORD_RPC = "current_user_has_password";

/**
 * Does the signed-in account have a password?
 *
 * An account created through Google or Apple sign-in has none, so asking it for a
 * "current password" is an unanswerable question. There is no client-visible signal for
 * this: the GoTrue user payload carries no password field, and `identities` /
 * `app_metadata.providers` only say which providers are LINKED — a passwordless account
 * can still carry an `email` identity. `auth.users.encrypted_password` is the only
 * authoritative answer, so it is computed server-side and read through the RPC.
 *
 * Fails CLOSED to `true` (assume a password exists) on any error, because that is the
 * state that still demands the current-password check. A false negative would only ever
 * drop a confirmation the server does not enforce anyway; a false positive just asks a
 * social-only user for something they cannot supply, which is the bug being fixed.
 */
export async function fetchCurrentUserHasPassword(client: SupabaseClient): Promise<boolean> {
  try {
    const { data, error } = await client.rpc(HAS_PASSWORD_RPC);
    if (error || typeof data !== "boolean") return true;
    return data;
  } catch {
    return true;
  }
}
