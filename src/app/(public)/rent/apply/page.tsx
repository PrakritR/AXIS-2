import { Suspense } from "react";
import { getPortalAccessContext, hasRole } from "@/lib/auth/portal-access";
import { redirect } from "next/navigation";
import { PublicApplyClient } from "./public-apply-client";

function buildApplySearch(params: Record<string, string | string[] | undefined>): string {
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") q.set(key, value);
    else if (Array.isArray(value)) value.forEach((entry) => q.append(key, entry));
  }
  const qs = q.toString();
  return qs ? `?${qs}` : "";
}

export default async function ApplyPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const applyPath = `/resident/applications/apply${buildApplySearch(params)}`;
  const hasPropertyLink = Boolean(
    (typeof params.propertyId === "string" && params.propertyId.trim()) ||
      (typeof params.ids === "string" && params.ids.trim()),
  );

  const ctx = await getPortalAccessContext();
  if (ctx.user && (hasRole(ctx, "resident") || hasPropertyLink)) {
    redirect(applyPath);
  }

  // A signed-in NON-resident (manager or vendor) does not apply as their current
  // identity — they create a separate resident account and apply from the
  // resident portal. Resolved server-side so the surface never flashes or blanks.
  const signedInNonResident = Boolean(ctx.user) && !hasRole(ctx, "resident");

  return (
    <Suspense fallback={<div className="mx-auto max-w-3xl px-4 py-16 text-center text-muted">Loading application…</div>}>
      <PublicApplyClient signedInNonResident={signedInNonResident} />
    </Suspense>
  );
}
