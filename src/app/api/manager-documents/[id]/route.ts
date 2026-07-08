import { NextResponse } from "next/server";
import { getReportsAuthContext, assertManagerFinancialsAccess } from "@/lib/reports/auth";
import {
  DOCUMENT_SELECT_COLUMNS,
  isDocumentCategory,
  isDocumentVisibility,
  mapDocumentRow,
  sanitizeDisplayName,
  UUID_PATTERN,
  validateDocumentVisibilityScope,
  type ManagerDocumentRow,
  type ManagerDocumentVisibility,
} from "@/lib/documents/manager-documents";
import { managerOwnsVendorDirectoryRow, resolveResidentUserIdByEmail } from "@/lib/documents/document-scope.server";
import { notifyDocumentShared } from "@/lib/documents/document-share-notify.server";
import { parseExpiresAtInput } from "@/lib/documents/document-expiration";

export const runtime = "nodejs";

function strField(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

// PATCH /api/manager-documents/[id] — rename, recategorize, or update sharing.
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const auth = await getReportsAuthContext({ preferRole: "manager" });
  if (!auth) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const gate = await assertManagerFinancialsAccess(auth);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  if (!UUID_PATTERN.test(id)) return NextResponse.json({ error: "Document not found." }, { status: 404 });

  const { data: existing, error: readError } = await auth.db
    .from("manager_documents")
    .select(DOCUMENT_SELECT_COLUMNS)
    .eq("id", id)
    .eq("manager_user_id", auth.userId)
    .is("deleted_at", null)
    .maybeSingle();
  if (readError) return NextResponse.json({ error: readError.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: "Document not found." }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (typeof body.displayName === "string") update.display_name = sanitizeDisplayName(body.displayName);
  if (typeof body.category === "string" && isDocumentCategory(body.category)) update.category = body.category;

  const prevRow = existing as ManagerDocumentRow;
  const prevVisibility = isDocumentVisibility(prevRow.visibility) ? prevRow.visibility : "manager";

  let nextVisibility: ManagerDocumentVisibility = prevVisibility;
  if (typeof body.visibility === "string" && isDocumentVisibility(body.visibility)) {
    nextVisibility = body.visibility;
    update.visibility = nextVisibility;
  }

  const residentUserId = strField(body.residentUserId);
  const residentEmailRaw = strField(body.residentEmail);
  const residentEmail =
    residentEmailRaw === undefined ? undefined : residentEmailRaw ? residentEmailRaw.toLowerCase() : null;
  const vendorId = strField(body.vendorId);

  if (residentUserId !== undefined) update.resident_user_id = residentUserId;
  if (residentEmail !== undefined) update.resident_email = residentEmail;
  if (vendorId !== undefined) update.vendor_id = vendorId;

  if (body.expiresAt === null || body.expiresAt === "") {
    update.expires_at = null;
  } else if (typeof body.expiresAt === "string") {
    const parsed = parseExpiresAtInput(body.expiresAt);
    if (!parsed) return NextResponse.json({ error: "expiresAt must be YYYY-MM-DD." }, { status: 400 });
    update.expires_at = parsed;
  }

  if (nextVisibility === "manager") {
    update.resident_user_id = null;
    update.resident_email = null;
    update.vendor_id = null;
  }

  const scopeError = validateDocumentVisibilityScope({
    visibility: nextVisibility,
    residentUserId: (update.resident_user_id as string | null | undefined) ?? prevRow.resident_user_id,
    residentEmail: (update.resident_email as string | null | undefined) ?? prevRow.resident_email,
    vendorId: (update.vendor_id as string | null | undefined) ?? prevRow.vendor_id,
  });
  if (scopeError) return NextResponse.json({ error: scopeError }, { status: 400 });

  const effectiveVendorId = (update.vendor_id as string | null | undefined) ?? prevRow.vendor_id;
  if (nextVisibility === "vendor" && effectiveVendorId) {
    const owns = await managerOwnsVendorDirectoryRow(auth.db, auth.userId, effectiveVendorId);
    if (!owns) return NextResponse.json({ error: "Vendor not found." }, { status: 404 });
  }

  let effectiveResidentUserId =
    (update.resident_user_id as string | null | undefined) ?? prevRow.resident_user_id;
  const effectiveResidentEmail =
    (update.resident_email as string | null | undefined) ?? prevRow.resident_email;
  if (nextVisibility === "resident" && !effectiveResidentUserId && effectiveResidentEmail) {
    effectiveResidentUserId = await resolveResidentUserIdByEmail(auth.db, effectiveResidentEmail);
    if (effectiveResidentUserId) update.resident_user_id = effectiveResidentUserId;
  }

  if (Object.keys(update).length === 1) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

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

  const notify =
    body.notifyOnShare !== false &&
    prevVisibility === "manager" &&
    (nextVisibility === "resident" || nextVisibility === "vendor");

  if (notify && (nextVisibility === "resident" || nextVisibility === "vendor")) {
    const mapped = mapDocumentRow(data as ManagerDocumentRow);
    const { data: profile } = await auth.db.from("profiles").select("full_name, email").eq("id", auth.userId).maybeSingle();
    await notifyDocumentShared(auth.db, {
      managerUserId: auth.userId,
      managerEmail: auth.email,
      managerName: String(profile?.full_name ?? "Your property manager"),
      documentId: mapped.id,
      documentName: mapped.displayName,
      visibility: nextVisibility,
      residentUserId: mapped.scope.residentUserId,
      residentEmail: mapped.scope.residentEmail,
      vendorId: mapped.scope.vendorId,
    });
  }

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
