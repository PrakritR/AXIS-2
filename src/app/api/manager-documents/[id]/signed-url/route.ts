import { NextResponse } from "next/server";
import { getReportsAuthContext, assertManagerFinancialsAccess } from "@/lib/reports/auth";
import { MANAGER_DOCUMENTS_BUCKET } from "@/lib/documents/manager-documents";

export const runtime = "nodejs";

// Signed URLs are short-lived; enough to open a preview or start a download.
const SIGNED_URL_TTL_SECONDS = 600; // 10 minutes

// GET /api/manager-documents/[id]/signed-url — return a short-lived signed URL
// for previewing/downloading a document the signed-in manager owns. The bucket
// is private; this is the ONLY way a document's bytes are reachable, and it is
// gated on an explicit ownership check before any URL is minted.
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const auth = await getReportsAuthContext({ preferRole: "manager" });
  if (!auth) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const gate = await assertManagerFinancialsAccess(auth);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const { data: row, error } = await auth.db
    .from("manager_documents")
    .select("storage_path, display_name, mime_type")
    .eq("id", id)
    .eq("manager_user_id", auth.userId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: "Document not found." }, { status: 404 });

  const download = new URL(req.url).searchParams.get("download") === "1";
  const { data: signed, error: signError } = await auth.db.storage
    .from(MANAGER_DOCUMENTS_BUCKET)
    .createSignedUrl(row.storage_path, SIGNED_URL_TTL_SECONDS, download ? { download: row.display_name } : undefined);

  if (signError || !signed?.signedUrl) {
    return NextResponse.json({ error: signError?.message ?? "Failed to sign URL." }, { status: 500 });
  }

  return NextResponse.json({ url: signed.signedUrl, mimeType: row.mime_type, displayName: row.display_name });
}
