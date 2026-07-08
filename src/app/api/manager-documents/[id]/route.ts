import { NextResponse } from "next/server";
import { getReportsAuthContext, assertManagerFinancialsAccess } from "@/lib/reports/auth";
import {
  DOCUMENT_SELECT_COLUMNS,
  isDocumentCategory,
  mapDocumentRow,
  sanitizeDisplayName,
  UUID_PATTERN,
  type ManagerDocumentRow,
} from "@/lib/documents/manager-documents";

export const runtime = "nodejs";

// PATCH /api/manager-documents/[id] — rename (and optionally recategorize) a
// document the signed-in manager owns.
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const auth = await getReportsAuthContext({ preferRole: "manager" });
  if (!auth) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const gate = await assertManagerFinancialsAccess(auth);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  if (!UUID_PATTERN.test(id)) return NextResponse.json({ error: "Document not found." }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as { displayName?: unknown; category?: unknown };
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.displayName === "string") {
    const cleaned = sanitizeDisplayName(body.displayName, "");
    if (!cleaned) return NextResponse.json({ error: "Name cannot be empty." }, { status: 400 });
    update.display_name = cleaned;
  }
  if (typeof body.category === "string" && isDocumentCategory(body.category)) update.category = body.category;

  if (Object.keys(update).length === 1) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  // Ownership is enforced by the manager_user_id filter: a mismatched manager's
  // id updates zero rows and gets a 404.
  const { data, error } = await auth.db
    .from("manager_documents")
    .update(update)
    .eq("id", id)
    .eq("manager_user_id", auth.userId)
    .is("deleted_at", null)
    .select(DOCUMENT_SELECT_COLUMNS)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Document not found." }, { status: 404 });
  return NextResponse.json({ document: mapDocumentRow(data as ManagerDocumentRow) });
}

// DELETE /api/manager-documents/[id] — soft-delete (sets deleted_at). The
// storage object is intentionally kept so a future "restore"/versioning flow
// can recover it; hard purge is out of scope this phase.
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const auth = await getReportsAuthContext({ preferRole: "manager" });
  if (!auth) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const gate = await assertManagerFinancialsAccess(auth);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  if (!UUID_PATTERN.test(id)) return NextResponse.json({ error: "Document not found." }, { status: 404 });

  const { data, error } = await auth.db
    .from("manager_documents")
    .update({ deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("manager_user_id", auth.userId)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Document not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
