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

  // Early rental-application steps hide the dashboard back affordance (browse link is in the wizard).
  if (section === "applications" && sectionParts[1] === "apply") {
    const wizardStep = Number(searchParams?.get("wizardStep") ?? "0");
    if (wizardStep >= 1 && wizardStep <= 3) return null;
  }

  const meta = definition.sections.find((entry) => entry.section === section);
  const tabId = sectionParts[1];
  const firstTabId = meta?.tabs[0]?.id;

  // Communication nests email/inbox folders and SMS buckets:
  // /communication/inbox|email/{folder} or /communication/sms/{bucket}.
  if (section === "communication") {
    const channel = tabId;
    const folder = sectionParts[2];
    if ((channel === "inbox" || channel === "email") && folder && folder !== "unopened") {
      return {
        href: `${definition.basePath}/communication/${channel}/unopened`,
        label: meta?.label ?? section,
      };
    }
    if (channel === "sms" && folder && folder !== "all" && folder !== "unopened") {
      return {
        href: `${definition.basePath}/communication/sms/all`,
        label: meta?.label ?? section,
      };
    }
    if (channel === "inbox" || channel === "email" || channel === "sms") {
      const dashboard = definition.sections.find((entry) => entry.section === "dashboard");
      return {
        href: `${definition.basePath}/dashboard`,
        label: dashboard?.label ?? "Dashboard",
      };
    }
  }

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
