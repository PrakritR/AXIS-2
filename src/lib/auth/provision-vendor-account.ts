import { findAuthUserIdByEmail } from "@/lib/auth/find-auth-user-id-by-email";
import { migratePortalUserId } from "@/lib/auth/migrate-portal-user-id";
import { primaryRoleWhenAddingVendor } from "@/lib/auth/profile-primary-role";
import { ensureProfileRoleRow } from "@/lib/auth/profile-role-row";
import { generateAxisId } from "@/lib/manager-id";
import { makeVendorId } from "@/lib/manager-vendors-storage";
import type { SupabaseClient } from "@supabase/supabase-js";

type VendorInviteRow = {
  id: string;
  manager_user_id: string;
  vendor_directory_id: string | null;
  vendor_email: string;
  vendor_name: string | null;
};

async function findPendingVendorInviteByEmail(
  supabase: SupabaseClient,
  email: string,
): Promise<VendorInviteRow | null> {
  const { data, error } = await supabase
    .from("vendor_invites")
    .select("id, manager_user_id, vendor_directory_id, vendor_email, vendor_name")
    .eq("status", "pending")
    .ilike("vendor_email", email)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as VendorInviteRow | null) ?? null;
}

export type ProvisionVendorResult =
  | { ok: true; axisId: string; linkedManagerId: string | null }
  | { ok: false; status: number; error: string };

/** Vendor signup via invite link — links the new vendor user to the inviting manager's vendor directory row. */
export async function provisionVendorAccountByEmail(
  supabase: SupabaseClient,
  opts: { userId: string; email: string; fullName?: string | null },
): Promise<ProvisionVendorResult> {
  const normalEmail = opts.email.trim().toLowerCase();
  if (!normalEmail.includes("@")) {
    return { ok: false, status: 400, error: "Enter a valid email address." };
  }

  const invite = await findPendingVendorInviteByEmail(supabase, normalEmail);

  const existingAuthId = await findAuthUserIdByEmail(supabase, normalEmail);
  if (existingAuthId && existingAuthId !== opts.userId) {
    await migratePortalUserId(supabase, existingAuthId, opts.userId);
  }

  const { data: existingAuth } = await supabase.auth.admin.getUserById(opts.userId);
  const metadata = existingAuth.user?.user_metadata as Record<string, unknown> | undefined;
  const axisId = metadata?.axis_id?.toString() ?? generateAxisId();

  await supabase.auth.admin.updateUserById(opts.userId, {
    email_confirm: true,
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
