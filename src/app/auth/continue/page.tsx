import { redirect } from "next/navigation";
import { portalDashboardPath } from "@/components/auth/portal-switcher";
import { getPortalAccessContext } from "@/lib/auth/portal-access";

function safeNext(raw: string | undefined): string {
  return raw && raw.startsWith("/") ? raw : "";
}

export default async function AuthContinuePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const nextPath = safeNext(next);
  const ctx = await getPortalAccessContext();

  if (!ctx.user) {
    redirect(nextPath ? `/auth/sign-in?next=${encodeURIComponent(nextPath)}` : "/auth/sign-in");
  }

  if (ctx.roles.length > 1 && ctx.effectiveRole === null) {
    redirect(nextPath ? `/auth/choose-portal?next=${encodeURIComponent(nextPath)}` : "/auth/choose-portal");
  }

  const role = ctx.effectiveRole ?? ctx.roles[0] ?? "resident";
  redirect(nextPath || portalDashboardPath(role));
}
