import { NextResponse } from "next/server";
import { isAdminUser } from "@/lib/auth/admin-preview";
import {
  fetchLeasesForManagerUser,
  managerCanAccessLeaseRecord,
  type LeaseScopeRecord,
} from "@/lib/auth/manager-lease-scope";
import { autoFileLeaseDocument, type AutoFileLeaseRow } from "@/lib/documents/document-auto-file-hooks.server";
import {
  leaseAllowsManagerDocumentEdits,
  leaseDocumentBody,
  leaseDocumentBodyChanged,
  replacesSignedLeaseDocument,
  rowHasAnySignature,
} from "@/lib/lease-execution-evidence";
import { sanitizeLeaseDocumentHtml, sanitizeManagerLeaseDocumentEdit } from "@/lib/lease-document-sanitizer";
import type { LeasePipelineRow } from "@/lib/lease-pipeline-storage";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

type RecordUser = { id: string; email?: string | null; role: string };

async function getUserContext() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const db = createSupabaseServiceRoleClient();
  const { data: profile } = await db.from("profiles").select("email, role").eq("id", user.id).maybeSingle();
  const admin = await isAdminUser(user.id);
  return {
    db,
    user: {
      id: user.id,
      email: (profile?.email ?? user.email ?? "").trim().toLowerCase(),
      role: admin ? "admin" : String(profile?.role ?? user.user_metadata?.role ?? "").toLowerCase(),
    } satisfies RecordUser,
  };
}

function normalizeRow(row: Record<string, unknown>, { sanitizeGeneratedHtml = false }: { sanitizeGeneratedHtml?: boolean } = {}) {
  const generatedHtml =
    sanitizeGeneratedHtml && typeof row.generatedHtml === "string" ? sanitizeLeaseDocumentHtml(row.generatedHtml) : row.generatedHtml;
  return { ...row, generatedHtml };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** row_data may carry synthetic/demo ids ("demo-resident") — only uuid-shaped
 *  values may reach the uuid column, else the whole upsert 500s. */
function asUuidOrNull(value: unknown): string | null {
  const v = typeof value === "string" ? value.trim() : "";
  return UUID_RE.test(v) ? v : null;
}

function buildUpsert(row: Record<string, unknown>) {
  return {
    id: row.id,
    manager_user_id: row.managerUserId ?? row.manager_user_id ?? null,
    resident_user_id: asUuidOrNull(row.residentUserId ?? row.resident_user_id),
    resident_email: row.residentEmail ?? row.resident_email ?? null,
    property_id: row.propertyId ?? row.property_id ?? null,
    status: row.bucket ?? row.status ?? null,
    row_data: row,
    updated_at: new Date().toISOString(),
  };
}

export async function GET() {
  try {
    const ctx = await getUserContext();
    if (!ctx) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    let records: LeaseScopeRecord[] = [];

    if (ctx.user.role === "admin") {
      const { data, error } = await ctx.db
        .from("portal_lease_pipeline_records")
        .select("id, row_data, updated_at")
        .order("updated_at", { ascending: false })
        .limit(500);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      records = (data ?? []) as LeaseScopeRecord[];
    } else if (ctx.user.role === "resident") {
      const { data, error } = await ctx.db
        .from("portal_lease_pipeline_records")
        .select("id, row_data, updated_at")
        .or(`resident_user_id.eq.${ctx.user.id},resident_email.eq.${ctx.user.email ?? ""}`)
        .order("updated_at", { ascending: false })
        .limit(500);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      records = (data ?? []) as LeaseScopeRecord[];
    } else {
      records = await fetchLeasesForManagerUser(ctx.db, ctx.user.id);
    }

    const rows = records.map((record) => {
      const row = (record.row_data && typeof record.row_data === "object" ? record.row_data : record) as Record<
        string,
        unknown
      >;
      return normalizeRow(row);
    });

    return NextResponse.json({ rows });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load records.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await getUserContext();
    if (!ctx) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const body = (await req.json()) as {
      action?: "upsert" | "delete" | "deleteIds" | "replace";
      id?: string;
      ids?: unknown[];
      row?: Record<string, unknown>;
      rows?: Record<string, unknown>[];
    };

    if (body.action === "delete" || body.action === "deleteIds") {
      const ids =
        body.action === "deleteIds"
          ? (Array.isArray(body.ids) ? body.ids.map(String) : [])
          : [body.id?.trim() ?? ""];
      if (ids.length === 0 || ids.some((id) => !id)) {
        return NextResponse.json({ error: "id required" }, { status: 400 });
      }
      for (const id of ids) {
        const { data: existing } = await ctx.db
          .from("portal_lease_pipeline_records")
          .select("id, manager_user_id, property_id")
          .eq("id", id)
          .limit(1);
        const record = (existing ?? [])[0] as LeaseScopeRecord | undefined;
        if (!record) continue;
        if (ctx.user.role !== "admin") {
          if (ctx.user.role === "resident") continue;
          const allowed = await managerCanAccessLeaseRecord(ctx.db, ctx.user.id, record, "delete");
          if (!allowed) continue;
        }
        await ctx.db.from("portal_lease_pipeline_records").delete().eq("id", id);
      }
      return NextResponse.json({ ok: true });
    }

    const rows = body.action === "replace" ? (body.rows ?? []) : body.row ? [body.row] : [];
    if (rows.length === 0) return NextResponse.json({ error: "row required" }, { status: 400 });

    for (const row of rows) {
      // Sanitization is deferred until we can compare against the stored body: rewriting an
      // UNCHANGED body on an unrelated save silently mutates a signed lease's evidence bytes,
      // and the certificate's hash describes those exact bytes.
      let normalized: Record<string, unknown> = normalizeRow(row);
      let record = buildUpsert(normalized);
      if (!record.id) return NextResponse.json({ error: "row id required" }, { status: 400 });
      const id = String(record.id);

      const { data: existing, error: existingError } = await ctx.db
        .from("portal_lease_pipeline_records")
        .select("id, manager_user_id, property_id, row_data")
        .eq("id", id)
        .limit(1);
      if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 });

      const recordExists = Array.isArray(existing) && existing.length > 0;
      const existingRecord = (existing ?? [])[0] as (LeaseScopeRecord & { row_data?: Record<string, unknown> }) | undefined;

      // The client edit helper restores P7 verbatim blocks too, but this is a
      // public route. Re-run that comparison against the stored source before
      // accepting a manager-authored replacement from devtools or another
      // client, then build the row_data payload from the restored value.
      const storedForSanitization = existingRecord?.row_data as LeasePipelineRow | undefined;
      const storedGeneratedHtml = typeof storedForSanitization?.generatedHtml === "string" ? storedForSanitization.generatedHtml : null;
      const incomingHasGeneratedHtml = Object.hasOwn(row, "generatedHtml");
      const incomingClearsSignatures = Boolean(
        storedForSanitization && rowHasAnySignature(storedForSanitization) && !rowHasAnySignature(normalized as LeasePipelineRow),
      );
      // EVERY body that differs from the stored one is sanitized, whatever else the write does.
      // Making this conditional on `!incomingClearsSignatures` meant a request that nulled the
      // signatures stored raw HTML, which removed the server half of the XSS defense and let a
      // manager drop every statutory clause with no trick at all. Only an exact echo of the
      // stored body is left alone, because rewriting an UNCHANGED body silently mutates the
      // evidence bytes a signed lease's certificate hash describes.
      const bodyDiffersFromStored =
        typeof row.generatedHtml === "string" && row.generatedHtml !== storedGeneratedHtml;
      const editableAgainstStored = Boolean(storedGeneratedHtml) && !incomingClearsSignatures;
      if (bodyDiffersFromStored && !editableAgainstStored) {
        const cleaned = sanitizeLeaseDocumentHtml(row.generatedHtml as string);
        if (cleaned !== row.generatedHtml) {
          normalized = { ...normalized, generatedHtml: cleaned };
          record = buildUpsert(normalized);
        }
      }
      if (storedGeneratedHtml && incomingHasGeneratedHtml && !incomingClearsSignatures) {
        if (typeof row.generatedHtml !== "string") {
          const materializingTemplatePdf = Boolean(
            storedForSanitization?.templateDocumentUrl && (normalized.managerUploadedPdf as { dataUrl?: unknown } | undefined)?.dataUrl,
          );
          if (!materializingTemplatePdf) {
            return NextResponse.json({ error: "A generated lease body cannot be removed through this save path." }, { status: 400 });
          }
        } else if (row.generatedHtml !== storedGeneratedHtml) {
          // Only a body that actually CHANGED is a manager edit, and only that is sanitized.
          // Echoing the stored body back is left byte-identical so an unrelated save cannot
          // rewrite an executed lease underneath its own signature hash.
          const sanitized = sanitizeManagerLeaseDocumentEdit(storedGeneratedHtml, row.generatedHtml);
          if (!sanitized.ok) return NextResponse.json({ error: sanitized.error }, { status: 400 });
          normalized = { ...normalized, generatedHtml: sanitized.html };
          record = buildUpsert(normalized);
        }
      }

      // Evidence integrity, authoritative copy. The client store runs the same
      // predicate, but it runs IN the browser against a store the browser owns,
      // so it is advisory: this route is where a signed lease's document body
      // actually becomes immutable. Refuse rather than silently restore, because a
      // legitimate client never replaces the body of a row that still carries a
      // signature, so a request that does is either tampering or a bug, and
      // both deserve to surface. Admins are not exempt; the point is that the
      // executed text cannot change, not that only strangers may not change it.
      const storedRow = existingRecord?.row_data as LeasePipelineRow | undefined;
      if (storedRow && replacesSignedLeaseDocument(storedRow, normalized as unknown as LeasePipelineRow)) {
        return NextResponse.json(
          { error: "This lease already carries a signature; its document cannot be replaced." },
          { status: 409 },
        );
      }

      // P4's signature check above is authoritative once signing begins. This
      // companion check closes the earlier window too: a manager cannot use the
      // public route to replace a document after it was sent to the resident,
      // even before the first signature lands. Superseding flows deliberately
      // clear signatures, and externally signed rows may still receive their
      // previously absent body, matching P4's documented exemptions.
      const nextRow = normalized as unknown as LeasePipelineRow;
      const documentChanged = Boolean(storedRow && leaseDocumentBodyChanged(storedRow, nextRow));
      if (documentChanged && ctx.user.role === "resident") {
        return NextResponse.json({ error: "Only a manager can replace a lease document." }, { status: 403 });
      }
      if (storedRow && leaseDocumentBodyChanged(storedRow, nextRow) && !leaseAllowsManagerDocumentEdits(storedRow)) {
        const clearingSignatures = rowHasAnySignature(storedRow) && !rowHasAnySignature(nextRow);
        const previousBody = leaseDocumentBody(storedRow);
        const filingExternalBody = storedRow.externallySignedLease && !previousBody.html && !previousBody.pdf;
        if (!clearingSignatures && !filingExternalBody) {
          return NextResponse.json(
            { error: "This lease is no longer in manager review; its document cannot be replaced." },
            { status: 409 },
          );
        }
      }

      if (storedGeneratedHtml && typeof nextRow.generatedHtml !== "string" && !incomingClearsSignatures) {
        const materializingTemplatePdf = Boolean(storedRow?.templateDocumentUrl && nextRow.managerUploadedPdf?.dataUrl);
        if (!materializingTemplatePdf) {
          return NextResponse.json({ error: "A generated lease body cannot be removed through this save path." }, { status: 400 });
        }
      }

      // A client may submit this generic row endpoint directly, so a generated
      // body replacement must still carry the same exact version increment the
      // dedicated edit path performs. The route stamps the server-confirmed
      // generation time rather than trusting a browser-provided timestamp.
      if (
        storedRow &&
        documentChanged &&
        !incomingClearsSignatures &&
        typeof storedRow.generatedHtml === "string" &&
        typeof nextRow.generatedHtml === "string"
      ) {
        const expectedVersion = (storedRow.versionNumber ?? storedRow.pdfVersion ?? 1) + 1;
        if (nextRow.versionNumber !== expectedVersion || nextRow.pdfVersion !== expectedVersion) {
          return NextResponse.json({ error: "Replacing a generated lease requires the next document version." }, { status: 400 });
        }
        const editedAtIso = new Date().toISOString();
        normalized = {
          ...normalized,
          generatedAtIso: editedAtIso,
          // This public route cannot trust a browser-provided "generation"
          // marker. Every in-place generated HTML replacement is conservatively
          // treated as a manager edit, so automatic regeneration never erases it.
          managerDocumentEditedAtIso: editedAtIso,
          managerDocumentRegenerationRequiredAtIso: null,
        };
        record = buildUpsert(normalized);
      }

      if (recordExists && ctx.user.role !== "admin") {
        if (ctx.user.role === "resident") {
          const { data: visible } = await ctx.db
            .from("portal_lease_pipeline_records")
            .select("id")
            .eq("id", id)
            .or(`resident_user_id.eq.${ctx.user.id},resident_email.eq.${ctx.user.email ?? ""}`)
            .limit(1);
          if (!Array.isArray(visible) || visible.length === 0) {
            return NextResponse.json({ error: "Record not found." }, { status: 404 });
          }
        } else {
          const allowed = existingRecord
            ? await managerCanAccessLeaseRecord(ctx.db, ctx.user.id, existingRecord, "edit")
            : false;
          if (!allowed) return NextResponse.json({ error: "Record not found." }, { status: 404 });
          // Preserve server-trusted ownership on update.
          record = {
            ...record,
            manager_user_id: existingRecord?.manager_user_id ?? ctx.user.id,
          };
        }
      }

      if (!recordExists && ctx.user.role !== "admin") {
        record = { ...record, manager_user_id: ctx.user.id };
      }

      const { error } = await ctx.db.from("portal_lease_pipeline_records").upsert(record, { onConflict: "id" });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      // Auto-file the signed lease into the document library on the transition
      // into fully-signed (once), so repeated syncs of the same row don't
      // duplicate. No-op unless the manager opted the "lease" category in.
      const previouslySigned = Boolean((existingRecord?.row_data as { fullySignedAt?: unknown } | undefined)?.fullySignedAt);
      const nowSigned = Boolean((normalized as { fullySignedAt?: unknown }).fullySignedAt);
      if (nowSigned && !previouslySigned) {
        await autoFileLeaseDocument(ctx.db, normalized as AutoFileLeaseRow).catch(() => undefined);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to save records.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
