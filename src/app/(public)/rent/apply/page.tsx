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

  const ctx = await getPortalAccessContext();
  if (ctx.user && hasRole(ctx, "resident")) {
    redirect(applyPath);
  }

  return <PublicApplyClient />;
}
