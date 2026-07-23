/**
 * Labels for public scheduling surfaces (tour booking, partner meetings).
 * Never expose full email addresses or internal account identifiers in UI copy.
 */
export function publicSchedulingHostLabel(input: {
  email?: string | null;
  fullName?: string | null;
  fallback?: string;
}): string {
  const name = input.fullName?.trim();
  if (name) {
    const first = name.split(/\s+/)[0]?.trim();
    if (first) return first;
  }
  return input.fallback?.trim() || "Property manager";
}

export function publicAdminSchedulingHostLabel(input: {
  email?: string | null;
  fullName?: string | null;
}): string {
  const name = input.fullName?.trim();
  if (name) {
    const first = name.split(/\s+/)[0]?.trim();
    if (first) return first;
  }
  return "PropLane team member";
}
