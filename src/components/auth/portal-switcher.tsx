"use client";

export type AuthRole = "resident" | "manager" | "owner" | "admin";

/** Default dashboard route after sign-in / create-account. */
export function portalDashboardPath(role: AuthRole): string {
  if (role === "resident") return "/resident/dashboard";
  if (role === "manager") return "/portal/dashboard";
  if (role === "owner") return "/portal/dashboard";
  return "/admin/dashboard";
}

export function parseAuthRole(value: string | null): AuthRole {
  if (value === "resident" || value === "manager" || value === "owner" || value === "admin") return value;
  return "resident";
}
