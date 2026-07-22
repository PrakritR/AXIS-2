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
import { isDemoModeActive, resolveManagerScopeUserId } from "@/lib/demo/demo-session";
import { isNativeRuntimeSync } from "@/lib/native/detect-native";
import {
  DEMO_OPEN_CREATE_LISTING_EVENT,
  DEMO_PROPERTIES_STAGE_EVENT,
  type DemoPropertiesStage,
} from "@/lib/demo/demo-playback";
import { useManagerUserId } from "@/hooks/use-manager-user-id";
import { adminKpiCounts } from "@/lib/demo-admin-property-inventory";
import {
  countManagerManagedPropertiesForUser,
  mirrorLocalPropertyPipelineToServer,
  PROPERTY_PIPELINE_EVENT,
} from "@/lib/demo-property-pipeline";
import { collectLinkedPropertyIds, syncManagerPortfolioFromServer } from "@/lib/manager-portfolio-access";
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
  const scopeUserId = resolveManagerScopeUserId(userId);
  const [skuLoaded, setSkuLoaded] = useState(false);
  const [skuTier, setSkuTier] = useState<string | null>(null);
  const [propCount, setPropCount] = useState(0);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [portfolioTick, setPortfolioTick] = useState(0);
  const [shareListingOpen, setShareListingOpen] = useState(false);
  const [shareListingPropertyId, setShareListingPropertyId] = useState<string | undefined>();
  const [demoStage, setDemoStage] = useState<ManagerStageKey>("listed");

  const activeStage = isDemoModeActive()
    ? demoStage
    : managerStageFromParam(searchParams.get("status"));

  const setActiveStage = useCallback(
    (stage: ManagerStageKey) => {
      if (isDemoModeActive()) {
        setDemoStage(stage);
        return;
      }
      const next = new URLSearchParams(searchParams.toString());
      next.set("status", stage);
      const query = next.toString();
      router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const refreshPortfolio = useCallback(async () => {
    if (!scopeUserId) {
      setPropCount(0);
      return;
    }
    if (!isDemoModeActive()) {
      try {
        await syncManagerPortfolioFromServer(scopeUserId, { force: true });
      } catch {
        /* offline or dev server recompiling */
      }
    }
    setPropCount(countManagerManagedPropertiesForUser(scopeUserId));
    setPortfolioTick((t) => t + 1);
  }, [scopeUserId]);

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
        // Only push local state up once a real sync has run (userId resolved) — otherwise
        // this re-uploads a stale locally-cached snapshot and can clobber an admin-side
        // status change (e.g. request-change) that happened since this browser last synced.
        if (userId) void mirrorLocalPropertyPipelineToServer(userId, collectLinkedPropertyIds(userId));
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
  }, [refreshPortfolio, userId]);

  const stageCounts = useMemo(() => {
    void portfolioTick;
    const kpiValues = adminKpiCounts(scopeUserId);
    return {
      listed: kpiValues[2],
      unlisted: kpiValues[3],
      drafts: kpiValues[5],
    };
  }, [portfolioTick, scopeUserId]);

  const shareableProperties = useMemo(() => {
    void portfolioTick;
    return buildManagerShareablePropertyOptions(scopeUserId);
  }, [scopeUserId, portfolioTick]);

  const atPropertyLimit = skuLoaded && managerTierPropertyLimitReached(skuTier, propCount);
  const limitMax = maxPropertiesForManagerTier(skuTier);

  const tryOpenAdd = () => {
    if (!skuLoaded) {
      showToast("Loading subscription…");
      void loadSku();
      return;
    }
    if (!scopeUserId) {
      showToast("Sign in to create a listing.");
      return;
    }
    if (atPropertyLimit) {
      const n = normalizeManagerSkuTier(skuTier);
      // On native iOS, drop the "Upgrade to …" clause — Apple forbids surfacing
      // subscription upgrade CTAs outside IAP (Guideline 2.1(b)). Web is unchanged.
      const upsell = (clause: string) => (isNativeRuntimeSync() ? "" : ` ${clause}`);
      showToast(
        n === "free"
          ? `Free includes ${FREE_MAX_PROPERTIES} property.${upsell("Upgrade to Pro or Business for more.")}`
          : n === "pro"
            ? `Pro includes up to ${PRO_MAX_PROPERTIES} properties.${upsell("Upgrade to Business for more.")}`
            : `Business includes up to ${BUSINESS_MAX_PROPERTIES} properties.`,
      );
      return;
    }
    setWizardOpen(true);
  };

  useEffect(() => {
    if (!isDemoModeActive()) return;
    const onOpen = () => tryOpenAdd();
    const onStage = (e: Event) => {
      const stage = (e as CustomEvent<{ stage?: DemoPropertiesStage }>).detail?.stage;
      if (stage === "listed" || stage === "unlisted") setActiveStage(stage);
    };
    window.addEventListener(DEMO_OPEN_CREATE_LISTING_EVENT, onOpen);
    window.addEventListener(DEMO_PROPERTIES_STAGE_EVENT, onStage as EventListener);
    return () => {
      window.removeEventListener(DEMO_OPEN_CREATE_LISTING_EVENT, onOpen);
      window.removeEventListener(DEMO_PROPERTIES_STAGE_EVENT, onStage as EventListener);
    };
  }, [setActiveStage]);

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
        title={shareableProperties.length === 0 ? "No listed properties to share yet" : "Share a listing link"}
        data-attr="manager-properties-share"
        onClick={() => openShareListing()}
      >
        Share
      </Button>
      <Button type="button" variant="primary" className={`shrink-0 ${PORTAL_HEADER_ACTION_BTN}`} data-attr="manager-properties-create" onClick={tryOpenAdd}>
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
            <div className="min-w-0 w-full max-w-full">
              <ManagerPortalStatusPills
                compact
                tabs={MANAGER_STAGES.map((stage) => ({
                  id: stage.key,
                  label: stage.label,
                  count: stageCounts[stage.key],
                  dataAttr: `manager-properties-tab-${stage.key}`,
                }))}
                activeId={activeStage}
                onChange={(id) => setActiveStage(id as ManagerStageKey)}
              />
            </div>
          </ManagerPortalFilterRow>
        }
      >
        {atPropertyLimit && limitMax != null ? (
          <p className="mb-4 rounded-2xl border px-4 py-3 text-sm portal-banner-danger lg:mb-4">
            You&apos;ve reached your plan limit of {limitMax} propert{limitMax === 1 ? "y" : "ies"}.
            {/* The plan-upgrade CTA is a subscription surface — hidden on native (iOS). */}
            <span className="native-hide">
              {" "}
              <Link className="font-semibold underline underline-offset-2 hover:text-rose-900" href={MANAGER_PLAN_PORTAL_URL}>
                View plans
              </Link>{" "}
              to add more.
            </span>
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
            showToast("Listing submitted and published.");
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
