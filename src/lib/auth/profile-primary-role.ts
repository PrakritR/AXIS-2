/**
 * `profiles.role` is a single legacy column; `profile_roles` holds all portals.
 * When adding manager/resident to an existing user, keep admin so reads that only check profiles.role still work.
 */
export function primaryRoleWhenAddingManager(existingRole: string | null | undefined): string {
  const r = (existingRole ?? "").toLowerCase();
  if (r === "admin") return existingRole!;
  return "manager";
}

export function primaryRoleWhenAddingResident(existingRole: string | null | undefined): string {
  const r = (existingRole ?? "").toLowerCase();
  if (r === "admin" || r === "manager") return existingRole!;
  return "resident";
}

export function primaryRoleWhenAddingVendor(existingRole: string | null | undefined): string {
  const r = (existingRole ?? "").toLowerCase();
  if (r === "admin" || r === "manager" || r === "resident") return existingRole!;
  return "vendor";
}
