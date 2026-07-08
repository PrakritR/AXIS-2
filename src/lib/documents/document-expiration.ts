import type { ManagerDocumentCategory, ManagerDocumentDTO } from "@/lib/documents/manager-documents";

export type DocumentExpirationBucket = "none" | "ok" | "within90" | "within60" | "within30" | "expired";

export type DocumentExpirationSummary = {
  expired: number;
  within30: number;
  within60: number;
  within90: number;
};

const MS_PER_DAY = 86_400_000;

export function parseExpiryDate(iso: string | null | undefined): Date | null {
  if (!iso?.trim()) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** UTC midnight for date-only comparisons (expiration dates are whole days). */
export function startOfUtcDay(d = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function daysUntilExpiry(expiresAt: string | null | undefined, now = new Date()): number | null {
  const exp = parseExpiryDate(expiresAt);
  if (!exp) return null;
  const today = startOfUtcDay(now).getTime();
  const expDay = startOfUtcDay(exp).getTime();
  return Math.floor((expDay - today) / MS_PER_DAY);
}

export function documentExpirationBucket(
  expiresAt: string | null | undefined,
  now = new Date(),
): DocumentExpirationBucket {
  const days = daysUntilExpiry(expiresAt, now);
  if (days === null) return "none";
  if (days < 0) return "expired";
  if (days <= 30) return "within30";
  if (days <= 60) return "within60";
  if (days <= 90) return "within90";
  return "ok";
}

export function expirationBucketLabel(bucket: DocumentExpirationBucket): string {
  switch (bucket) {
    case "expired":
      return "Expired";
    case "within30":
      return "Expiring ≤30d";
    case "within60":
      return "Expiring ≤60d";
    case "within90":
      return "Expiring ≤90d";
    case "ok":
      return "Current";
    default:
      return "No expiry";
  }
}

export function expirationBadgeTone(bucket: DocumentExpirationBucket): "neutral" | "pending" | "overdue" | "info" {
  if (bucket === "expired") return "overdue";
  if (bucket === "within30") return "pending";
  if (bucket === "within60" || bucket === "within90") return "info";
  return "neutral";
}

/** Categories that commonly renew annually — prefill a one-year expiry on upload. */
export function defaultExpiryIsoForCategory(category: ManagerDocumentCategory, from = new Date()): string | null {
  if (category === "insurance" || category === "inspection") {
    const d = new Date(from);
    d.setUTCFullYear(d.getUTCFullYear() + 1);
    return d.toISOString();
  }
  return null;
}

export function suggestedExpiryDateInput(category: ManagerDocumentCategory, from = new Date()): string {
  const iso = defaultExpiryIsoForCategory(category, from);
  return iso ? iso.slice(0, 10) : "";
}

export function summarizeDocumentExpiration(
  documents: Pick<ManagerDocumentDTO, "expiresAt">[],
  now = new Date(),
): DocumentExpirationSummary {
  const summary: DocumentExpirationSummary = { expired: 0, within30: 0, within60: 0, within90: 0 };
  for (const doc of documents) {
    const bucket = documentExpirationBucket(doc.expiresAt, now);
    if (bucket === "expired") summary.expired += 1;
    else if (bucket === "within30") summary.within30 += 1;
    else if (bucket === "within60") summary.within60 += 1;
    else if (bucket === "within90") summary.within90 += 1;
  }
  return summary;
}

export function documentMatchesExpiryFilter(
  expiresAt: string | null | undefined,
  filter: string,
  now = new Date(),
): boolean {
  if (!filter || filter === "all") return true;
  const bucket = documentExpirationBucket(expiresAt, now);
  if (filter === "expired") return bucket === "expired";
  if (filter === "expiring30") return bucket === "within30";
  if (filter === "expiring90") return bucket === "within30" || bucket === "within60" || bucket === "within90";
  if (filter === "30") return bucket === "within30" || bucket === "expired";
  if (filter === "60") return bucket === "within30" || bucket === "within60" || bucket === "expired";
  if (filter === "90") return bucket !== "none" && bucket !== "ok";
  if (filter === "has") return bucket !== "none";
  return true;
}

export function parseExpiresAtInput(value: string | null | undefined): string | null {
  const raw = (value ?? "").trim();
  if (!raw) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const d = new Date(`${raw}T12:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export function formatExpiryDate(iso: string | null | undefined): string {
  const d = parseExpiryDate(iso);
  if (!d) return "—";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}
