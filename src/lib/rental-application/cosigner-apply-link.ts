import { normalizeApplicationAxisId } from "@/lib/manager-applications-storage";

export const COSIGNER_SIGNER_APP_ID_PARAM = "signerAppId";

/** Public co-signer apply URL with the primary applicant's application id prefilled. */
export function buildCosignerApplyPath(signerAppId: string): string {
  const id = normalizeApplicationAxisId(signerAppId.trim()).toUpperCase();
  const q = new URLSearchParams({ [COSIGNER_SIGNER_APP_ID_PARAM]: id });
  return `/rent/apply/cosigner?${q.toString()}`;
}

export function buildCosignerApplyUrl(origin: string, signerAppId: string): string {
  const path = buildCosignerApplyPath(signerAppId);
  return `${origin.replace(/\/$/, "")}${path}`;
}

export function parseCosignerSignerAppIdParam(
  value: string | null | undefined,
): string {
  const raw = (value ?? "").trim();
  if (!raw) return "";
  return normalizeApplicationAxisId(raw).toUpperCase();
}
