import { randomBytes } from "node:crypto";
import { findAuthUserIdByEmail } from "@/lib/auth/find-auth-user-id-by-email";
import { migratePortalUserId } from "@/lib/auth/migrate-portal-user-id";
import { primaryRoleWhenAddingVendor } from "@/lib/auth/profile-primary-role";
import { ensureProfileRoleRow } from "@/lib/auth/profile-role-row";
import { generateAxisId } from "@/lib/manager-id";
import { makeVendorId } from "@/lib/manager-vendors-storage";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Opaque, unguessable, single-use invite token — stored on the row, never derived from the email. */
export function generateVendorInviteToken(): string {
  return randomBytes(32).toString("base64url");
}

export type VendorInviteRow = {
  id: string;
  manager_user_id: string;
  vendor_directory_id: string | null;
  vendor_email: string;
  vendor_name: string | null;
  expires_at?: string | null;
};

const VENDOR_INVITE_COLUMNS = "id, manager_user_id, vendor_directory_id, vendor_email, vendor_name, expires_at";

/**
 * Exact-match only — an `ilike` pattern here would let a signup email containing
 * `%`/`_` wildcard characters match (and hijack) an unrelated pending invite.
 */
async function findPendingVendorInviteByEmail(
  supabase: SupabaseClient,
  email: string,
): Promise<VendorInviteRow | null> {
  const { data, error } = await supabase
    .from("vendor_invites")
    .select(VENDOR_INVITE_COLUMNS)
    .eq("status", "pending")
    .eq("vendor_email", email)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as VendorInviteRow | null) ?? null;
}

/** Resolves an invite from its emailed single-use token — never trust a client-supplied email instead. */
export async function findPendingVendorInviteByToken(
  supabase: SupabaseClient,
  token: string,
): Promise<VendorInviteRow | null> {
  const trimmed = token.trim();
  if (!trimmed) return null;

  const { data, error } = await supabase
    .from("vendor_invites")
    .select(VENDOR_INVITE_COLUMNS)
    .eq("status", "pending")
    .eq("invite_token", trimmed)
    .maybeSingle();

  if (error) throw new Error(error.message);
  const invite = (data as VendorInviteRow | null) ?? null;
  if (!invite) return null;
  // Fail closed on the TTL. This was `if (invite.expires_at && …)`, so a NULL
  // expiry skipped the check entirely — and `vendor_invites` was directly
  // INSERT-able by any authenticated user, who could therefore mint a
  // never-expiring invite for an email they do not control and redeem it into a
  // pre-confirmed account. The grant is revoked in
  // 20260722120000_lock_role_grant_surface.sql and `expires_at` is now NOT
  // NULL; this keeps redemption safe regardless.
  const expiresAt = invite.expires_at ? new Date(invite.expires_at).getTime() : Number.NaN;
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return null;
  return invite;
}

/** Defense in depth: a directory row's owning manager must match the invite that names it. */
async function directoryBelongsToManager(
  supabase: SupabaseClient,
  vendorDirectoryId: string,
  managerUserId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("manager_vendor_records")
    .select("manager_user_id")
    .eq("id", vendorDirectoryId)
    .maybeSingle();
  return data?.manager_user_id === managerUserId;
}

export type ProvisionVendorResult =
  | { ok: true; axisId: string; linkedManagerId: string | null }
  | { ok: false; status: number; error: string };

/**
 * Vendor signup — links the new vendor user to the inviting manager's vendor directory
 * row when an invite applies. Pass `invite` when it was already resolved from a signed
 * token (never re-derive it from a client-supplied email in that case); omit it to fall
 * back to an exact-match lookup by the account's own email (self-serve convenience link).
 */
export async function provisionVendorAccountByEmail(
  supabase: SupabaseClient,
  opts: {
    userId: string;
    email: string;
    fullName?: string | null;
    invite?: VendorInviteRow | null;
    /**
     * Defaults to true (invite links and existing-account password verification are
     * already a possession proof). Pass false only when the caller is about to send its
     * own Supabase email-confirmation link — confirming here would skip that check.
     */
    confirmEmail?: boolean;
  },
): Promise<ProvisionVendorResult> {
  const normalEmail = opts.email.trim().toLowerCase();
  if (!normalEmail.includes("@")) {
    return { ok: false, status: 400, error: "Enter a valid email address." };
  }

  let invite = opts.invite !== undefined ? opts.invite : await findPendingVendorInviteByEmail(supabase, normalEmail);

  if (invite?.vendor_directory_id) {
    const ownershipOk = await directoryBelongsToManager(supabase, invite.vendor_directory_id, invite.manager_user_id);
    if (!ownershipOk) {
      // Directory row was reassigned/deleted since the invite was sent — the invite is
      // stale rather than actionable. Consume it so it can't be retried and proceed as if
      // no invite applied.
      await supabase.from("vendor_invites").update({ status: "cancelled" }).eq("id", invite.id);
      invite = null;
    }
  }

  const existingAuthId = await findAuthUserIdByEmail(supabase, normalEmail);
  if (existingAuthId && existingAuthId !== opts.userId) {
    await migratePortalUserId(supabase, existingAuthId, opts.userId);
  }

  const { data: existingAuth } = await supabase.auth.admin.getUserById(opts.userId);
  const metadata = existingAuth.user?.user_metadata as Record<string, unknown> | undefined;
  const axisId = metadata?.axis_id?.toString() ?? generateAxisId();

  await supabase.auth.admin.updateUserById(opts.userId, {
    ...(opts.confirmEmail === false ? {} : { email_confirm: true }),
    user_metadata: {
      ...(metadata ?? {}),
      role: "vendor",
      axis_id: axisId,
    },
  });

  const { data: existingProfile } = await supabase.from("profiles").select("*").eq("id", opts.userId).maybeSingle();

  const { error: upErr } = await supabase.from("profiles").upsert(
    {
      id: opts.userId,
      email: normalEmail,
      role: primaryRoleWhenAddingVendor(existingProfile?.role as string | undefined),
      full_name: opts.fullName?.trim() || existingProfile?.full_name || invite?.vendor_name || null,
      manager_id: existingProfile?.manager_id?.trim() || axisId,
    },
    { onConflict: "id" },
  );
  if (upErr) {
    return { ok: false, status: 500, error: upErr.message };
  }

  await ensureProfileRoleRow(supabase, opts.userId, "vendor");

  let linkedManagerId: string | null = null;

  if (invite) {
    linkedManagerId = invite.manager_user_id;

    if (invite.vendor_directory_id) {
      await supabase
        .from("manager_vendor_records")
        .update({ vendor_user_id: opts.userId, updated_at: new Date().toISOString() })
        .eq("id", invite.vendor_directory_id);
      await supabase
        .from("work_order_vendor_offers")
        .update({ vendor_user_id: opts.userId, updated_at: new Date().toISOString() })
        .eq("vendor_directory_id", invite.vendor_directory_id)
        .is("vendor_user_id", null);
    } else {
      const directoryId = makeVendorId();
      await supabase.from("manager_vendor_records").upsert(
        {
          id: directoryId,
          manager_user_id: invite.manager_user_id,
          vendor_user_id: opts.userId,
          row_data: {
            id: directoryId,
            managerUserId: invite.manager_user_id,
            name: invite.vendor_name?.trim() || opts.fullName?.trim() || normalEmail,
            trade: "",
            phone: "",
            email: normalEmail,
            notes: "",
            active: true,
          },
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" },
      );
    }

    await supabase
      .from("vendor_invites")
      .update({ status: "accepted", accepted_user_id: opts.userId, accepted_at: new Date().toISOString() })
      .eq("id", invite.id);
  }

  return { ok: true, axisId, linkedManagerId };
}
