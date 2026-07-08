import type { SupabaseClient } from "@supabase/supabase-js";
import { deliverPortalInboxMessage } from "@/lib/portal-inbox-delivery";
import { track } from "@/lib/analytics/posthog";
import type { ManagerDocumentVisibility } from "@/lib/documents/manager-documents";

/** Best-effort inbox ping when a manager shares a library document outward. */
export async function notifyDocumentShared(
  db: SupabaseClient,
  opts: {
    managerUserId: string;
    managerEmail: string;
    managerName: string;
    documentId: string;
    documentName: string;
    visibility: Exclude<ManagerDocumentVisibility, "manager">;
    residentUserId?: string | null;
    residentEmail?: string | null;
    vendorId?: string | null;
  },
): Promise<void> {
  const subject = `New document shared: ${opts.documentName}`;
  const text = `Your property manager shared "${opts.documentName}" with you. Open Documents → Shared to view it.`;

  if (opts.visibility === "resident") {
    const toUserIds: string[] = [];
    if (opts.residentUserId) toUserIds.push(opts.residentUserId);
    if (toUserIds.length === 0 && opts.residentEmail) {
      const { data: profile } = await db
        .from("profiles")
        .select("id")
        .eq("email", opts.residentEmail.trim().toLowerCase())
        .maybeSingle();
      if (profile?.id) toUserIds.push(String(profile.id));
    }
    if (toUserIds.length === 0) return;

    await deliverPortalInboxMessage(db, {
      senderUserId: opts.managerUserId,
      senderEmail: opts.managerEmail,
      fromName: opts.managerName || "Your property manager",
      subject,
      text,
      toUserIds,
      deliverViaEmail: false,
      senderRole: "manager",
    });
    track("document_shared", opts.managerUserId, {
      visibility: "resident",
      document_id: opts.documentId,
    });
    return;
  }

  if (!opts.vendorId) return;
  const { data: vendorRow } = await db
    .from("manager_vendor_records")
    .select("vendor_user_id")
    .eq("id", opts.vendorId)
    .eq("manager_user_id", opts.managerUserId)
    .maybeSingle();
  const vendorUserId = vendorRow?.vendor_user_id ? String(vendorRow.vendor_user_id) : "";
  if (!vendorUserId) return;

  await deliverPortalInboxMessage(db, {
    senderUserId: opts.managerUserId,
    senderEmail: opts.managerEmail,
    fromName: opts.managerName || "Your property manager",
    subject,
    text: `A property manager shared "${opts.documentName}" with you. Open Documents → Shared to view it.`,
    toUserIds: [vendorUserId],
    deliverViaEmail: false,
    senderRole: "manager",
  });
  track("document_shared", opts.managerUserId, {
    visibility: "vendor",
    document_id: opts.documentId,
  });
}
