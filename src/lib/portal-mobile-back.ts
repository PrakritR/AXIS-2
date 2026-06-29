import type { PortalDefinition } from "@/lib/portal-types";

export type PortalMobileBackTarget = {
  href: string;
  label: string;
};

/** Resident / manager mobile back: dashboard from sections; first tab from deeper inbox tabs. */
export function resolvePortalMobileBackTarget(
  pathname: string,
  definition: PortalDefinition,
): PortalMobileBackTarget | null {
  const baseParts = definition.basePath.split("/").filter(Boolean);
  const parts = pathname.split("/").filter(Boolean);

  if (parts.length < baseParts.length + 1) return null;
  for (let i = 0; i < baseParts.length; i += 1) {
    if (parts[i] !== baseParts[i]) return null;
  }

  const section = parts[baseParts.length];
  if (!section || section === "dashboard") return null;

  const meta = definition.sections.find((entry) => entry.section === section);
  const tabId = parts[baseParts.length + 1];
  const firstTabId = meta?.tabs[0]?.id;

  if (tabId && firstTabId && tabId !== firstTabId) {
    return {
      href: `${definition.basePath}/${section}/${firstTabId}`,
      label: meta?.label ?? section,
    };
  }

  const dashboard = definition.sections.find((entry) => entry.section === "dashboard");
  return {
    href: `${definition.basePath}/dashboard`,
    label: dashboard?.label ?? "Dashboard",
  };
}
