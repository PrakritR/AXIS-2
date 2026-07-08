import { NextResponse } from "next/server";
import { getReportsAuthContext, assertManagerFinancialsAccess } from "@/lib/reports/auth";
import { UUID_PATTERN } from "@/lib/documents/manager-documents";
import { createManagerDocumentSignedUrl } from "@/lib/documents/document-signed-url.server";

export const runtime = "nodejs";

// GET /api/manager-documents/[id]/signed-url — return a short-lived signed URL
// for previewing/downloading a document the signed-in manager owns.
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const auth = await getReportsAuthContext({ preferRole: "manager" });
  if (!auth) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const gate = await assertManagerFinancialsAccess(auth);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  if (!UUID_PATTERN.test(id)) return NextResponse.json({ error: "Document not found." }, { status: 404 });

  const { data: row, error } = await auth.db
    .from("manager_documents")
    .select("storage_path, display_name, original_filename, mime_type")
    .eq("id", id)
    .eq("manager_user_id", auth.userId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: "Document not found." }, { status: 404 });

  const download = new URL(req.url).searchParams.get("download") === "1";
  const signed = await createManagerDocumentSignedUrl(auth.db, row, download);
  if ("error" in signed) return NextResponse.json({ error: signed.error }, { status: 500 });

  if (download) return NextResponse.redirect(signed.signedUrl, 302);
  return NextResponse.json({ url: signed.signedUrl, mimeType: row.mime_type, displayName: row.display_name });
}
