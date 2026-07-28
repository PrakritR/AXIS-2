import type { ManagerListingSubmissionV1 } from "@/lib/manager-listing-submission";

/**
 * PRIVATE storage bucket holding manager-uploaded lease template PDFs. Unlike
 * `listing-photos` (public on purpose — a prospect must see the photos), a lease
 * template is the manager's own legal document and is never anonymously
 * readable. See `supabase/migrations/…_lease_templates_bucket.sql`.
 */
export const LEASE_TEMPLATE_BUCKET = "lease-templates";

/** Matches the PDF-only, 8 MB cap the bucket itself enforces. */
export const LEASE_TEMPLATE_MAX_BYTES = 8 * 1024 * 1024;

/**
 * The authorizing route that streams a template's bytes. The stored
 * `leaseTemplateDocUrl` is a URL onto THIS route rather than a signed storage
 * URL, because the generated lease HTML bakes the value into a persisted
 * `<object data=…>` (`generated-lease.ts`) that outlives any signed-URL TTL by
 * years. A stable app URL that authorizes on every request gives the same
 * privacy guarantee without touching the lease or signing flow.
 *
 * It is root-relative on purpose: the same stored value has to resolve on
 * localhost, on a Vercel preview, in production, and inside the Capacitor
 * WebView, including from `srcDoc` iframes that inherit the parent's base URL.
 */
export const LEASE_TEMPLATE_ROUTE = "/api/portal/lease-template";

/** `<manager user id>/<unique>.pdf` — the only object-path shape the route serves. */
const LEASE_TEMPLATE_PATH_RE = /^[0-9a-fA-F-]{36}\/[A-Za-z0-9._-]+\.pdf$/;

export function isLeaseTemplatePath(path: string | null | undefined): boolean {
  const raw = path?.trim() ?? "";
  return raw.length > 0 && !raw.includes("..") && LEASE_TEMPLATE_PATH_RE.test(raw);
}

/** Stable, browser-loadable URL for a stored template object. */
export function leaseTemplateUrlForPath(path: string): string {
  return `${LEASE_TEMPLATE_ROUTE}?path=${encodeURIComponent(path)}`;
}

/**
 * Object path a stored `leaseTemplateDocUrl` points at, or null when it is
 * anything else — a legacy public `listing-photos` URL, a still-unuploaded
 * `data:` URL, or a link a manager pasted in.
 */
export function leaseTemplateObjectPath(url: string | null | undefined): string | null {
  const raw = url?.trim();
  if (!raw) return null;
  const at = raw.indexOf(`${LEASE_TEMPLATE_ROUTE}?`);
  if (at === -1) return null;
  const query = raw.slice(raw.indexOf("?", at) + 1);
  const path = new URLSearchParams(query).get("path")?.trim() ?? "";
  return isLeaseTemplatePath(path) ? path : null;
}

/**
 * Every lease-template object path a submission references. Walks
 * `propertyLeaseTemplates[]` as well as the top-level field — the per-property
 * lease templates carry their own uploads and were previously invisible to both
 * the uploader and the storage-reclamation pass.
 */
export function collectSubmissionLeaseTemplatePaths(
  sub: ManagerListingSubmissionV1 | null | undefined,
): Set<string> {
  const out = new Set<string>();
  if (!sub) return out;
  const add = (url: string | null | undefined) => {
    const path = leaseTemplateObjectPath(url);
    if (path) out.add(path);
  };
  add(sub.leaseTemplateDocUrl);
  for (const template of sub.propertyLeaseTemplates ?? []) add(template?.leaseTemplateDocUrl);
  return out;
}

export type UploadedLeaseTemplate = { url: string; name: string };

/**
 * Upload a template PDF through the authorizing route and return the stable URL
 * to store on the submission. Rejects rather than falling back to a `data:` URL:
 * a base64 PDF persisted into `property_data` is both the leak this replaces and
 * a multi-megabyte row.
 */
export async function uploadLeaseTemplateFile(file: File): Promise<UploadedLeaseTemplate> {
  const body = new FormData();
  body.append("file", file);
  const res = await fetch(LEASE_TEMPLATE_ROUTE, { method: "POST", body });
  const json = (await res.json().catch(() => ({}))) as { path?: string; error?: string };
  if (!res.ok || !json.path) throw new Error(json.error || "Could not upload the lease template.");
  return { url: leaseTemplateUrlForPath(json.path), name: file.name };
}

/**
 * Move a legacy `data:` template into the private bucket, passing any other
 * value through untouched. A draft saved before templates went private (or one
 * round-tripped through /demo) still carries base64, and the listing wizard's
 * generic media uploader would put it in the PUBLIC photo bucket.
 */
export async function uploadLeaseTemplateDataUrl(
  url: string | null | undefined,
  fileName?: string | null,
): Promise<string | null> {
  const raw = url?.trim() ?? "";
  if (!raw) return null;
  if (!raw.startsWith("data:")) return raw;
  const blob = await fetch(raw).then((res) => res.blob());
  const name = fileName?.trim() || "lease-template.pdf";
  const { url: uploaded } = await uploadLeaseTemplateFile(
    new File([blob], name, { type: "application/pdf" }),
  );
  return uploaded;
}

/**
 * Best-effort reclamation of template objects a discarded submission owned.
 * Mirrors `deleteSubmissionMediaObjects`: an object's URL rides on the
 * submission rather than being owned by the record that stored it, so a path any
 * SURVIVING submission still references is left alone. Never throws — losing the
 * cleanup is strictly better than failing the delete the manager asked for.
 */
export async function deleteSubmissionLeaseTemplates(
  sub: ManagerListingSubmissionV1 | null | undefined,
  stillReferencedBy: Iterable<ManagerListingSubmissionV1 | null | undefined> = [],
): Promise<void> {
  const retained = new Set<string>();
  for (const other of stillReferencedBy) {
    for (const path of collectSubmissionLeaseTemplatePaths(other)) retained.add(path);
  }
  const paths = [...collectSubmissionLeaseTemplatePaths(sub)].filter((p) => !retained.has(p));
  if (paths.length === 0) return;
  try {
    await fetch(LEASE_TEMPLATE_ROUTE, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paths }),
    });
  } catch (err) {
    console.error("lease-template-storage: cleanup failed", err);
  }
}
