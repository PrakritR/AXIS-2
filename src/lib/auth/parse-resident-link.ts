/** Parse a manager rental application link for resident app onboarding. */

export type ParsedManagerApplicationLink =
  | { kind: "apply"; href: string }
  | { kind: "invalid"; reason: string };

function tryParseUrl(input: string): URL | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  try {
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      return new URL(trimmed);
    }
    if (trimmed.startsWith("/")) {
      return new URL(trimmed, "https://axis.local");
    }
  } catch {
    return null;
  }
  return null;
}

export function parseManagerApplicationLink(input: string): ParsedManagerApplicationLink {
  const trimmed = input.trim();
  if (!trimmed) {
    return { kind: "invalid", reason: "Paste the rental application link from your property manager." };
  }

  const url = tryParseUrl(trimmed);
  if (!url) {
    return {
      kind: "invalid",
      reason: "Paste the full application link from your manager (it should include /rent/apply).",
    };
  }

  const path = url.pathname.replace(/\/$/, "") || "/";
  if (path === "/rent/apply" || path.endsWith("/rent/apply")) {
    return { kind: "apply", href: `/rent/apply${url.search}` };
  }

  return {
    kind: "invalid",
    reason: "That link is not a rental application link. Ask your manager for their apply link.",
  };
}

export function buildResidentCreateAccountHref(axisId: string, email?: string): string {
  const params = new URLSearchParams({ role: "resident", axis_id: axisId.trim() });
  if (email?.includes("@")) params.set("email", email.trim().toLowerCase());
  return `/auth/create-account?${params.toString()}`;
}
