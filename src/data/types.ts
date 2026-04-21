import type { ManagerListingSubmissionV1 } from "@/lib/manager-listing-submission";

export type MockProperty = {
  id: string;
  title: string;
  tagline: string;
  address: string;
  /** Approximate ZIP for demo radius filtering from home search */
  zip: string;
  neighborhood: string;
  beds: number;
  baths: number;
  rentLabel: string;
  available: string;
  petFriendly: boolean;
  /** Same id for all units in one building (tours, grouping) */
  buildingId: string;
  buildingName: string;
  unitLabel: string;
  /** Optional map center for listing detail. WGS84 */
  mapLat?: number;
  mapLng?: number;
  /** When set, listing detail sections are generated from manager submission. */
  listingSubmission?: ManagerListingSubmissionV1;
  /** Supabase user id of the owning manager (demo localStorage scoping). */
  managerUserId?: string;
  /** When true, listing is admin-approved for live rent display; manager portal inventory only shows extras with this set. */
  adminPublishLive?: boolean;
};

export type MockRow = Record<string, string>;
