import { primaryRoleWhenAddingManager } from "@/lib/auth/profile-primary-role";
import { ensureProfileRoleRow } from "@/lib/auth/profile-role-row";
import { recordPaidManagerCheckoutSession } from "@/lib/manager-purchase-from-session";
import { isAxisIntentSessionId } from "@/lib/manager-signup-intent";
import { getStripe } from "@/lib/stripe/server";
import type { SupabaseClient } from "@supabase/supabase-js";

export type CompleteManagerSignupResult =
  | { ok: true; managerId: string }
  | { ok: false; status: number; error: string };

async function linkManagerPurchase(
  supabase: SupabaseClient,
  userId: string,
  purchase: { id: string; email: string; manager_id: string; user_id: string | null; full_name?: string | null },
  fullName: string,
  userEmail: string,
): Promise<CompleteManagerSignupResult> {
  if (purchase.user_id) {
    if (purchase.user_id === userId) {
      return { ok: true, managerId: purchase.manager_id };
    }
    return { ok: false, status: 409, error: "This signup link was already used." };
  }

  const normalizedEmail = userEmail.trim().toLowerCase();
  if (purchase.email.trim().toLowerCase() !== normalizedEmail) {
    return {
      ok: false,
      status: 403,
      error: "Sign in with the same Google account email used at checkout.",
    };
  }

  const { data: existingProfile } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();

  const { error: upErr } = await supabase.from("profiles").upsert(
    {
      id: userId,
      email: normalizedEmail,
      role: primaryRoleWhenAddingManager(existingProfile?.role as string | undefined),
      manager_id: purchase.manager_id,
      full_name: fullName || existingProfile?.full_name || purchase.full_name?.trim() || null,
      application_approved: existingProfile?.application_approved ?? true,
    },
    { onConflict: "id" },
  );

  if (upErr) {
    return { ok: false, status: 500, error: upErr.message };
  }

  await ensureProfileRoleRow(supabase, userId, "manager");

  const { error: linkErr } = await supabase.from("manager_purchases").update({ user_id: userId }).eq("id", purchase.id);
  if (linkErr) {
    return { ok: false, status: 500, error: linkErr.message };
  }

  return { ok: true, managerId: purchase.manager_id };
}

/** Links an OAuth-authenticated user to a reserved manager purchase (post-checkout or free intent). */
export async function completeManagerSignupFromOAuth(
  supabase: SupabaseClient,
  userId: string,
  userEmail: string,
  sessionId: string,
): Promise<CompleteManagerSignupResult> {
  if (!sessionId || typeof sessionId !== "string") {
    return { ok: false, status: 400, error: "sessionId is required." };
  }

  if (isAxisIntentSessionId(sessionId)) {
    const { data: purchase, error: pErr } = await supabase
      .from("manager_purchases")
      .select("id, email, manager_id, user_id, full_name")
      .eq("stripe_checkout_session_id", sessionId)
      .maybeSingle();

    if (pErr || !purchase) {
      return { ok: false, status: 400, error: "Could not load signup for this link." };
    }

    return linkManagerPurchase(supabase, userId, purchase, purchase.full_name?.trim() ?? "", userEmail);
  }

  const stripe = getStripe();
  const session = await stripe.checkout.sessions.retrieve(sessionId);

  const paid =
    session.payment_status === "paid" ||
    session.payment_status === "no_payment_required" ||
    session.status === "complete";
  if (!paid) {
    return { ok: false, status: 400, error: "Checkout is not paid yet. Wait a moment and try again." };
  }

  await recordPaidManagerCheckoutSession(session);

  const { data: purchase, error: pErr } = await supabase
    .from("manager_purchases")
    .select("id, email, manager_id, user_id")
    .eq("stripe_checkout_session_id", sessionId)
    .maybeSingle();

  if (pErr || !purchase) {
    return { ok: false, status: 400, error: "Could not load purchase for this checkout session." };
  }

  const fullName = session.metadata?.full_name?.trim() ?? "";
  return linkManagerPurchase(supabase, userId, purchase, fullName, userEmail);
}
