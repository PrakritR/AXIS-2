/**
 * The dataset the `/demo` sandbox seeds into the browser-local portal stores.
 *
 * **The sandbox ships EMPTY.** Every snapshot builder here returns
 * `emptySnapshot()`, so `/demo` renders the real portal panels in their normal
 * "nothing here yet" empty states for all three roles. There is deliberately no
 * fictional portfolio: a made-up applicant or building on a public sandbox reads
 * as a real record to a visitor, and stale invented data drifts from the product.
 *
 * Two ways real data gets in — neither of them a static fixture:
 * - **Mirror.** `demo-portal-mirror.server.ts` overlays the canonical
 *   `@test.axis.local` accounts' real portal rows when they have any
 *   (`/api/demo/portal-snapshot`). That is where an accurate demo portfolio
 *   belongs — curate it by signing in as those accounts. Currently switched off
 *   at `DEMO_PORTAL_MIRROR_ENABLED` (`demo-mirror-flag.ts`).
 * - **Autoplay.** The "Run demo" walkthrough builds its own property,
 *   application, and lease live through the real wizards
 *   (`demo-segment-playback.tsx`), starting from this blank slate.
 *
 * To give the sandbox a static baseline again, fill in `buildDemoIdleSnapshot`
 * — it is the single seam, read by the seeder, the sandboxed agent context, and
 * the canonical-portfolio DB seed.
 */
import type { MockProperty } from "@/data/types";
import type { DemoApplicantRow, DemoManagerWorkOrderRow } from "@/data/demo-portal";
import type { HouseholdCharge, RecurringRentProfile } from "@/lib/household-charges";
import type { LeasePipelineRow } from "@/lib/lease-pipeline-storage";
import type { ManagerVendorRow } from "@/lib/manager-vendors-storage";
import type { ManagerPromotionRow } from "@/lib/promotion-flyer";
import type { ServiceRequest } from "@/lib/service-requests-storage";
import type { PersistedInboxThread } from "@/lib/portal-inbox-storage";
import type { PortalBugFeedbackRow } from "@/lib/portal-bug-feedback";
import type { InboxMessage } from "@/lib/demo-admin-partner-inbox";
import type { UploadedOwnLease } from "@/lib/resident-lease-upload";
import type { WorkOrderBid } from "@/lib/work-order-bids";
import type { VendorPayout } from "@/lib/vendor-payouts";
import type { PartnerInquiry, PlannedEvent } from "@/lib/demo-admin-scheduling";
import type { GuidedDemoStep } from "@/lib/demo/demo-guided";

/** Calendar slice of a snapshot: tours, partner inquiries, manager availability. */
export type DemoScheduleSeed = {
  plannedEvents: PlannedEvent[];
  partnerInquiries: PartnerInquiry[];
  /** Availability slot keys (`YYYY-MM-DD:slotIndex`) per demo property id. */
  availabilityByPropertyId: Record<string, string[]>;
};

export type DemoDataSnapshot = {
  properties: MockProperty[];
  applications: DemoApplicantRow[];
  charges: HouseholdCharge[];
  rentProfiles: RecurringRentProfile[];
  leases: LeasePipelineRow[];
  workOrders: DemoManagerWorkOrderRow[];
  workOrderBids: WorkOrderBid[];
  vendorPayouts: VendorPayout[];
  vendors: ManagerVendorRow[];
  promotions: ManagerPromotionRow[];
  serviceRequests: ServiceRequest[];
  managerInbox: PersistedInboxThread[];
  residentInbox: PersistedInboxThread[];
  vendorInbox: PersistedInboxThread[];
  adminInbox: InboxMessage[];
  bugFeedback: PortalBugFeedbackRow[];
  schedule: DemoScheduleSeed;
  residentUploads: UploadedOwnLease[];
};

function emptySchedule(): DemoScheduleSeed {
  return { plannedEvents: [], partnerInquiries: [], availabilityByPropertyId: {} };
}

function emptySnapshot(): DemoDataSnapshot {
  return {
    properties: [],
    applications: [],
    charges: [],
    rentProfiles: [],
    leases: [],
    workOrders: [],
    workOrderBids: [],
    vendorPayouts: [],
    vendors: [],
    promotions: [],
    serviceRequests: [],
    managerInbox: [],
    residentInbox: [],
    vendorInbox: [],
    adminInbox: [],
    bugFeedback: [],
    schedule: emptySchedule(),
    residentUploads: [],
  };
}

/** Guided tour / Run demo — blank slate before autoplay creates a property. */
export function buildDemoBlankSnapshot(): DemoDataSnapshot {
  return emptySnapshot();
}

/**
 * Idle explore mode — the static baseline `/demo` seeds when no mirror snapshot
 * is available. Empty by design (see the module docstring); this is the one
 * place to fill in a curated portfolio.
 */
export function buildDemoIdleSnapshot(): DemoDataSnapshot {
  return emptySnapshot();
}

/** Cumulative guided-story data — autoplay creates everything through the real wizards. */
export function buildDemoGuidedDataThrough(_through: number): DemoDataSnapshot {
  return buildDemoBlankSnapshot();
}

/** Data for the current guided step — always empty at tour start. */
export function buildDemoGuidedSnapshot(_step: GuidedDemoStep): DemoDataSnapshot {
  return buildDemoBlankSnapshot();
}
