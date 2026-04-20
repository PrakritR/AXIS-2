"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ManagerAddListingForm } from "@/components/portal/manager-add-listing-form";
import { ManagerHousePropertiesPanel } from "@/components/portal/manager-house-properties-panel";
import { ManagerPortalPageShell } from "@/components/portal/portal-metrics";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { useManagerUserId } from "@/hooks/use-manager-user-id";
import {
  countManagerManagedPropertiesForUser,
  PROPERTY_PIPELINE_EVENT,
  readPendingManagerPropertiesForUser,
} from "@/lib/demo-property-pipeline";
import { PRO_MAX_PROPERTIES, proTierPropertyLimitReached } from "@/lib/manager-access";

export function ManagerProperties() {
  const { showToast } = useAppUi();
  const { userId } = useManagerUserId();
  const [formOpen, setFormOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [skuLoaded, setSkuLoaded] = useState(false);
  const [skuTier, setSkuTier] = useState<string | null>(null);
  const [propCount, setPropCount] = useState(0);

  const refreshPending = useCallback(() => {
    if (!userId) {
      setPendingCount(0);
      setPropCount(0);
      return;
    }
    setPropCount(countManagerManagedPropertiesForUser(userId));
    setPendingCount(readPendingManagerPropertiesForUser(userId).length);
  }, [userId]);

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
    void loadSku();
  }, [loadSku]);

  useEffect(() => {
    refreshPending();
    const on = () => refreshPending();
    window.addEventListener(PROPERTY_PIPELINE_EVENT, on);
    return () => window.removeEventListener(PROPERTY_PIPELINE_EVENT, on);
  }, [refreshPending]);

  const atProLimit = skuLoaded && proTierPropertyLimitReached(skuTier, propCount);

  const tryOpenAdd = () => {
    if (!skuLoaded) {
      showToast("Loading subscription…");
      void loadSku();
      return;
    }
    if (atProLimit) {
      showToast(
        `Pro includes up to ${PRO_MAX_PROPERTIES} properties. Upgrade to Business to add more.`,
      );
      return;
    }
    setFormOpen(true);
  };

  return (
    <>
      {formOpen ? (
        <ManagerAddListingForm
          showToast={showToast}
          skuTier={skuTier ?? null}
          propCountBeforeSubmit={propCount}
          onClose={() => setFormOpen(false)}
          onSubmitted={() => {
            showToast("Property submitted for admin approval. It will appear on public listings after approval.");
            refreshPending();
            void loadSku();
            setFormOpen(false);
          }}
        />
      ) : null}

      <ManagerPortalPageShell
        title="Properties"
        titleAside={
          <>
            <Button type="button" variant="primary" className="shrink-0 rounded-full" onClick={tryOpenAdd}>
              + Add property
            </Button>
            <Button
              type="button"
              variant="outline"
              className="shrink-0 rounded-full"
              onClick={() => {
                void loadSku();
                refreshPending();
              }}
            >
              Refresh
            </Button>
          </>
        }
      >
        {atProLimit ? (
          <p className="mb-4 rounded-2xl border border-rose-200/80 bg-rose-50/70 px-4 py-3 text-sm text-rose-950">
            You’ve reached the Pro limit of {PRO_MAX_PROPERTIES} properties.{" "}
            <Link className="font-semibold underline underline-offset-2 hover:text-rose-900" href="/manager/plan">
              Upgrade to Business
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
    </>
  );
}
