import { NextResponse } from "next/server";
import { getReportsAuthContext, assertManagerFinancialsAccess } from "@/lib/reports/auth";
import { deliverPortalInboxMessage } from "@/lib/portal-inbox-delivery";

export const runtime = "nodejs";

/** Request e-signature — sends inbox notice; full signing UI reuses lease-signing flow later. */
export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await getReportsAuthContext({ preferRole: "manager" });
  if (!auth) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const gate = await assertManagerFinancialsAccess(auth);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const { id } = await ctx.params;
  const { data: doc, error } = await auth.db
    .from("manager_documents")
    .select("id, display_name, resident_user_id, resident_email, visibility")
    .eq("id", id)
    .eq("manager_user_id", auth.userId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!doc) return NextResponse.json({ error: "Document not found." }, { status: 404 });

  const now = new Date().toISOString();
  await auth.db
    .from("manager_documents")
    .update({ signature_status: "pending", signature_requested_at: now, updated_at: now })
    .eq("id", id);

  const residentUserId = doc.resident_user_id ? String(doc.resident_user_id) : null;
  if (residentUserId && doc.visibility === "resident") {
    const { data: profile } = await auth.db.from("profiles").select("email").eq("id", auth.userId).maybeSingle();
    await deliverPortalInboxMessage(auth.db, {
      senderUserId: auth.userId,
      senderEmail: String(profile?.email ?? ""),
      fromName: "Your property manager",
      subject: `Signature requested: ${doc.display_name}`,
      text: "Please review and sign the document shared in your Documents portal.",
      toUserIds: [residentUserId],
      deliverViaEmail: false,
      senderRole: "manager",
    }).catch(() => undefined);
  }

  return NextResponse.json({ ok: true, signatureStatus: "pending" });
}
