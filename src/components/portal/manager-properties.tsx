"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ManagerAddListingForm } from "@/components/portal/manager-add-listing-form";
import { ManagerHousePropertiesPanel } from "@/components/portal/manager-house-properties-panel";
import { ManagerPortalPageShell, PORTAL_HEADER_ACTION_BTN } from "@/components/portal/portal-metrics";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { useManagerUserId } from "@/hooks/use-manager-user-id";
import {
  countManagerManagedPropertiesForUser,
  mirrorLocalPropertyPipelineToServer,
  PROPERTY_PIPELINE_EVENT,
  readPendingManagerPropertiesForUser,
} from "@/lib/demo-property-pipeline";
import { syncManagerPortfolioFromServer } from "@/lib/manager-portfolio-access";
import {
  BUSINESS_MAX_PROPERTIES,
  FREE_MAX_PROPERTIES,
  managerTierPropertyLimitReached,
  maxPropertiesForManagerTier,
  normalizeManagerSkuTier,
  PRO_MAX_PROPERTIES,
} from "@/lib/manager-access";
import { usePaidPortalBasePath } from "@/lib/portal-base-path-client";

export function ManagerProperties() {
  const { showToast } = useAppUi();
  const portalBase = usePaidPortalBasePath();
  const { userId } = useManagerUserId();
  const [pendingCount, setPendingCount] = useState(0);
  const [skuLoaded, setSkuLoaded] = useState(false);
  const [skuTier, setSkuTier] = useState<string | null>(null);
  const [propCount, setPropCount] = useState(0);
  const [wizardOpen, setWizardOpen] = useState(false);

  const refreshPortfolio = useCallback(async () => {
    if (!userId) {
      setPendingCount(0);
      setPropCount(0);
      return;
    }
    await syncManagerPortfolioFromServer(userId, { force: true });
    setPropCount(countManagerManagedPropertiesForUser(userId));
    setPendingCount(readPendingManagerPropertiesForUser(userId).length);
  }, [userId]);

  const refreshPending = refreshPortfolio;

  const loadSku = useCallback(async () => {
    try {
      const res = await fetch("/api/manager/subscription", { credentials: "include" });
      const body = (await res.json()) as { tier?: string | null };
      if (res.ok) {
        setSkuTier(body.tier ?? null);
      }
    } catch {
      /* ignore */
    } finally {
      setSkuLoaded(true);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void loadSku();
    });
  }, [loadSku]);

  useEffect(() => {
    void refreshPortfolio().then(() => {
      void mirrorLocalPropertyPipelineToServer();
    });
    const on = () => {
      void refreshPortfolio();
    };
    window.addEventListener(PROPERTY_PIPELINE_EVENT, on);
    window.addEventListener("axis-pro-relationships", on);
    return () => {
      window.removeEventListener(PROPERTY_PIPELINE_EVENT, on);
      window.removeEventListener("axis-pro-relationships", on);
    };
  }, [refreshPortfolio]);

  const atPropertyLimit = skuLoaded && managerTierPropertyLimitReached(skuTier, propCount);
  const limitMax = maxPropertiesForManagerTier(skuTier);

  const tryOpenAdd = () => {
    if (!skuLoaded) {
      showToast("Loading subscription…");
      void loadSku();
      return;
    }
    if (!userId) {
      showToast("Sign in to create a listing.");
      return;
    }
    if (atPropertyLimit) {
      const n = normalizeManagerSkuTier(skuTier);
      showToast(
        n === "free"
          ? `Free includes ${FREE_MAX_PROPERTIES} property. Upgrade to Pro or Business for more.`
          : n === "pro"
            ? `Pro includes up to ${PRO_MAX_PROPERTIES} properties. Upgrade to Business for more.`
            : `Business includes up to ${BUSINESS_MAX_PROPERTIES} properties.`,
      );
      return;
    }
    setWizardOpen(true);
  };

  return (
    <>
    <ManagerPortalPageShell
      title="Properties"
      titleAside={
        <>
          <Button type="button" variant="primary" className={`shrink-0 ${PORTAL_HEADER_ACTION_BTN}`} onClick={tryOpenAdd}>
            + Create listing
          </Button>
        </>
      }
    >
      {atPropertyLimit && limitMax != null ? (
        <p className="mb-4 rounded-2xl border border-rose-200/80 bg-rose-50/70 px-4 py-3 text-sm text-rose-950">
          You&apos;ve reached your plan limit of {limitMax} propert{limitMax === 1 ? "y" : "ies"}.{" "}
          <Link className="font-semibold underline underline-offset-2 hover:text-rose-900" href={`${portalBase}/plan`}>
            View plans
          </Link>{" "}
          to add more.
        </p>
      ) : null}
      {pendingCount > 0 ? (
        <p className="mb-4 rounded-2xl border border-amber-200/80 bg-amber-50/60 px-4 py-3 text-sm text-amber-950">
          <span className="font-semibold">{pendingCount}</span> propert{pendingCount === 1 ? "y" : "ies"} awaiting admin
          approval before they go live on Axis listings.
        </p>
      ) : null}
      <ManagerHousePropertiesPanel showToast={showToast} />
    </ManagerPortalPageShell>
    {wizardOpen ? (
      <ManagerAddListingForm
        onClose={() => setWizardOpen(false)}
        onSubmitted={() => {
          setWizardOpen(false);
          refreshPending();
          showToast("Listing submitted for admin review.");
        }}
        showToast={showToast}
        skuTier={skuTier}
        propCountBeforeSubmit={propCount}
      />
    ) : null}
    </>
  );
}
