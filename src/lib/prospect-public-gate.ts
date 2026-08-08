import { buildPortfolioApplyHref } from "@/lib/manager-property-links";
import { residentCreateAccountHref, residentSignInHref } from "@/lib/resident-public-nav";
import { residentPortalApplyReturnPath } from "@/lib/rental-application/public-apply-session";

export type ProspectActionKind = "apply" | "tour" | "message";

const GUEST_CONTINUE_PREFIX = "proplane_prospect_guest:";

/** Session key for an account gate — action + property (apply keeps legacy bare-id keys). */
export function prospectGateKey(kind: ProspectActionKind, propertyId: string): string {
  const pid = propertyId.trim();
  if (!pid) return "";
  return kind === "apply" ? pid : `${kind}:${pid}`;
}

export function markProspectGuestContinue(gateKey: string): void {
  if (typeof window === "undefined") return;
  const key = gateKey.trim();
  if (!key) return;
  try {
    window.sessionStorage.setItem(`${GUEST_CONTINUE_PREFIX}${key}`, "1");
  } catch {
    /* ignore */
  }
}

export function hasProspectGuestContinue(gateKey: string): boolean {
  if (typeof window === "undefined") return false;
  const key = gateKey.trim();
  if (!key) return false;
  try {
    return window.sessionStorage.getItem(`${GUEST_CONTINUE_PREFIX}${key}`) === "1";
  } catch {
    return false;
  }
}

export function prospectPortalReturnPath(
  kind: ProspectActionKind,
  input: { propertyId: string; rentalType?: "standard" | "short_term"; listingRoomId?: string; bundleId?: string },
): string {
  const pid = input.propertyId.trim();
  if (!pid) {
    return kind === "apply"
      ? "/resident/applications/apply"
      : kind === "tour"
        ? "/resident/tour/schedule"
        : "/resident/communication/active";
  }
  if (kind === "apply") {
    return residentPortalApplyReturnPath({
      propertyId: pid,
      rentalType: input.rentalType,
      listingRoomId: input.listingRoomId,
      bundleId: input.bundleId,
    });
  }
  if (kind === "tour") {
    return `/resident/tour/schedule?propertyId=${encodeURIComponent(pid)}`;
  }
  return `/resident/communication/active?propertyId=${encodeURIComponent(pid)}&compose=1`;
}

export function prospectPublicReturnPath(
  kind: ProspectActionKind,
  input: {
    propertyId: string;
    portfolioPropertyIds?: readonly string[];
    rentalType?: "standard" | "short_term";
    listingRoomId?: string;
    bundleId?: string;
  },
): string {
  const pid = input.propertyId.trim();
  if (kind === "apply") {
    if (pid) {
      const q = new URLSearchParams({ propertyId: pid });
      if (input.rentalType === "short_term") q.set("rentalType", "short_term");
      if (input.listingRoomId?.trim()) q.set("listingRoomId", input.listingRoomId.trim());
      if (input.bundleId?.trim()) q.set("bundle", input.bundleId.trim());
      return `/rent/apply?${q.toString()}`;
    }
    const ids = [...new Set((input.portfolioPropertyIds ?? []).map((id) => id.trim()).filter(Boolean))].sort();
    if (ids.length > 0) {
      return buildPortfolioApplyHref(ids, {
        rentalType: input.rentalType === "short_term" ? "short_term" : undefined,
      });
    }
    return "/rent/apply";
  }
  if (kind === "tour") {
    return pid ? `/rent/tours-contact?propertyId=${encodeURIComponent(pid)}` : "/rent/tours-contact";
  }
  const q = new URLSearchParams({ tab: "message" });
  if (pid) q.set("propertyId", pid);
  return `/rent/tours-contact?${q.toString()}`;
}

export function prospectCreateAccountHref(
  kind: ProspectActionKind,
  gateKey: string,
  returnPath: string,
  opts?: { email?: string; fullName?: string; phone?: string; tourInquiryId?: string },
): string {
  const next = returnPath.trim() || prospectPortalReturnPath(kind, { propertyId: gateKey.replace(/^(tour|message):/, "") });
  if (kind === "message") {
    return residentCreateAccountHref(next, {
      email: opts?.email,
      fullName: opts?.fullName,
      phone: opts?.phone,
      handoff: "message",
    });
  }
  if (kind === "tour" && opts?.tourInquiryId) {
    return residentCreateAccountHref(next, {
      email: opts?.email,
      fullName: opts?.fullName,
      phone: opts?.phone,
      tourInquiryId: opts.tourInquiryId,
    });
  }
  return residentCreateAccountHref(next, {
    email: opts?.email,
    fullName: opts?.fullName,
    phone: opts?.phone,
  });
}

export function prospectSignInHref(
  kind: ProspectActionKind,
  gateKey: string,
  returnPath: string,
  opts?: { email?: string; fullName?: string; phone?: string; tourInquiryId?: string },
): string {
  const next = returnPath.trim() || prospectPortalReturnPath(kind, { propertyId: gateKey.replace(/^(tour|message):/, "") });
  return residentSignInHref(next, {
    tourInquiryId: opts?.tourInquiryId,
    email: opts?.email,
    fullName: opts?.fullName,
    phone: opts?.phone,
    ...(kind === "message" ? { handoff: "message" as const } : {}),
  });
}

export type ProspectGateView = "account-prompt" | "signed-in-create-resident" | "resident-portal" | "action";

export function resolveProspectGateView(input: {
  gateKey?: string;
  guestContinue: boolean;
  signedInNonResident: boolean;
  hasResidentRole?: boolean;
}): ProspectGateView {
  const key = input.gateKey?.trim() ?? "";
  if (input.hasResidentRole) return "resident-portal";
  const gateInPlay = Boolean(key) && !input.guestContinue;
  if (!gateInPlay) return "action";
  return input.signedInNonResident ? "signed-in-create-resident" : "account-prompt";
}
