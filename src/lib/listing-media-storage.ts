import { isDemoModeActive } from "@/lib/demo/demo-session";
import type { ManagerListingSubmissionV1 } from "@/lib/manager-listing-submission";

/** Storage bucket every listing photo/video/floor plan/lease template is uploaded to. */
export const LISTING_MEDIA_BUCKET = "listing-photos";

const PUBLIC_OBJECT_MARKER = `/storage/v1/object/public/${LISTING_MEDIA_BUCKET}/`;

/**
 * Object path inside `listing-photos` for a public storage URL, or null when the
 * URL points somewhere else (a still-unuploaded `data:` URL, a demo asset, or a
 * third-party link a manager pasted in).
 */
export function listingMediaObjectPath(url: string | null | undefined): string | null {
  const raw = url?.trim();
  if (!raw) return null;
  const at = raw.indexOf(PUBLIC_OBJECT_MARKER);
  if (at === -1) return null;
  const path = raw.slice(at + PUBLIC_OBJECT_MARKER.length).split(/[?#]/)[0] ?? "";
  const decoded = (() => {
    try {
      return decodeURIComponent(path);
    } catch {
      return path;
    }
  })();
  return decoded.trim() || null;
}

/** Every media URL a submission references, across house, rooms, bathrooms and shared spaces. */
export function collectSubmissionMediaUrls(sub: ManagerListingSubmissionV1): string[] {
  const out: string[] = [];
  const push = (url: string | null | undefined) => {
    if (url) out.push(url);
  };
  const pushAll = (urls: string[] | null | undefined) => {
    for (const url of urls ?? []) push(url);
  };

  pushAll(sub.housePhotoDataUrls);
  push(sub.houseVideoDataUrl);
  push(sub.leaseTemplateDocUrl);
  push(sub.propertyFloorPlanDataUrl);
  for (const url of Object.values(sub.floorPlanByLabel ?? {})) push(url);
  for (const room of sub.rooms ?? []) {
    pushAll(room.photoDataUrls);
    push(room.videoDataUrl);
  }
  for (const bath of sub.bathrooms ?? []) {
    pushAll(bath.photoDataUrls);
    push(bath.videoDataUrl);
  }
  for (const space of sub.sharedSpaces ?? []) {
    pushAll(space.photoDataUrls);
    push(space.videoDataUrl);
  }
  return out;
}

/**
 * Best-effort reclamation of the storage objects a discarded submission owned.
 * Egress and storage are a real constraint on the free plan, so deleting a draft
 * must not strand its uploads in the bucket. Never throws — losing the cleanup is
 * strictly better than failing the delete the manager asked for.
 */
export async function deleteSubmissionMediaObjects(
  sub: ManagerListingSubmissionV1 | null | undefined,
): Promise<void> {
  if (!sub || typeof window === "undefined" || isDemoModeActive()) return;
  const paths = Array.from(
    new Set(collectSubmissionMediaUrls(sub).map(listingMediaObjectPath).filter((p): p is string => Boolean(p))),
  );
  if (paths.length === 0) return;
  try {
    const { createSupabaseBrowserClient } = await import("@/lib/supabase/browser");
    const db = createSupabaseBrowserClient();
    // Storage RLS scopes removal to the owner's `${userId}/` prefix, so a path
    // belonging to another manager is rejected rather than deleted.
    await db.storage.from(LISTING_MEDIA_BUCKET).remove(paths);
  } catch (err) {
    console.error("listing-media-storage: media cleanup failed", err);
  }
}
