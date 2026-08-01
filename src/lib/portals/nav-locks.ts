import { managerSectionLockedForTier, residentSectionLockedForManagerTier } from "@/lib/manager-access";
import type { PortalKind } from "@/lib/portal-types";
import { residentSectionLockedForStage, type ResidentPortalNavStage } from "@/lib/resident-portal-nav";

/**
 * What a locked nav row DOES when you click it.
 *
 * - `"none"`   — not locked.
 * - `"upsell"` — locked, but still navigates. The manager / pro free-tier case:
 *   the destination route renders `PortalTierPaywall`, and the sidebar row is
 *   the ONLY entry point to that upgrade page anywhere in the product. Rendering
 *   it as a non-navigating `<span>` deletes the upgrade CTA — a revenue path —
 *   which is exactly what shipped in the resident redesign.
 * - `"inert"`  — locked and dead. Every RESIDENT lock:
 *     * a stage lock ("available after your lease is signed") has nothing to buy;
 *     * a resident free-tier lock is the MANAGER's plan, so
 *       `ResidentFreeTierFeatureNotice` can only say "ask your manager", which
 *       the row's own lock label already says.
 *   Both resident cases behave identically so a lock reads one way to a resident.
 *
 * Locks apply to managers AND residents — this only decides what a click does.
 *
 * Every locked-nav surface must honour the same split: desktop list, collapsed
 * rail, mobile top strip, native bottom bar, and the native More sheet. A live
 * link into a section the server then redirects home reads as a broken tab.
 */
export type PortalNavLockKind = "none" | "upsell" | "inert";

/**
 * Documents is NOT locked for a free-tier resident who has an approved
 * application — it is NARROWED, and the Application tab genuinely is theirs.
 *
 * `applications` is a RESIDENT_FREE_TIER_SECTION_ID, so relocating the submitted
 * application under the paid-tier Documents section must not take it away from a
 * free-tier household; `render-portal-section.tsx` exempts the `application` tab
 * for exactly that reason, and `applicationOnly` strips the rest of the shell.
 * Calling the nav row "locked" on top of that left the exemption with no
 * clickable route at all — reachable only from the approval push notification,
 * which is not access.
 *
 * So this is modelled as what it is: the row is an ordinary live link into the
 * narrowed shell, not a lock. That needs no third `PortalNavLockKind` and keeps
 * the rule that every resident LOCK stays inert — because this stops being one.
 * The tier gate itself is untouched: a typed URL to any other Documents tab
 * still returns `ResidentFreeTierFeatureNotice` server-side.
 *
 * Only past `pre_approval` — at `pre_approval` there is no approved application
 * to read, and `documents` is stage-locked there anyway.
 */
function residentDocumentsNarrowedNotLocked(
  section: string,
  stage: ResidentPortalNavStage | null | undefined,
): boolean {
  if (section !== "documents") return false;
  return stage === "post_approval_pre_lease" || stage === "post_lease";
}

export function portalNavLockKind(params: {
  kind: PortalKind;
  section: string;
  /** The viewer's own plan for manager/pro; the linked MANAGER's plan for a resident. */
  subscriptionTier: "free" | "paid" | null | undefined;
  residentNavStage?: ResidentPortalNavStage | null;
}): PortalNavLockKind {
  const { kind, section, subscriptionTier, residentNavStage } = params;

  if (kind === "resident") {
    if (residentNavStage && residentSectionLockedForStage(section, residentNavStage)) return "inert";
    if (
      subscriptionTier === "free" &&
      residentSectionLockedForManagerTier(section, subscriptionTier) &&
      !residentDocumentsNarrowedNotLocked(section, residentNavStage)
    ) {
      return "inert";
    }
    return "none";
  }

  if ((kind === "manager" || kind === "pro") && subscriptionTier === "free") {
    return managerSectionLockedForTier(section, subscriptionTier) ? "upsell" : "none";
  }

  return "none";
}

export function portalNavSectionLocked(params: Parameters<typeof portalNavLockKind>[0]): boolean {
  return portalNavLockKind(params) !== "none";
}

/** True when a locked row must still navigate (to the upgrade paywall page). */
export function portalNavLockNavigable(params: Parameters<typeof portalNavLockKind>[0]): boolean {
  return portalNavLockKind(params) === "upsell";
}
