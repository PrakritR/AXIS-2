"use client";

import { useEffect, useState } from "react";
import { managerContactSmsPhoneForPublicCta } from "@/lib/claw-leasing-links";
import { isLiveListingIdForContactSms } from "@/lib/listing-contact-sms";

let publicListingsCache: { at: number; byId: Map<string, string> } | null = null;
const PUBLIC_LISTINGS_CACHE_TTL_MS = 55_000;

async function contactSmsFromPublicCatalog(listingId: string): Promise<string | null> {
  if (publicListingsCache && Date.now() - publicListingsCache.at < PUBLIC_LISTINGS_CACHE_TTL_MS) {
    return publicListingsCache.byId.get(listingId) ?? null;
  }
  try {
    const res = await fetch("/api/property-records/public", { cache: "no-store" });
    if (!res.ok) return null;
    const body = (await res.json()) as { listings?: Array<{ id?: string; contactSmsPhone?: string }> };
    const byId = new Map<string, string>();
    for (const listing of body.listings ?? []) {
      const id = listing.id?.trim();
      const phone = managerContactSmsPhoneForPublicCta(listing.contactSmsPhone);
      if (id && phone) byId.set(id, phone);
    }
    publicListingsCache = { at: Date.now(), byId };
    return byId.get(listingId) ?? null;
  } catch {
    return null;
  }
}

async function ownManagerWorkNumber(): Promise<string | null> {
  try {
    const res = await fetch("/api/manager/phone", { credentials: "include", cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as { workNumber?: string | null };
    return managerContactSmsPhoneForPublicCta(data.workNumber) ?? null;
  } catch {
    return null;
  }
}

/**
 * Resolves the SMS number shown on listing CTAs — same source as the public browse page.
 * Live listings use the public catalog; drafts use the signed-in manager's work number.
 */
export function useListingContactSmsPhone(opts: {
  listingId?: string | null;
  ownerManagerUserId?: string | null;
  viewerManagerUserId?: string | null;
  enabled?: boolean;
}): string | null {
  const [phone, setPhone] = useState<string | null>(null);
  const enabled = opts.enabled !== false;
  const listingId = opts.listingId?.trim() || null;
  const ownerId = opts.ownerManagerUserId?.trim() || null;
  const viewerId = opts.viewerManagerUserId?.trim() || null;

  useEffect(() => {
    if (!enabled) {
      setPhone(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      if (listingId && isLiveListingIdForContactSms(listingId)) {
        const fromCatalog = await contactSmsFromPublicCatalog(listingId);
        if (!cancelled && fromCatalog) {
          setPhone(fromCatalog);
          return;
        }
      }
      const viewerIsOwner = !ownerId || !viewerId || ownerId === viewerId;
      if (viewerIsOwner) {
        const work = await ownManagerWorkNumber();
        if (!cancelled) setPhone(work);
        return;
      }
      if (!cancelled) setPhone(null);
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, listingId, ownerId, viewerId]);

  return phone;
}
