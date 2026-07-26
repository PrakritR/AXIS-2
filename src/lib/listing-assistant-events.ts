/** Fired when the assistant confirms a listing submission change the open wizard should reload. */
export const LISTING_ASSISTANT_UPDATED_EVENT = "proplane:listing-assistant-updated";

export type ListingAssistantUpdatedDetail = {
  propertyId: string;
  tool: "apply_listing_photos";
};

export function notifyListingAssistantUpdated(detail: ListingAssistantUpdatedDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(LISTING_ASSISTANT_UPDATED_EVENT, { detail }));
}
