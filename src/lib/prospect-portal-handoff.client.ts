"use client";

/**
 * After a prospect action while signed in as manager/vendor, add the resident
 * role (idempotent) and land in the resident portal.
 */
export async function promoteToResidentPortal(redirectTo: string): Promise<boolean> {
  const next = redirectTo.trim().startsWith("/") ? redirectTo.trim() : "/resident/dashboard";
  try {
    const res = await fetch("/api/auth/create-resident-account", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ redirectTo: next }),
    });
    const data = (await res.json().catch(() => ({}))) as { redirectTo?: string; error?: string };
    if (!res.ok) return false;
    window.location.assign(typeof data.redirectTo === "string" && data.redirectTo.startsWith("/") ? data.redirectTo : next);
    return true;
  } catch {
    return false;
  }
}
