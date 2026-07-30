import type { DemoApplicantRow } from "@/data/demo-portal";

function normalizeEmail(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

/** Legacy dev rows may store @test.axis.local while auth uses @test.proplane.local. */
function applicantEmailsMatch(sessionEmail: string, rowEmail: string, recordEmail?: string | null): boolean {
  const email = normalizeEmail(sessionEmail);
  const primaryRowEmail = normalizeEmail(rowEmail);
  const storedRecordEmail = normalizeEmail(recordEmail);
  if (!email) return false;
  if (primaryRowEmail === email || storedRecordEmail === email) return true;
  const candidates = [primaryRowEmail, storedRecordEmail].filter(Boolean);
  for (const candidate of candidates) {
    const [localA, domainA] = email.split("@");
    const [localB, domainB] = candidate.split("@");
    if (localA !== localB) continue;
    const legacyDomains = new Set(["test.axis.local", "test.proplane.local", "axis.local"]);
    if (legacyDomains.has(domainA) && legacyDomains.has(domainB)) return true;
  }
  return false;
}

/** True when the signed-in resident may view or edit this application row. */
export function residentOwnsApplicationRow(
  row: DemoApplicantRow,
  ctx: { email?: string | null; userId?: string | null },
  opts?: { recordEmail?: string | null },
): boolean {
  const email = normalizeEmail(ctx.email);
  const rowEmail = normalizeEmail(row.email);
  const storedRecordEmail = normalizeEmail(opts?.recordEmail);
  if (email && !applicantEmailsMatch(email, rowEmail, storedRecordEmail)) return false;
  const linkedUserId = row.residentUserId?.trim();
  if (linkedUserId && ctx.userId && linkedUserId !== ctx.userId) return false;
  return true;
}
