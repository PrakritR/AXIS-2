"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { PortalCollapsibleSection } from "@/components/portal/portal-collapsible-section";
import {
  EMPTY_DRAFT,
  PromotionForm,
  draftInputs,
  draftWithPropertyKey,
  type PromotionDraft,
} from "@/components/portal/manager-promotion";
import { PromotionFlyerPreview, downloadPromotionFlyer } from "@/components/portal/promotion-flyer-preview";
import { useManagerUserId } from "@/hooks/use-manager-user-id";
import { track } from "@/lib/analytics/track-client";
import { syncPropertyPipelineFromServer, PROPERTY_PIPELINE_EVENT } from "@/lib/demo-property-pipeline";
import { buildManagerPromotionPropertyOptions } from "@/lib/manager-property-links";
import {
  MANAGER_PROMOTIONS_EVENT,
  generateFlyerCopy,
  makePromotionId,
  readManagerPromotionRows,
  syncManagerPromotionsFromServer,
  upsertManagerPromotion,
} from "@/lib/manager-promotions-storage";
import { normalizePromotionTemplate, PROMOTION_TONE_OPTIONS, type ManagerPromotionRow } from "@/lib/promotion-flyer";

function rowToDraft(row: ManagerPromotionRow): PromotionDraft {
  return {
    propertyKey: row.propertyId ?? "",
    propertyLabel: row.propertyLabel,
    address: row.inputs.address ?? "",
    title: row.title,
    headline: row.inputs.headline,
    sellingPoints: row.inputs.sellingPoints,
    customDetails: row.inputs.customDetails,
    price: row.inputs.price,
    promo: row.inputs.promo,
    cta: row.inputs.cta,
    contact: row.inputs.contact,
    theme: row.theme,
    flyerSize: row.flyerSize,
    template: normalizePromotionTemplate(row.template),
    tone: row.inputs.tone || PROMOTION_TONE_OPTIONS[0]!,
    images: row.inputs.images ?? [],
  };
}

export function ManagerPropertyPromotionPanel({
  listingId,
  showToast,
  onUpdated,
}: {
  listingId: string;
  showToast: (m: string) => void;
  onUpdated?: () => void;
}) {
  const { userId, ready: authReady } = useManagerUserId();
  const [tick, setTick] = useState(0);
  const [propertyTick, setPropertyTick] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState<PromotionDraft>(EMPTY_DRAFT);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [previewEpoch, setPreviewEpoch] = useState(0);
  const [flyerExpanded, setFlyerExpanded] = useState(true);

  useEffect(() => {
    if (!authReady) return;
    void syncManagerPromotionsFromServer({ force: true });
    void syncPropertyPipelineFromServer({ force: true });
  }, [authReady, userId]);

  useEffect(() => {
    const bump = () => setTick((n) => n + 1);
    const bumpProps = () => setPropertyTick((n) => n + 1);
    window.addEventListener(MANAGER_PROMOTIONS_EVENT, bump);
    window.addEventListener(PROPERTY_PIPELINE_EVENT, bumpProps);
    return () => {
      window.removeEventListener(MANAGER_PROMOTIONS_EVENT, bump);
      window.removeEventListener(PROPERTY_PIPELINE_EVENT, bumpProps);
    };
  }, []);

  const listings = useMemo(() => {
    void propertyTick;
    return buildManagerPromotionPropertyOptions(userId);
  }, [userId, propertyTick]);

  const promotion = useMemo(() => {
    void tick;
    const id = listingId.trim();
    if (!id) return null;
    return (
      readManagerPromotionRows()
        .filter((row) => row.propertyId === id)
        .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0] ?? null
    );
  }, [listingId, tick]);

  useEffect(() => {
    setFlyerExpanded(true);
  }, [promotion?.id, promotion?.updatedAt]);

  const openForm = useCallback(() => {
    if (promotion) {
      setDraft(rowToDraft(promotion));
      setEditingId(promotion.id);
    } else {
      setDraft(draftWithPropertyKey(EMPTY_DRAFT, listingId, listings));
      setEditingId(null);
    }
    setShowForm(true);
  }, [listingId, listings, promotion]);

  const closeForm = useCallback(() => {
    setShowForm(false);
    setEditingId(null);
    setDraft(EMPTY_DRAFT);
    setPreviewEpoch((n) => n + 1);
  }, []);

  async function generate() {
    const label = draft.propertyLabel.trim();
    const title = draft.title.trim() || draft.headline.trim() || label || "Untitled promotion";
    if (!label && !draft.headline.trim()) {
      showToast("Add a property/listing or a headline first.");
      return;
    }
    const propertyId = listingId.trim() || null;
    const editing = editingId ? readManagerPromotionRows().find((p) => p.id === editingId) ?? null : null;
    setGenerating(true);
    if (editing) {
      track("promotion_regenerated", { theme: draft.theme, template: draft.template });
    } else {
      track("promotion_generation_started", {
        theme: draft.theme,
        flyer_size: draft.flyerSize,
        template: draft.template,
        photo_count: draft.images.length,
      });
    }
    try {
      const inputs = draftInputs(draft);
      const { copy, source } = await generateFlyerCopy(inputs, label, propertyId);
      if (source === "forbidden") {
        showToast("You can only create flyers for your own properties.");
        return;
      }
      const now = new Date().toISOString();
      upsertManagerPromotion({
        id: editing?.id ?? makePromotionId(),
        managerUserId: editing?.managerUserId ?? userId ?? null,
        propertyId,
        propertyLabel: label,
        title,
        theme: draft.theme,
        flyerSize: draft.flyerSize,
        template: draft.template,
        status: "generated",
        inputs,
        copy,
        createdAt: editing?.createdAt ?? now,
        updatedAt: now,
      });
      closeForm();
      setTick((n) => n + 1);
      onUpdated?.();
      showToast(
        editing
          ? "Flyer updated."
          : source === "ai"
            ? "Flyer generated."
            : "Flyer generated (offline copy).",
      );
    } catch {
      showToast(editing ? "Could not update the flyer. Try again." : "Could not generate the flyer. Try again.");
    } finally {
      setGenerating(false);
    }
  }

  if (!listingId.trim()) return null;

  const hasFlyer = Boolean(promotion?.copy);

  return (
    <>
      <PortalCollapsibleSection
        title="Promotion"
        expanded={hasFlyer ? flyerExpanded : true}
        onExpandedChange={hasFlyer ? setFlyerExpanded : undefined}
        collapsible={hasFlyer}
        toggleDataAttr="promotion-section-toggle"
        headerActions={
          <>
            {hasFlyer ? (
              <Button
                type="button"
                variant="outline"
                className="h-8 rounded-full px-3 text-xs"
                data-attr="promotion-flyer-download"
                onClick={() => downloadPromotionFlyer(promotion!)}
              >
                Download
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              className="h-8 rounded-full px-3 text-xs"
              data-attr="manager-property-create-flyer"
              onClick={openForm}
            >
              {hasFlyer ? "Edit flyer" : "Create flyer"}
            </Button>
          </>
        }
        contentClassName="min-w-0 max-w-full overflow-x-auto px-4 py-3"
      >
        {hasFlyer ? (
          <PromotionFlyerPreview
            key={`${promotion!.id}-${promotion!.updatedAt}-${previewEpoch}`}
            promotion={promotion!}
            embedded
          />
        ) : null}
      </PortalCollapsibleSection>

      <Modal
        open={showForm}
        title={editingId ? "Edit flyer" : "Create flyer"}
        onClose={closeForm}
        panelClassName="max-w-2xl"
      >
        {promotion?.copy && editingId ? (
          <div className="mb-4 min-w-0">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted">Current flyer</p>
            <PromotionFlyerPreview
              key={`modal-${promotion.id}-${promotion.updatedAt}`}
              promotion={promotion}
              embedded
            />
          </div>
        ) : null}
        <PromotionForm
          draft={draft}
          setDraft={setDraft}
          listings={listings}
          onSelectProperty={() => {}}
          hidePropertyPicker
        />
        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="button" onClick={() => void generate()} disabled={generating} data-attr="promotion-generate">
            {generating ? "Generating…" : editingId ? "Update flyer" : "Generate flyer"}
          </Button>
          <Button type="button" variant="outline" onClick={closeForm}>
            Cancel
          </Button>
        </div>
      </Modal>
    </>
  );
}
