import { NextResponse } from "next/server";
import { track } from "@/lib/analytics/posthog";
import { getStripe } from "@/lib/stripe";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

/**
 * Personal data swept on deletion. Business records that other users depend
 * on (leases, charges, work orders a resident submitted, ledger/GL rows) are
 * deliberately NOT deleted — they belong to the counterparty's books too.
 * Tables with an auth.users FK (notification_preferences, sms_relay_threads)
 * cascade when the auth user row is removed.
 */
const PERSONAL_DATA_SWEEP: Array<{ table: string; column: string }> = [
  { table: "phone_verifications", column: "user_id" },
  { table: "device_push_tokens", column: "user_id" },
  { table: "portal_inbox_thread_records", column: "owner_user_id" },
  { table: "profiles", column: "id" },
];

/**
 * POST — permanently delete the signed-in user's account (App Store 5.1.1(v)
 * requires in-app account deletion). Cancels any active subscription, sweeps
 * personal data, and removes the auth user; the client signs out afterwards.
 */
export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { confirm?: string };
  if (String(body.confirm ?? "").trim().toUpperCase() !== "DELETE") {
    return NextResponse.json({ error: 'Type "DELETE" to confirm.' }, { status: 400 });
  }

  const email = String(user.email ?? "").trim().toLowerCase();
  // The canonical sandbox accounts back /demo and the guided tour in every
  // environment — deleting one would brick those surfaces.
  if (email.endsWith("@test.axis.local")) {
    return NextResponse.json({ error: "Sandbox accounts cannot be deleted." }, { status: 403 });
  }

  const db = createSupabaseServiceRoleClient();
  const { data: profile } = await db.from("profiles").select("role").eq("id", user.id).maybeSingle();
  const role = String(profile?.role ?? "").trim().toLowerCase() || "unknown";

  // Best-effort: stop billing before the account disappears. A Stripe failure
  // must not strand the user in an undeletable account — it is logged on the
  // Stripe side and recoverable from the dashboard.
  try {
    const { data: purchases } = await db
      .from("manager_purchases")
      .select("stripe_subscription_id")
      .eq("user_id", user.id);
    const subscriptionIds = [
      ...new Set(
        (purchases ?? [])
          .map((p) => String(p.stripe_subscription_id ?? "").trim())
          .filter((id) => id.startsWith("sub_")),
      ),
    ];
    if (subscriptionIds.length) {
      const stripe = getStripe();
      for (const id of subscriptionIds) {
        await stripe.subscriptions.cancel(id).catch(() => undefined);
      }
    }
  } catch {
    // Stripe not configured or lookup failed — proceed with deletion.
  }

  for (const { table, column } of PERSONAL_DATA_SWEEP) {
    await db
      .from(table)
      .delete()
      .eq(column, user.id)
      .then(() => undefined, () => undefined);
  }

  const { error: deleteError } = await db.auth.admin.deleteUser(user.id);
  if (deleteError) {
    return NextResponse.json({ error: `Could not delete account: ${deleteError.message}` }, { status: 500 });
  }

  track("account_deleted", user.id, { role });
  return NextResponse.json({ ok: true });
}
