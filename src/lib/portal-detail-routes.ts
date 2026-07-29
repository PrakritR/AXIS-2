/** Routed detail tabs for manager property inline detail (Appendix C2). */
export const PROPERTY_DETAIL_TABS = [
  "preview",
  "house-details",
  "application",
  "lease",
  "calendar",
] as const;

export type PropertyDetailTabId = (typeof PROPERTY_DETAIL_TABS)[number];

export const PROPERTY_DETAIL_TAB_LABELS: Record<PropertyDetailTabId, string> = {
  preview: "Preview",
  "house-details": "House details",
  application: "Application",
  lease: "Lease",
  calendar: "Calendar",
};

/** Routed detail tabs for manager resident profile (Appendix C2). */
export const RESIDENT_DETAIL_TABS = ["application", "lease", "payments", "services"] as const;

export type ResidentDetailTabId = (typeof RESIDENT_DETAIL_TABS)[number];

export const RESIDENT_DETAIL_TAB_LABELS: Record<ResidentDetailTabId, string> = {
  application: "Application",
  lease: "Lease",
  payments: "Payments",
  services: "Services",
};

export function parsePropertyDetailTab(raw: string | undefined | null): PropertyDetailTabId {
  if (raw && (PROPERTY_DETAIL_TABS as readonly string[]).includes(raw)) {
    return raw as PropertyDetailTabId;
  }
  return "preview";
}

export function parseResidentDetailTab(raw: string | undefined | null): ResidentDetailTabId {
  if (raw && (RESIDENT_DETAIL_TABS as readonly string[]).includes(raw)) {
    return raw as ResidentDetailTabId;
  }
  return "application";
}

export function propertyDetailHref(
  basePath: string,
  stage: string,
  propertyKey: string,
  tab: PropertyDetailTabId,
): string {
  return `${basePath}/properties/${stage}/${encodeURIComponent(propertyKey)}/${tab}`;
}

export function residentDetailHref(
  basePath: string,
  residentsTab: string,
  residentId: string,
  tab: ResidentDetailTabId,
): string {
  return `${basePath}/residents/${residentsTab}/${encodeURIComponent(residentId)}/${tab}`;
}

/** Routed calendar views (manager portal). */
export const CALENDAR_VIEW_TABS = ["all", "tours", "services"] as const;
export type CalendarViewTabId = (typeof CALENDAR_VIEW_TABS)[number];

export const CALENDAR_VIEW_TAB_LABELS: Record<CalendarViewTabId, string> = {
  all: "All",
  tours: "Tours",
  services: "Service orders",
};

export function parseCalendarViewTab(raw: string | undefined | null): CalendarViewTabId {
  if (raw && (CALENDAR_VIEW_TABS as readonly string[]).includes(raw)) {
    return raw as CalendarViewTabId;
  }
  return "all";
}

export function calendarViewHref(basePath: string, tab: CalendarViewTabId): string {
  return `${basePath}/calendar/${tab}`;
}

/** Routed team link filters (manager relationships). */
export const TEAM_LINK_TABS = ["pending", "linked"] as const;
export type TeamLinkTabId = (typeof TEAM_LINK_TABS)[number];

export function parseTeamLinkTab(raw: string | undefined | null): TeamLinkTabId {
  if (raw && (TEAM_LINK_TABS as readonly string[]).includes(raw)) {
    return raw as TeamLinkTabId;
  }
  return "pending";
}

export function teamLinkHref(basePath: string, tab: TeamLinkTabId): string {
  return `${basePath}/relationships/${tab}`;
}
