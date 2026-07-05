"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ManagerAddListingForm } from "@/components/portal/manager-add-listing-form";
import {
  ManagerHousePropertiesPanel,
  MANAGER_STAGES,
  managerStageFromParam,
  type ManagerStageKey,
} from "@/components/portal/manager-house-properties-panel";
import { ShareLeadLinkModal } from "@/components/portal/share-lead-link-modal";
import {
  ManagerPortalFilterRow,
  ManagerPortalPageShell,
  ManagerPortalStatusPills,
  PORTAL_HEADER_ACTION_BTN,
} from "@/components/portal/portal-metrics";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { isDemoModeActive } from "@/lib/demo/demo-session";
import { useManagerUserId } from "@/hooks/use-manager-user-id";
import { adminKpiCounts } from "@/lib/demo-admin-property-inventory";
import {
  countManagerManagedPropertiesForUser,
  mirrorLocalPropertyPipelineToServer,
  PROPERTY_PIPELINE_EVENT,
} from "@/lib/demo-property-pipeline";
import { syncManagerPortfolioFromServer } from "@/lib/manager-portfolio-access";
import { buildManagerShareablePropertyOptions } from "@/lib/manager-property-links";
import { MANAGER_PLAN_PORTAL_URL } from "@/lib/portals/manager-plan-path";
import {
  BUSINESS_MAX_PROPERTIES,
  FREE_MAX_PROPERTIES,
  managerTierPropertyLimitReached,
  maxPropertiesForManagerTier,
  normalizeManagerSkuTier,
  PRO_MAX_PROPERTIES,
} from "@/lib/manager-access";

export function ManagerProperties() {
  const { showToast } = useAppUi();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { userId } = useManagerUserId();
  const [skuLoaded, setSkuLoaded] = useState(false);
  const [skuTier, setSkuTier] = useState<string | null>(null);
  const [propCount, setPropCount] = useState(0);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [portfolioTick, setPortfolioTick] = useState(0);
  const [shareListingOpen, setShareListingOpen] = useState(false);
  const [shareListingPropertyId, setShareListingPropertyId] = useState<string | undefined>();

  const activeStage = managerStageFromParam(searchParams.get("status"));

  const setActiveStage = useCallback(
    (stage: ManagerStageKey) => {
      const next = new URLSearchParams(searchParams.toString());
      if (stage === "pending") next.delete("status");
      else next.set("status", stage);
      const query = next.toString();
      router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const refreshPortfolio = useCallback(async () => {
    if (!userId) {
      setPropCount(0);
      return;
    }
    try {
      await syncManagerPortfolioFromServer(userId, { force: true });
    } catch {
      /* offline or dev server recompiling */
    }
    setPropCount(countManagerManagedPropertiesForUser(userId));
    setPortfolioTick((t) => t + 1);
  }, [userId]);

  const refreshPending = refreshPortfolio;

  const loadSku = useCallback(async () => {
    if (isDemoModeActive()) {
      setSkuLoaded(true);
      return;
    }
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
    queueMicrotask(() => {
      void refreshPortfolio().then(() => {
        void mirrorLocalPropertyPipelineToServer();
      });
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

  const stageCounts = useMemo(() => {
    void portfolioTick;
    const kpiValues = adminKpiCounts(userId);
    return {
      pending: kpiValues[0] + kpiValues[1],
      listed: kpiValues[2],
      unlisted: kpiValues[3],
      rejected: kpiValues[4],
    };
  }, [portfolioTick, userId]);

  const shareableProperties = useMemo(() => {
    void portfolioTick;
    return buildManagerShareablePropertyOptions(userId);
  }, [userId, portfolioTick]);

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

  const openShareListing = (listingId?: string) => {
    setShareListingPropertyId(listingId);
    setShareListingOpen(true);
  };

  const propertiesHeaderActions = (
    <>
      <Button
        type="button"
        variant="outline"
        className={`shrink-0 ${PORTAL_HEADER_ACTION_BTN}`}
        disabled={shareableProperties.length === 0}
        title={shareableProperties.length === 0 ? "No listed properties to share yet" : undefined}
        onClick={() => openShareListing()}
      >
        Send
      </Button>
      <Button type="button" variant="primary" className={`shrink-0 ${PORTAL_HEADER_ACTION_BTN}`} onClick={tryOpenAdd}>
        Create
      </Button>
    </>
  );

  return (
    <>
      <ManagerPortalPageShell
        title="Properties"
        titleAside={propertiesHeaderActions}
        filterRow={
          <ManagerPortalFilterRow>
            <ManagerPortalStatusPills
              tabs={MANAGER_STAGES.map((stage) => ({
                id: stage.key,
                label: stage.label,
                count: stageCounts[stage.key],
              }))}
              activeId={activeStage}
              onChange={(id) => setActiveStage(id as ManagerStageKey)}
            />
          </ManagerPortalFilterRow>
        }
      >
        {atPropertyLimit && limitMax != null ? (
          <p className="mb-4 rounded-2xl border px-4 py-3 text-sm portal-banner-danger lg:mb-4">
            You&apos;ve reached your plan limit of {limitMax} propert{limitMax === 1 ? "y" : "ies"}.{" "}
            <Link className="font-semibold underline underline-offset-2 hover:text-rose-900" href={MANAGER_PLAN_PORTAL_URL}>
              View plans
            </Link>{" "}
            to add more.
          </p>
        ) : null}
        <ManagerHousePropertiesPanel
          showToast={showToast}
          activeStage={activeStage}
          onStageChange={setActiveStage}
          onSendToProspect={openShareListing}
        />
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
      <ShareLeadLinkModal
        open={shareListingOpen}
        onClose={() => setShareListingOpen(false)}
        kind="listing"
        properties={shareableProperties}
        preselectedPropertyId={shareListingPropertyId}
      />
    </>
  );
}
