import type { PortalDefinition } from "@/lib/portal-types";

export type PortalMobileBackTarget = {
  href: string;
  label: string;
};

/** Splits pathname into section parts once the portal's basePath prefix matches, else null. */
function portalSectionParts(pathname: string, definition: PortalDefinition): string[] | null {
  const baseParts = definition.basePath.split("/").filter(Boolean);
  const parts = pathname.split("/").filter(Boolean);

  if (parts.length < baseParts.length + 1) return null;
  for (let i = 0; i < baseParts.length; i += 1) {
    if (parts[i] !== baseParts[i]) return null;
  }
  return parts.slice(baseParts.length);
}

/** Resident / manager mobile back: dashboard from sections; first tab from deeper inbox tabs. */
export function resolvePortalMobileBackTarget(
  pathname: string,
  definition: PortalDefinition,
  searchParams?: Pick<URLSearchParams, "get"> | null,
): PortalMobileBackTarget | null {
  const sectionParts = portalSectionParts(pathname, definition);
  if (!sectionParts) return null;

  const section = sectionParts[0];
  if (!section || section === "dashboard") return null;

<<<<<<< HEAD
  // Early rental-application steps hide the dashboard back affordance (browse link is in the wizard).
  if (section === "applications" && sectionParts[1] === "apply") {
    const wizardStep = Number(searchParams?.get("wizardStep") ?? "0");
    if (wizardStep >= 1 && wizardStep <= 3) return null;
=======
  // In-progress rental application — no top back arrow until submit (wizard has Exit application).
  if (section === "applications" && sectionParts[1] === "apply") {
    return null;
>>>>>>> fm/captain-wip-ship-s1
  }

  const meta = definition.sections.find((entry) => entry.section === section);
  const tabId = sectionParts[1];
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

/** Label for the mobile/native header when on a portal's own dashboard route (no back target). */
export function portalDashboardMobileHeaderLabel(pathname: string, definition: PortalDefinition): string | null {
  const sectionParts = portalSectionParts(pathname, definition);
  if (!sectionParts || sectionParts[0] !== "dashboard") return null;
  return definition.sections.find((entry) => entry.section === "dashboard")?.label ?? "Dashboard";
}
