import { NextResponse } from "next/server";
import { getReportsAuthContext, assertResidentFinancialsAccess } from "@/lib/reports/auth";
import { getSharedDocumentForResident } from "@/lib/documents/document-access";
import { createManagerDocumentSignedUrl } from "@/lib/documents/document-signed-url.server";
import { UUID_PATTERN } from "@/lib/documents/manager-documents";

export const runtime = "nodejs";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!UUID_PATTERN.test(id)) return NextResponse.json({ error: "Document not found." }, { status: 404 });

  const auth = await getReportsAuthContext({ preferRole: "resident" });
  if (!auth) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const gate = await assertResidentFinancialsAccess(auth);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  try {
    const row = await getSharedDocumentForResident(auth.db, id, auth.userId, auth.email);
    if (!row) return NextResponse.json({ error: "Document not found." }, { status: 404 });

    const download = new URL(req.url).searchParams.get("download") === "1";
    const signed = await createManagerDocumentSignedUrl(auth.db, row, download);
    if ("error" in signed) return NextResponse.json({ error: signed.error }, { status: 500 });

    if (download) return NextResponse.redirect(signed.signedUrl, 302);
    return NextResponse.json({ url: signed.signedUrl, mimeType: row.mime_type, displayName: row.display_name });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to open document." }, { status: 500 });
  }
}
