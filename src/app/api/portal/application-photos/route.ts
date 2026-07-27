import { NextResponse } from "next/server";
import type { DemoApplicantRow } from "@/data/demo-portal";
import { isAdminUser } from "@/lib/auth/admin-preview";
import { normalizeApplicationAxisId } from "@/lib/manager-applications-storage";
import { isApplicationPhotoSlot } from "@/lib/rental-application/application-photos";
import {
  accessiblePropertyIdsForManager,
  APPLICATION_DOCUMENTS_BUCKET,
  buildApplicationPhotoPath,
  canActorAccessApplicationPhoto,
  contentTypeForApplicationPhotoPath,
  isPathInApplicationFolder,
  parseApplicationPhotoDataUrl,
  type ApplicationPhotoActor,
  type StoredApplicationOwnership,
} from "@/lib/rental-application/application-photos.server";
import type { ApplicationPhotoAttachment, ApplicationPhotoSlot } from "@/lib/rental-application/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service";

export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/;

type ServiceClient = ReturnType<typeof createSupabaseServiceRoleClient>;

type StoredApplicationRow = {
  recordId: string;
  application: Record<string, unknown> | null;
  ownership: StoredApplicationOwnership;
  bucket: string | null;
};

function idVariants(id: string): string[] {
  const trimmed = id.trim();
  const normalized = normalizeApplicationAxisId(trimmed);
  return [...new Set([trimmed, trimmed.toUpperCase(), normalized, normalized.toUpperCase()].filter(Boolean))];
}

/** Load the stored application row (and its ownership facts) by axis id. */
async function loadApplicationRow(db: ServiceClient, applicationId: string): Promise<StoredApplicationRow | null> {
  const { data, error } = await db
    .from("manager_application_records")
    .select("id, row_data, manager_user_id, property_id, assigned_property_id, resident_email")
    .in("id", idVariants(applicationId))
    .limit(1);
  if (error || !data || data.length === 0) return null;
  const record = data[0];
  const row = (record.row_data ?? {}) as Partial<DemoApplicantRow>;
  const application =
    row.application && typeof row.application === "object" ? (row.application as Record<string, unknown>) : null;
  return {
    recordId: record.id,
    application,
    bucket: typeof row.bucket === "string" ? row.bucket : null,
    ownership: {
      managerUserId: (record.manager_user_id ?? row.managerUserId ?? null) as string | null,
      propertyId: (record.property_id ?? row.propertyId ?? null) as string | null,
      assignedPropertyId: (record.assigned_property_id ?? row.assignedPropertyId ?? null) as string | null,
      residentEmail: (record.resident_email ?? row.email ?? null) as string | null,
    },
  };
}

type ResolvedSession =
  | { kind: "admin" }
  | { kind: "manager"; userId: string; email: string }
  | { kind: "resident"; email: string }
  | { kind: "none" };

/** Resolve who is calling from the authenticated session (never from the body). */
async function resolveSession(db: ServiceClient): Promise<ResolvedSession> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "none" };
  if (await isAdminUser(user.id)) return { kind: "admin" };
  const { data: profile } = await db.from("profiles").select("email, role").eq("id", user.id).maybeSingle();
  const role = String(profile?.role ?? user.user_metadata?.role ?? "").toLowerCase();
  const email = (profile?.email ?? user.email ?? "").trim().toLowerCase();
  if (role === "manager" || role === "owner" || role === "pro") return { kind: "manager", userId: user.id, email };
  if (role === "resident") return { kind: "resident", email };
  // A signed-in user with some other role still owns applications by their email.
  if (email) return { kind: "resident", email };
  return { kind: "none" };
}

/** The authenticated session's email, if any (for the applicant-by-email fallback). */
function sessionEmail(session: ResolvedSession): string {
  return session.kind === "manager" || session.kind === "resident" ? session.email : "";
}

/**
 * A signed-in user is the APPLICANT of this row when their authenticated email
 * matches the stored applicant email — regardless of their primary `profiles.role`.
 * This is the safe fallback for multi-role accounts (a manager-primary login
 * applying as a resident): it only ever GRANTS access to one's own application by
 * one's own authenticated email, never widening cross-tenant reach.
 */
function isApplicantBySessionEmail(session: ResolvedSession, ownership: StoredApplicationOwnership): boolean {
  const email = sessionEmail(session);
  if (!email) return false;
  return canActorAccessApplicationPhoto({ kind: "resident", email }, ownership);
}

/** Build the access actor. `allowGuest` is true for writes (uploads/removes) only. */
async function buildActor(
  db: ServiceClient,
  session: ResolvedSession,
  guestEmail: string | null,
  allowGuest: boolean,
): Promise<ApplicationPhotoActor | null> {
  if (session.kind === "admin") return { kind: "admin" };
  if (session.kind === "manager") {
    const accessiblePropertyIds = await accessiblePropertyIdsForManager(db, session.userId);
    return { kind: "manager", userId: session.userId, accessiblePropertyIds };
  }
  if (session.kind === "resident") return { kind: "resident", email: session.email };
  // Unauthenticated. Only WRITES may proceed as a guest. The claimed email is
  // used to match an EXISTING row; a guest who has not yet typed their email
  // (the ID-photo capture sits above the email field on step 4) can still start
  // a NEW application's upload — the bytes are unreferenced until their own
  // client attaches the returned path, so this never exposes anyone else's data.
  if (allowGuest) {
    return { kind: "guest", email: guestEmail && EMAIL_RE.test(guestEmail) ? guestEmail : "" };
  }
  return null;
}

/**
 * Authorize a write (upload/remove). For a NEW application with no stored row
 * yet, the applicant is mid-creation and there is nothing to own — allow it
 * (identical trust to the guest application upsert; unreferenced bytes only).
 * For an EXISTING row, the actor must pass the ownership check; a guest
 * additionally may only touch a still-pending application, and an email-less
 * guest fails the email match, so they can never reach an existing applicant's
 * photos.
 */
function authorizeWrite(
  actor: ApplicationPhotoActor,
  row: StoredApplicationRow | null,
  session: ResolvedSession,
): boolean {
  // No stored row yet: the applicant is mid-creation. The bytes are unreferenced
  // until their own client attaches the returned path, so this never exposes
  // anyone else's data — allow it (matches the guest application-upsert trust).
  if (!row) return true;
  if (actor.kind === "guest" && row.bucket && row.bucket !== "pending") return false;
  return canActorAccessApplicationPhoto(actor, row.ownership) || isApplicantBySessionEmail(session, row.ownership);
}

function sanitizeFileName(name: unknown, slot: ApplicationPhotoSlot, ext: string): string {
  if (typeof name === "string" && name.trim()) {
    return name.trim().replace(/[^\w.\-() ]+/g, "_").slice(0, 120);
  }
  return `${slot}.${ext}`;
}

// ---------------------------------------------------------------------------
// POST — upload a photo, returning the reference the client stores on the form.
// ---------------------------------------------------------------------------
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      applicationId?: string;
      slot?: string;
      dataUrl?: string;
      fileName?: string;
      email?: string;
    };
    const applicationId = body.applicationId?.trim() ?? "";
    if (!applicationId) return NextResponse.json({ error: "applicationId required." }, { status: 400 });
    if (!isApplicationPhotoSlot(body.slot)) return NextResponse.json({ error: "Invalid slot." }, { status: 400 });
    const slot: ApplicationPhotoSlot = body.slot;

    const parsed = parseApplicationPhotoDataUrl(body.dataUrl, slot);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

    const db = createSupabaseServiceRoleClient();
    const session = await resolveSession(db);
    const guestEmail = (body.email ?? "").trim().toLowerCase() || null;
    const actor = await buildActor(db, session, guestEmail, true);
    if (!actor) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const row = await loadApplicationRow(db, applicationId);
    if (!authorizeWrite(actor, row, session)) {
      return NextResponse.json({ error: "You can only attach photos to your own application." }, { status: 403 });
    }

    const storagePath = buildApplicationPhotoPath(applicationId, slot, parsed.ext);
    const { error: uploadError } = await db.storage
      .from(APPLICATION_DOCUMENTS_BUCKET)
      .upload(storagePath, parsed.bytes, { contentType: parsed.mime, upsert: false });
    if (uploadError) {
      return NextResponse.json({ error: "Upload failed. Please try again." }, { status: 502 });
    }

    const attachment: ApplicationPhotoAttachment = {
      storagePath,
      fileName: sanitizeFileName(body.fileName, slot, parsed.ext),
      mimeType: parsed.mime,
      sizeBytes: parsed.bytes.length,
      uploadedAt: new Date().toISOString(),
    };
    return NextResponse.json({ attachment });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Upload failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// GET — stream a stored photo. The path is resolved from the STORED row, never
// the client, so a caller can only ever fetch a photo genuinely attached to an
// application they are authorized to see. Guests are not served (they rely on
// the in-session in-memory preview). Denials return 404 to avoid leaking which
// applications exist.
// ---------------------------------------------------------------------------
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const applicationId = url.searchParams.get("applicationId")?.trim() ?? "";
    const slotParam = url.searchParams.get("slot") ?? "";
    const index = Number.parseInt(url.searchParams.get("index") ?? "0", 10) || 0;
    if (!applicationId || !isApplicationPhotoSlot(slotParam)) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    const slot: ApplicationPhotoSlot = slotParam;

    const db = createSupabaseServiceRoleClient();
    const session = await resolveSession(db);
    const actor = await buildActor(db, session, null, false);
    if (!actor) return NextResponse.json({ error: "Not found." }, { status: 404 });

    const row = await loadApplicationRow(db, applicationId);
    if (
      !row ||
      !row.application ||
      !(canActorAccessApplicationPhoto(actor, row.ownership) || isApplicantBySessionEmail(session, row.ownership))
    ) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }

    const attachment = resolveAttachment(row.application, slot, index);
    const storagePath = attachment?.storagePath?.trim();
    if (!storagePath || !isPathInApplicationFolder(storagePath, applicationId)) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }

    const { data, error } = await db.storage.from(APPLICATION_DOCUMENTS_BUCKET).download(storagePath);
    if (error || !data) return NextResponse.json({ error: "Not found." }, { status: 404 });
    const bytes = Buffer.from(await data.arrayBuffer());
    return new NextResponse(bytes, {
      headers: {
        "Content-Type": contentTypeForApplicationPhotoPath(storagePath),
        "Content-Disposition": `inline; filename="${(attachment?.fileName ?? "photo").replace(/"/g, "")}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
}

// ---------------------------------------------------------------------------
// DELETE — remove a stored object (applicant remove / retake). The caller names
// a storagePath; it must live under the application's own folder and the actor
// must be authorized to write to that application.
// ---------------------------------------------------------------------------
export async function DELETE(req: Request) {
  try {
    const body = (await req.json()) as { applicationId?: string; storagePath?: string; email?: string };
    const applicationId = body.applicationId?.trim() ?? "";
    const storagePath = body.storagePath?.trim() ?? "";
    if (!applicationId || !storagePath) {
      return NextResponse.json({ error: "applicationId and storagePath required." }, { status: 400 });
    }
    if (!isPathInApplicationFolder(storagePath, applicationId)) {
      return NextResponse.json({ error: "Invalid path." }, { status: 400 });
    }

    const db = createSupabaseServiceRoleClient();
    const session = await resolveSession(db);
    const guestEmail = (body.email ?? "").trim().toLowerCase() || null;
    const actor = await buildActor(db, session, guestEmail, true);
    if (!actor) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

    const row = await loadApplicationRow(db, applicationId);
    if (!authorizeWrite(actor, row, session)) {
      return NextResponse.json({ error: "Not allowed." }, { status: 403 });
    }

    const { error } = await db.storage.from(APPLICATION_DOCUMENTS_BUCKET).remove([storagePath]);
    if (error) return NextResponse.json({ error: "Could not remove the file." }, { status: 502 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Delete failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function resolveAttachment(
  application: Record<string, unknown>,
  slot: ApplicationPhotoSlot,
  index: number,
): ApplicationPhotoAttachment | null {
  if (slot === "income") {
    const list = application.incomeProofPhotos;
    if (!Array.isArray(list)) return null;
    const entry = list[index];
    return isAttachment(entry) ? entry : null;
  }
  const key = slot === "idFront" ? "idPhotoFront" : "idPhotoBack";
  const entry = application[key];
  return isAttachment(entry) ? entry : null;
}

function isAttachment(value: unknown): value is ApplicationPhotoAttachment {
  return (
    !!value &&
    typeof value === "object" &&
    typeof (value as { storagePath?: unknown }).storagePath === "string"
  );
}
