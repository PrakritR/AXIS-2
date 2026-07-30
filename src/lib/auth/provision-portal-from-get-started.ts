"use client";

import type { AuthPortalPickerId } from "@/lib/auth/auth-portal-picker-options";

export type ProvisionPortalResult =
  | { ok: true; redirectTo: string }
  | { ok: false; error: string };

async function setActivePortal(role: AuthPortalPickerId): Promise<void> {
  await fetch("/api/auth/set-active-portal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role }),
  });
}

function managerProvisionError(body: { error?: string; reason?: string; skipped?: boolean }): string {
  if (body.error) return body.error;
  if (body.reason === "resident_only") {
    return "This login is set up as a resident account. Open the resident portal or sign out and try a different email.";
  }
  if (body.reason === "unlinked_paid_purchase") {
    return "Finish linking your paid manager plan before opening the property portal.";
  }
  return "Could not set up your property manager account. Please try again.";
}

/** Provision the chosen portal role for a signed-in user with no role yet (get-started chooser). */
export async function provisionPortalFromGetStarted(role: AuthPortalPickerId): Promise<ProvisionPortalResult> {
  if (role === "manager") {
    const res = await fetch("/api/auth/provision-pending-manager", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trial: true }),
    });
    const body = (await res.json().catch(() => ({}))) as {
      error?: string;
      reason?: string;
      skipped?: boolean;
      redirectTo?: string;
    };
    if (!res.ok || body.skipped) {
      return { ok: false, error: managerProvisionError(body) };
    }
    await setActivePortal("manager");
    return { ok: true, redirectTo: body.redirectTo?.startsWith("/") ? body.redirectTo : "/portal/dashboard" };
  }

  if (role === "resident") {
    const res = await fetch("/api/auth/create-resident-account", { method: "POST" });
    const body = (await res.json().catch(() => ({}))) as { error?: string; redirectTo?: string };
    if (!res.ok) {
      return { ok: false, error: body.error || "Could not set up your resident account. Please try again." };
    }
    return {
      ok: true,
      redirectTo: body.redirectTo?.startsWith("/") ? body.redirectTo : "/resident/applications/apply",
    };
  }

  const res = await fetch("/api/auth/register-vendor-oauth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  const body = (await res.json().catch(() => ({}))) as { error?: string; redirectTo?: string };
  if (!res.ok) {
    return { ok: false, error: body.error || "Could not set up your vendor account. Please try again." };
  }
  await setActivePortal("vendor");
  return { ok: true, redirectTo: body.redirectTo?.startsWith("/") ? body.redirectTo : "/vendor/dashboard" };
}
