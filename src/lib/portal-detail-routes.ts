/** Routed detail tabs for manager property inline detail (Appendix C2). */
export const PROPERTY_DETAIL_TABS = [
  "preview",
  "house-details",
  "application",
  "lease",
  "calendar",
  "promotion",
] as const;

export type PropertyDetailTabId = (typeof PROPERTY_DETAIL_TABS)[number];

export const PROPERTY_DETAIL_TAB_LABELS: Record<PropertyDetailTabId, string> = {
  preview: "Preview",
  "house-details": "House details",
  application: "Application",
  lease: "Lease",
  calendar: "Calendar",
  promotion: "Promotion",
};

/** Routed detail tabs for manager resident profile (Appendix C2). */
export const RESIDENT_DETAIL_TABS = ["application", "lease", "payments", "services", "communication"] as const;

export type ResidentDetailTabId = (typeof RESIDENT_DETAIL_TABS)[number];

export const RESIDENT_DETAIL_TAB_LABELS: Record<ResidentDetailTabId, string> = {
  application: "Application",
  lease: "Lease",
  payments: "Payments",
  services: "Services",
  communication: "Communication",
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

/** Manager property pipeline stages (listed / drafts / unlisted). */
export const PROPERTY_STAGES = ["listed", "drafts", "unlisted"] as const;
export type PropertyStageId = (typeof PROPERTY_STAGES)[number];

export function parsePropertyStage(raw: string | undefined | null): PropertyStageId {
  if (raw && (PROPERTY_STAGES as readonly string[]).includes(raw)) {
    return raw as PropertyStageId;
  }
  return "listed";
}

export function propertyListHref(basePath: string, stage: string): string {
  return `${basePath}/properties/${stage}`;
}

export function residentDetailHref(
  basePath: string,
  residentsTab: string,
  residentId: string,
  tab: ResidentDetailTabId,
): string {
  return `${basePath}/residents/${residentsTab}/${encodeURIComponent(residentId)}/${tab}`;
}
export function residentPaymentDetailHref(
  basePath: string,
  residentsTab: string,
  residentId: string,
  paymentId: string,
): string {
  return `${basePath}/residents/${residentsTab}/${encodeURIComponent(residentId)}/payments/${encodeURIComponent(paymentId)}`;
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

export function teamLinkHref(basePath: string, _tab?: TeamLinkTabId): string {
  return `${basePath}/relationships`;
}

/** Manager applications list buckets (Appendix D5). */
export const APPLICATION_BUCKETS = ["incomplete", "pending", "approved", "rejected"] as const;
export type ApplicationBucketId = (typeof APPLICATION_BUCKETS)[number];

export function parseApplicationBucket(raw: string | undefined | null): ApplicationBucketId {
  if (raw && (APPLICATION_BUCKETS as readonly string[]).includes(raw)) {
    return raw as ApplicationBucketId;
  }
  return "pending";
}

export function applicationListHref(basePath: string, bucket: ApplicationBucketId): string {
  return `${basePath}/applications/${bucket}`;
}

export function applicationDetailHref(
  basePath: string,
  bucket: ApplicationBucketId,
  applicationId: string,
): string {
  return `${basePath}/applications/${bucket}/${encodeURIComponent(applicationId)}`;
}

/** Resident application list buckets (Pending / Approved / Rejected). */
export const RESIDENT_APPLICATION_BUCKETS = ["pending", "approved", "rejected"] as const;
export type ResidentApplicationBucketId = (typeof RESIDENT_APPLICATION_BUCKETS)[number];

export function parseResidentApplicationBucket(raw: string | undefined | null): ResidentApplicationBucketId {
  if (raw && (RESIDENT_APPLICATION_BUCKETS as readonly string[]).includes(raw)) {
    return raw as ResidentApplicationBucketId;
  }
  return "pending";
}

export function residentApplicationListHref(
  basePath: string,
  bucket: ResidentApplicationBucketId,
): string {
  return `${basePath}/applications/${bucket}`;
}

export function residentApplicationDetailHref(
  basePath: string,
  bucket: ResidentApplicationBucketId,
  applicationId: string,
): string {
  return `${basePath}/applications/${bucket}/${encodeURIComponent(applicationId)}`;
}

/** Manager lease pipeline tabs (Appendix D5). */
export const LEASE_PIPELINE_TABS = ["manager", "resident", "signed", "completed"] as const;
export type LeasePipelineTabId = (typeof LEASE_PIPELINE_TABS)[number];

export function parseLeasePipelineTab(raw: string | undefined | null): LeasePipelineTabId {
  if (raw && (LEASE_PIPELINE_TABS as readonly string[]).includes(raw)) {
    return raw as LeasePipelineTabId;
  }
  return "manager";
}

export function leaseListHref(basePath: string, tab: LeasePipelineTabId): string {
  return `${basePath}/leases/${tab}`;
}

export function leaseDetailHref(basePath: string, tab: LeasePipelineTabId, leaseId: string): string {
  return `${basePath}/leases/${tab}/${encodeURIComponent(leaseId)}`;
}

/** Manager payments direction + status bucket (Appendix D5). */
export const PAYMENT_DIRECTIONS = ["incoming", "outgoing"] as const;
export type PaymentDirectionId = (typeof PAYMENT_DIRECTIONS)[number];

export const PAYMENT_BUCKETS = ["pending", "overdue", "paid"] as const;
export type PaymentBucketId = (typeof PAYMENT_BUCKETS)[number];

export function parsePaymentDirection(raw: string | undefined | null): PaymentDirectionId {
  if (raw && (PAYMENT_DIRECTIONS as readonly string[]).includes(raw)) {
    return raw as PaymentDirectionId;
  }
  return "incoming";
}

export function parsePaymentBucket(raw: string | undefined | null): PaymentBucketId {
  if (raw && (PAYMENT_BUCKETS as readonly string[]).includes(raw)) {
    return raw as PaymentBucketId;
  }
  return "pending";
}

export function paymentListHref(
  basePath: string,
  direction: PaymentDirectionId,
  bucket: PaymentBucketId,
): string {
  return `${basePath}/payments/${direction}/${bucket}`;
}

export function paymentDetailHref(
  basePath: string,
  direction: PaymentDirectionId,
  bucket: PaymentBucketId,
  paymentId: string,
): string {
  return `${basePath}/payments/${direction}/${bucket}/${encodeURIComponent(paymentId)}`;
}

/** Manager add-on service request buckets (Appendix D5). */
export const SERVICE_REQUEST_BUCKETS = ["pending", "approved", "denied"] as const;
export type ServiceRequestBucketId = (typeof SERVICE_REQUEST_BUCKETS)[number];

export function parseServiceRequestBucket(raw: string | undefined | null): ServiceRequestBucketId {
  if (raw && (SERVICE_REQUEST_BUCKETS as readonly string[]).includes(raw)) {
    return raw as ServiceRequestBucketId;
  }
  return "pending";
}

export function serviceRequestListHref(basePath: string, bucket: ServiceRequestBucketId): string {
  return `${basePath}/services/requests/${bucket}`;
}

export function serviceRequestDetailHref(
  basePath: string,
  bucket: ServiceRequestBucketId,
  requestId: string,
): string {
  return `${basePath}/services/requests/${bucket}/${encodeURIComponent(requestId)}`;
}

/** Manager work order buckets (Appendix D5). */
export const WORK_ORDER_BUCKETS = ["open", "scheduled", "completed"] as const;
export type WorkOrderBucketId = (typeof WORK_ORDER_BUCKETS)[number];

export function parseWorkOrderBucket(raw: string | undefined | null): WorkOrderBucketId {
  if (raw && (WORK_ORDER_BUCKETS as readonly string[]).includes(raw)) {
    return raw as WorkOrderBucketId;
  }
  return "open";
}

export function workOrderListHref(basePath: string, bucket: WorkOrderBucketId): string {
  return `${basePath}/services/work-orders/${bucket}`;
}

export function workOrderDetailHref(
  basePath: string,
  bucket: WorkOrderBucketId,
  workOrderId: string,
): string {
  return `${basePath}/services/work-orders/${bucket}/${encodeURIComponent(workOrderId)}`;
}

/** Legacy promotion content filters — routes now redirect to the unified list. */
export const PROMOTION_CONTENT_FILTERS = ["text", "image"] as const;
export type PromotionContentFilterId = (typeof PROMOTION_CONTENT_FILTERS)[number];

export function promotionListHref(basePath: string, _filter?: PromotionContentFilterId): string {
  return `${basePath}/promotion`;
}

/** Map mistaken top-level portal segments to their routed section paths. */
export function legacyManagerPortalSectionPath(section: string): string | null {
  if ((APPLICATION_BUCKETS as readonly string[]).includes(section)) {
    return `applications/${section}`;
  }
  if ((PROPERTY_STAGES as readonly string[]).includes(section)) {
    return `properties/${section}`;
  }
  if ((LEASE_PIPELINE_TABS as readonly string[]).includes(section)) {
    return `leases/${section}`;
  }
  if ((PROMOTION_CONTENT_FILTERS as readonly string[]).includes(section)) {
    return "promotion";
  }
  if ((SERVICE_REQUEST_BUCKETS as readonly string[]).includes(section)) {
    return `services/requests/${section}`;
  }
  if ((WORK_ORDER_BUCKETS as readonly string[]).includes(section)) {
    return `services/work-orders/${section}`;
  }
  return null;
}
