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

/**
 * True on public listing pages where apply/tour (and related actions) already
 * live in the sticky sidebar / mobile pricing card — hide duplicate CTAs on
 * media browsers and detail modals.
 */
export const ListingSidebarRenterCtasContext = createContext(false);

export function useListingSidebarRenterCtas(): boolean {
  return useContext(ListingSidebarRenterCtasContext);
}

export function listingLinkTargetProps(newTab: boolean): { target?: string; rel?: string } {
  return newTab ? { target: "_blank", rel: "noopener noreferrer" } : {};
}
