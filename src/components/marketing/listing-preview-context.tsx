"use client";

import { createContext, useContext } from "react";

/**
 * True when the listing UI renders inside a manager/admin preview (embedded
 * panel or preview modal). Renter-flow links (apply, tours) then open a new
 * tab so the portal page underneath is not navigated away.
 */
export const ListingPreviewNewTabContext = createContext(false);

export function useListingPreviewNewTab(): boolean {
  return useContext(ListingPreviewNewTabContext);
}

export function listingLinkTargetProps(newTab: boolean): { target?: string; rel?: string } {
  return newTab ? { target: "_blank", rel: "noopener noreferrer" } : {};
}
