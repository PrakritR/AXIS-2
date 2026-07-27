import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { linkedPropertyIdsForModule } from "@/lib/auth/co-manager-module-scope";
import { normalizeApplicationAxisId } from "@/lib/manager-applications-storage";
import {
  applicationPhotoExtForMime,
  isAllowedApplicationPhotoMime,
  MAX_APPLICATION_PHOTO_BYTES,
} from "@/lib/rental-application/application-photos";
import type { ApplicationPhotoSlot } from "@/lib/rental-application/types";

/**
 * Server-only helpers for the applicant photo bucket. The authorization
 * predicate ({@link canActorAccessApplicationPhoto}) is a pure function so the
 * cross-manager isolation boundary can be proven without a live database — see
 * `tests/unit/application-photo-access.test.ts`. All Storage access runs through
 * the service-role client inside the API routes; nothing here trusts an owner id
 * supplied by the client.
 */

export const APPLICATION_DOCUMENTS_BUCKET = "application-documents";

type ServiceClient = SupabaseClient;

/** Ownership facts read from the stored application row (never from the client). */
export type StoredApplicationOwnership = {
  managerUserId: string | null;
  propertyId: string | null;
  assignedPropertyId: string | null;
  residentEmail: string | null;
};

/**
 * Who is asking. `manager` carries the exact set of property ids they may reach
 * today (own + co-manager-linked). `resident`/`guest` carry an email that must
 * match the application's stored applicant email. Reads never accept `guest`.
 */
export type ApplicationPhotoActor =
  | { kind: "admin" }
  | { kind: "manager"; userId: string; accessiblePropertyIds: ReadonlySet<string> }
  | { kind: "resident"; email: string }
  | { kind: "guest"; email: string };

const norm = (value: string | null | undefined): string => (value ?? "").trim().toLowerCase();

/**
 * The single security decision: may this actor touch this application's photos?
 * Mirrors `fetchApplicationsForManagerUser` — a manager is in only when the
 * application is attributed to them OR its property is one they can reach today.
 * This is what stops manager B from reading manager A's applicant's ID photo.
 */
export function canActorAccessApplicationPhoto(
  actor: ApplicationPhotoActor,
  app: StoredApplicationOwnership,
): boolean {
  if (actor.kind === "admin") return true;

  if (actor.kind === "resident" || actor.kind === "guest") {
    const applicantEmail = norm(app.residentEmail);
    return applicantEmail.length > 0 && applicantEmail === norm(actor.email);
  }

  // manager / owner / pro
  if (app.managerUserId && app.managerUserId === actor.userId) return true;
  const propertyId = (app.propertyId ?? "").trim();
  const assignedPropertyId = (app.assignedPropertyId ?? "").trim();
  if (propertyId && actor.accessiblePropertyIds.has(propertyId)) return true;
  if (assignedPropertyId && actor.accessiblePropertyIds.has(assignedPropertyId)) return true;
  return false;
}

/**
 * Property ids a manager may reach TODAY: every property they own now, unioned
 * with co-manager-linked properties granting `applications` or `residents`.
 * Same union `fetchApplicationsForManagerUser` uses to decide visibility.
 */
export async function accessiblePropertyIdsForManager(db: ServiceClient, userId: string): Promise<Set<string>> {
  const [appIds, resIds, owned] = await Promise.all([
    linkedPropertyIdsForModule(db, userId, "applications"),
    linkedPropertyIdsForModule(db, userId, "residents"),
    db.from("manager_property_records").select("id").eq("manager_user_id", userId),
  ]);
  const ids = new Set<string>();
  for (const property of owned.data ?? []) {
    if (property?.id) ids.add(property.id);
  }
  for (const id of appIds) ids.add(id);
  for (const id of resIds) ids.add(id);
  return ids;
}

/**
 * Storage folder key for an application — normalized axis id, filesystem-safe.
 * Uppercased so it is CASE-CANONICAL: `normalizeApplicationAxisId` preserves the
 * case of an already-prefixed id, so the id captured at upload time and the
 * stored `row.id` used at delete time could otherwise differ by case and point
 * at two folders — which, given deletion is the only thing that reclaims bytes,
 * would orphan the photos forever. Two spellings of one axis id map here to one
 * folder.
 */
export function applicationPhotoFolderKey(applicationId: string): string {
  const normalized = normalizeApplicationAxisId(applicationId) || applicationId.trim();
  return normalized.toUpperCase().replace(/[^A-Za-z0-9_-]/g, "_") || "unknown";
}

/** Unguessable object path: `application/<folder>/<slot>-<ts>-<uuid>.<ext>`. */
export function buildApplicationPhotoPath(applicationId: string, slot: ApplicationPhotoSlot, ext: string): string {
  const safeExt = ext.replace(/[^a-z0-9]/gi, "").toLowerCase() || "bin";
  return `application/${applicationPhotoFolderKey(applicationId)}/${slot}-${Date.now()}-${randomUUID()}.${safeExt}`;
}

/** Guard that a stored path really belongs to this application's folder. */
export function isPathInApplicationFolder(path: string, applicationId: string): boolean {
  return path.startsWith(`application/${applicationPhotoFolderKey(applicationId)}/`);
}

export type ParsedApplicationPhoto = { ok: true; mime: string; ext: string; bytes: Buffer } | { ok: false; error: string };

/**
 * Decode + validate a `data:` URL for a slot. Enforces the MIME allowlist and
 * the size cap server-side so a client that skips its own check cannot store a
 * disallowed or oversized object.
 */
export function parseApplicationPhotoDataUrl(dataUrl: unknown, slot: ApplicationPhotoSlot): ParsedApplicationPhoto {
  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:")) {
    return { ok: false, error: "A file is required." };
  }
  const commaIndex = dataUrl.indexOf(",");
  if (commaIndex < 0) return { ok: false, error: "Invalid file data." };
  const header = dataUrl.slice(5, commaIndex); // strip "data:"
  const base64 = dataUrl.slice(commaIndex + 1);
  const mime = header.split(";")[0]?.trim().toLowerCase() ?? "";
  if (!isAllowedApplicationPhotoMime(mime, slot)) {
    return { ok: false, error: "That file type isn’t supported. Use a JPG, PNG, or PDF." };
  }
  const ext = applicationPhotoExtForMime(mime);
  if (!ext) return { ok: false, error: "That file type isn’t supported." };
  let bytes: Buffer;
  try {
    bytes = Buffer.from(base64, "base64");
  } catch {
    return { ok: false, error: "Invalid file data." };
  }
  if (bytes.length === 0) return { ok: false, error: "The file is empty." };
  if (bytes.length > MAX_APPLICATION_PHOTO_BYTES) {
    return { ok: false, error: "That file is too large. Keep it under 15 MB." };
  }
  return { ok: true, mime, ext, bytes };
}

/** Content-type for a downloaded object based on its extension. */
export function contentTypeForApplicationPhotoPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  switch (ext) {
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "heic":
      return "image/heic";
    case "heif":
      return "image/heif";
    case "pdf":
      return "application/pdf";
    default:
      return "image/jpeg";
  }
}

/** Best-effort removal of every object under an application's folder (hard delete). */
export async function reclaimApplicationPhotos(db: ServiceClient, applicationId: string): Promise<void> {
  try {
    const folder = `application/${applicationPhotoFolderKey(applicationId)}`;
    const { data, error } = await db.storage.from(APPLICATION_DOCUMENTS_BUCKET).list(folder, { limit: 1000 });
    if (error || !data || data.length === 0) return;
    const paths = data.map((entry) => `${folder}/${entry.name}`);
    await db.storage.from(APPLICATION_DOCUMENTS_BUCKET).remove(paths);
  } catch {
    // Storage cleanup is best-effort; a leftover object is never user-visible
    // (the row that referenced it is gone) and is reclaimed by later sweeps.
  }
}
