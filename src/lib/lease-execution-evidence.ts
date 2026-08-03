/**
 * Evidence of WHAT was signed.
 *
 * Typed name + timestamp already satisfies ESIGN / state UETA, but a signature
 * is only useful in a dispute if you can prove which bytes it was applied to.
 * Everything here is about pinning that: a SHA-256 of the exact document the
 * signer was shown, and the consent affirmation they accepted to get there.
 *
 * WHICH BYTES. The document a signer sees is either the generated lease HTML
 * (`generatedHtml`, hashed as UTF-8) or the uploaded PDF (hashed as decoded
 * bytes). For the PDF path we hash the ORIGINAL upload, never the copy in
 * `managerUploadedPdf.dataUrl`. That copy has the signature certificate page
 * appended to it, and the certificate cannot contain a hash of itself. The
 * certificate page is a platform artifact; the agreement is the base document.
 */

import type { LeasePipelineRow } from "@/lib/lease-pipeline-storage";

/**
 * Bump when the wording changes. Signatures record the version they accepted,
 * so a certificate never quotes today's text over an older signer's consent.
 */
export const LEASE_ESIGN_CONSENT_VERSION = "esign-consent-v1";

export const LEASE_ESIGN_CONSENT_TEXT =
  "I consent to do business electronically and to receive this agreement and all related records in electronic form. " +
  "I understand that my typed name constitutes my legally binding electronic signature, equivalent to a handwritten signature.";

/** The agreement bytes, excluding any appended signature certificate page. */
export function leaseSignedDocumentBytes(row: LeasePipelineRow): Uint8Array | null {
  // Matches what LeaseSigningModal renders: uploaded PDF wins over generated HTML.
  const pdfBase = row.managerUploadedPdf?.originalDataUrl ?? row.managerUploadedPdf?.dataUrl ?? null;
  if (pdfBase) return dataUrlToBytes(pdfBase);
  if (row.generatedHtml) return new TextEncoder().encode(row.generatedHtml);
  return null;
}

export async function sha256Hex(bytes: Uint8Array): Promise<string | null> {
  const subtle = globalThis.crypto?.subtle;
  // ponytail: an insecure origin (plain-http dev host) exposes no WebCrypto.
  // An absent hash is honest; a signature must never fail because of one.
  if (!subtle) return null;
  try {
    const digest = await subtle.digest("SHA-256", new Uint8Array(bytes));
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return null;
  }
}

/** SHA-256 of the document as presented for signature, or null when there is none. */
export async function leaseDocumentSha256(row: LeasePipelineRow): Promise<string | null> {
  try {
    const bytes = leaseSignedDocumentBytes(row);
    return bytes ? sha256Hex(bytes) : null;
  } catch {
    // A malformed data URL makes `atob` throw. Signing must not fail with it.
    return null;
  }
}

/**
 * A stored hash is data, not a computation. It arrives from `row_data` and is
 * printed on a legal certificate, so anything that is not a SHA-256 digest is
 * rejected rather than rendered as one.
 */
export function asDocumentSha256(value: unknown): string | null {
  const v = typeof value === "string" ? value.trim().toLowerCase() : "";
  return /^[0-9a-f]{64}$/.test(v) ? v : null;
}

/** Readable prefix for a non-technical reader: "3F9A C210 88D1 4E77". */
export function documentFingerprintLabel(hex?: string | null): string | null {
  const clean = hex?.trim().toLowerCase();
  if (!clean) return null;
  return (clean.slice(0, 16).match(/.{1,4}/g) ?? []).join(" ").toUpperCase();
}

/**
 * True when the two parties signed different documents. Impossible through the
 * portal today (a signed row's body is immutable), so it means an out-of-band
 * edit reached the record and the certificate must say so rather than pick one.
 */
export function signedDocumentHashesDiverge(row: LeasePipelineRow): boolean {
  const resident = row.residentSignature?.documentSha256?.trim();
  const manager = row.managerSignature?.documentSha256?.trim();
  return Boolean(resident && manager && resident !== manager);
}

/**
 * Pure signature predicate, defined here rather than in the storage module so
 * server routes can enforce the immutability rule without importing 1700 lines
 * of browser-oriented store. `hasAnyLeaseSignature` delegates to it: one
 * definition, so the client guard and the server guard can never disagree.
 */
export function rowHasAnySignature(row: Pick<LeasePipelineRow, "managerSignature" | "residentSignature" | "signatureName" | "signedAtIso">): boolean {
  return Boolean(row.managerSignature || row.residentSignature || (row.signatureName && row.signedAtIso));
}

/**
 * The agreement bytes, excluding the certificate page that signing appends into
 * `managerUploadedPdf.dataUrl`. That page is derived from the signatures, so it
 * legitimately changes as parties sign; the base document must not.
 */
export function leaseDocumentBody(row: LeasePipelineRow): { html: string | null; pdf: string | null } {
  return {
    html: row.generatedHtml ?? null,
    pdf: row.managerUploadedPdf?.originalDataUrl ?? row.managerUploadedPdf?.dataUrl ?? null,
  };
}

/**
 * Every signal that says "this row is executed", as ONE predicate.
 *
 * `rowHasAnySignature` and `fullySignedAt` used to be read by different guards,
 * and each disagreement was a bypass: a payload carrying `fullySignedAt` but no
 * signature object satisfied a signature-keyed guard while still tripping a
 * `fullySignedAt`-keyed action. Anything that decides what an executed row may
 * do reads this, so the two signals can never drift apart again.
 */
export function leaseClaimsExecution(
  row: Pick<
    LeasePipelineRow,
    "managerSignature" | "residentSignature" | "signatureName" | "signedAtIso" | "fullySignedAt"
  >,
): boolean {
  return Boolean(row.fullySignedAt) || rowHasAnySignature(row);
}

/**
 * True when `next` turns an unexecuted stored row into an executed one while
 * ALSO changing the document body — claiming execution of a document the server
 * never held.
 *
 * This is the sibling `replacesSignedLeaseDocument` cannot cover: that one
 * requires the STORED row to already be executed, because it assumes the
 * signature was applied to a body the server had. A caller that supplies the
 * body and the execution claim in the SAME write never trips it, so the executed
 * text is whatever that one request said it was.
 *
 * It is the single trust decision behind two behaviours: a resident-scoped write
 * of this shape is refused outright, and auto-file declines to render such a
 * body into the property owner's document library. Both read this function, so
 * the guard and the action it protects cannot key on different signals.
 *
 * Legitimate shapes stay out of it. `residentUploadLeasePdf` clears every
 * signature and `fullySignedAt` first, so `next` claims nothing; countersigning
 * leaves the body untouched; and filling an ABSENT body with an already-executed
 * off-platform PDF is the existing-resident onboarding shape
 * `syncApprovedApplications` seeds (`externallySignedLease`, PDF only), which is
 * carved out exactly as `replacesSignedLeaseDocument` carves it out. That
 * carve-out does not extend to HTML: the seeded row never introduces one, and
 * generated HTML is what auto-file would render into someone else's library.
 */
export function introducesUntrustedLeaseDocument(
  stored: LeasePipelineRow | undefined,
  next: LeasePipelineRow,
): boolean {
  if (!stored) return false;
  if (leaseClaimsExecution(stored) || !leaseClaimsExecution(next)) return false;
  const before = leaseDocumentBody(stored);
  const after = leaseDocumentBody(next);
  if (before.html === after.html && before.pdf === after.pdf) return false;
  if (
    !before.html &&
    !before.pdf &&
    !after.html &&
    (stored.externallySignedLease || next.externallySignedLease)
  ) {
    return false;
  }
  return true;
}

/**
 * True when `next` replaces the document body of an already-signed `stored`
 * row. Clearing the signatures drops out by design, because that is a superseding
 * document (void, send back, renew, amend), not a silent edit to an executed
 * one. Filling in an absent body on an `externallySignedLease` row is how
 * existing-resident onboarding files an already-executed off-platform PDF.
 */
export function replacesSignedLeaseDocument(stored: LeasePipelineRow, next: LeasePipelineRow): boolean {
  if (!rowHasAnySignature(stored) || !rowHasAnySignature(next)) return false;
  const before = leaseDocumentBody(stored);
  const after = leaseDocumentBody(next);
  if (before.html === after.html && before.pdf === after.pdf) return false;
  if (!before.html && !before.pdf && stored.externallySignedLease) return false;
  return true;
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
