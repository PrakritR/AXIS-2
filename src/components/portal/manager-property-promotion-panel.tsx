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
import { PromotionAssetStack } from "@/components/portal/promotion-asset-list";
import {
  PromotionFlyerAssetDetail,
  PromotionFlyerHeaderActions,
  PromotionTextAssetDetail,
  PromotionTextHeaderActions,
} from "@/components/portal/promotion-asset-detail";
import { PromotionNewChooserModal } from "@/components/portal/promotion-new-chooser-modal";
import { PromotionTextGenerateModal } from "@/components/portal/promotion-text-generate-modal";
import { useManagerUserId } from "@/hooks/use-manager-user-id";
import { track } from "@/lib/analytics/track-client";
import { syncPropertyPipelineFromServer, PROPERTY_PIPELINE_EVENT } from "@/lib/demo-property-pipeline";
import { buildManagerPromotionPropertyOptions } from "@/lib/manager-property-links";
import {
  MANAGER_PROMOTIONS_EVENT,
  generateFlyerCopy,
  generatePromotionTextCopy,
  makePromotionId,
  readManagerPromotionRows,
  syncManagerPromotionsFromServer,
  upsertManagerPromotion,
  deleteManagerPromotionRow,
} from "@/lib/manager-promotions-storage";
import {
  flattenPromotionAssets,
  makePromotionAssetId,
  nextPromotionAssetDefaultTitle,
  sortPromotionAssets,
  type PromotionAsset,
  type PromotionAssetKind,
} from "@/lib/promotion-assets";
import {
  FLYER_IMAGE_LIMIT,
  normalizePromotionTemplate,
  PROMOTION_TEMPLATE_DEFAULT,
  PROMOTION_TONE_OPTIONS,
  readFlyerEntries,
  type FlyerEntry,
  type ManagerPromotionRow,
} from "@/lib/promotion-flyer";
import {
  buildFlyerEntryFromDraft,
  buildTextEntryFromCopy,
  removeFlyerEntryFromRow,
  removeTextEntryFromRow,
  syncPromotionRowLegacy,
  updateFlyerEntryOnRow,
  updateTextEntryOnRow,
} from "@/lib/promotion-row-ops";
import { type PromotionTextEntry, type PromotionTextFormat } from "@/lib/promotion-text";

function flyerEntryToDraft(row: ManagerPromotionRow, entry: FlyerEntry, listingId: string): PromotionDraft {
  return {
    propertyKey: listingId,
    propertyLabel: row.propertyLabel,
    address: entry.inputs.address ?? "",
    title: entry.title,
    headline: entry.inputs.headline,
    sellingPoints: entry.inputs.sellingPoints,
    customDetails: entry.inputs.customDetails,
    price: entry.inputs.price,
    promo: entry.inputs.promo,
    cta: entry.inputs.cta,
    contact: entry.inputs.contact,
    schedulingUrl: entry.inputs.schedulingUrl ?? "",
    includeSchedulingLink: entry.inputs.includeSchedulingLink ?? true,
    theme: entry.theme,
    flyerSize: entry.flyerSize,
    template: normalizePromotionTemplate(entry.template),
    tone: entry.inputs.tone || PROMOTION_TONE_OPTIONS[0]!,
    aiPrompt: "",
    images: entry.inputs.images ?? [],
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
  const { userId, email: managerEmail, ready: authReady } = useManagerUserId();
  const [tick, setTick] = useState(0);
  const [propertyTick, setPropertyTick] = useState(0);
  const [showChooser, setShowChooser] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState<PromotionDraft>(EMPTY_DRAFT);
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generatingTextId, setGeneratingTextId] = useState<string | null>(null);
  const [textModalAssetId, setTextModalAssetId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sectionExpanded, setSectionExpanded] = useState(false);

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

  const autofillOpts = useMemo(() => ({ managerContact: managerEmail ?? "" }), [managerEmail]);

  const propertyId = listingId.trim();

  const assets = useMemo(() => {
    void tick;
    if (!propertyId) return [];
    const rows = readManagerPromotionRows().filter((row) => row.propertyId === propertyId);
    return sortPromotionAssets(flattenPromotionAssets(rows), "newest");
  }, [propertyId, tick]);

  const openFlyerForm = useCallback(() => {
    setEditingRowId(null);
    setEditingEntryId(null);
    setDraft(draftWithPropertyKey(EMPTY_DRAFT, propertyId, listings, autofillOpts));
    setShowForm(true);
  }, [listings, propertyId, autofillOpts]);

  const openEditFlyer = useCallback(
    (row: ManagerPromotionRow, entryId: string) => {
      const entry = readFlyerEntries(row).find((e) => e.id === entryId);
      if (!entry) return;
      setDraft(flyerEntryToDraft(row, entry, propertyId));
      setEditingRowId(row.id);
      setEditingEntryId(entryId);
      setShowForm(true);
    },
    [propertyId],
  );

  const closeForm = useCallback(() => {
    setShowForm(false);
    setEditingRowId(null);
    setEditingEntryId(null);
    setDraft(EMPTY_DRAFT);
  }, []);

  function onChooseNewKind(kind: PromotionAssetKind) {
    setShowChooser(false);
    if (kind === "flyer") {
      openFlyerForm();
      return;
    }
    setTextModalAssetId("__new__");
  }

  async function generate() {
    const label = draft.propertyLabel.trim();
    const entryTitle = draft.title.trim() || nextPromotionAssetDefaultTitle(assets, "flyer");
    if (!label && !draft.headline.trim()) {
      showToast("Add a property/listing or a headline first.");
      return;
    }
    const editingRow = editingRowId ? readManagerPromotionRows().find((p) => p.id === editingRowId) ?? null : null;
    setGenerating(true);
    if (editingRow) {
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
      const { copy, source } = await generateFlyerCopy(inputs, label, {
        propertyId,
        extraInstructions: draft.aiPrompt,
      });
      if (source === "forbidden") {
        showToast("You can only create flyers for your own properties.");
        return;
      }
      const now = new Date().toISOString();
      let savedRow: ManagerPromotionRow;
      let entryId: string;

      if (editingRow && editingEntryId) {
        entryId = editingEntryId;
        savedRow = updateFlyerEntryOnRow(editingRow, editingEntryId, {
          title: entryTitle,
          copy,
          inputs,
          theme: draft.theme,
          flyerSize: draft.flyerSize,
          template: draft.template,
        });
      } else {
        const entry = buildFlyerEntryFromDraft({
          title: entryTitle,
          copy,
          inputs,
          theme: draft.theme,
          flyerSize: draft.flyerSize,
          template: draft.template,
          now,
        });
        entryId = entry.id;
        savedRow = syncPromotionRowLegacy({
          id: makePromotionId(),
          managerUserId: userId ?? null,
          propertyId,
          propertyLabel: label,
          title: entryTitle,
          theme: draft.theme,
          flyerSize: draft.flyerSize,
          template: draft.template,
          status: "generated",
          inputs,
          copy,
          textCopy: null,
          flyerCopies: [entry],
          createdAt: now,
          updatedAt: now,
        });
      }

      upsertManagerPromotion({ ...savedRow, updatedAt: now });
      closeForm();
      setTick((n) => n + 1);
      setExpandedId(makePromotionAssetId(savedRow.id, "flyer", entryId));
      onUpdated?.();
      showToast(
        editingRow
          ? "Flyer updated."
          : source === "ai"
            ? "Flyer generated."
            : "Flyer generated (offline copy).",
      );
    } catch {
      showToast(editingRow ? "Could not update the flyer. Try again." : "Could not generate the flyer. Try again.");
    } finally {
      setGenerating(false);
    }
  }

  async function createOrRegenerateText(
    opts: { format: PromotionTextFormat; tone: string; extraInstructions: string; images: string[] },
    asset: PromotionAsset | null,
  ) {
    if (asset?.textEntry) {
      setGeneratingTextId(asset.textEntry.id);
      try {
        const inputs = {
          ...asset.row.inputs,
          tone: opts.tone.trim() || asset.row.inputs.tone,
          images: opts.images.slice(0, FLYER_IMAGE_LIMIT),
        };
        const { copy, source } = await generatePromotionTextCopy(
          inputs,
          asset.row.propertyLabel,
          opts.format,
          { propertyId: asset.row.propertyId, extraInstructions: opts.extraInstructions },
        );
        if (source === "forbidden") {
          showToast("You can only create promotions for your own properties.");
          return;
        }
        upsertManagerPromotion(
          updateTextEntryOnRow({ ...asset.row, inputs }, asset.textEntry.id, {
            copy,
            updatedAt: new Date().toISOString(),
          }),
        );
        setTextModalAssetId(null);
        setTick((n) => n + 1);
        onUpdated?.();
        showToast(source === "ai" ? "Promotion text generated." : "Promotion text generated (offline copy).");
      } catch {
        showToast("Could not generate promotion text.");
      } finally {
        setGeneratingTextId(null);
      }
      return;
    }

    const base = draftWithPropertyKey(EMPTY_DRAFT, propertyId, listings, autofillOpts);
    const label = base.propertyLabel.trim() || base.headline.trim() || "Untitled promotion";
    const entryTitle = nextPromotionAssetDefaultTitle(assets, "text");
    setGeneratingTextId("__new__");
    try {
      const inputs = draftInputs({
        ...base,
        tone: opts.tone.trim() || base.tone,
        images: opts.images,
      });
      const { copy, source } = await generatePromotionTextCopy(inputs, label, opts.format, {
        propertyId,
        extraInstructions: opts.extraInstructions,
      });
      if (source === "forbidden") {
        showToast("You can only create promotions for your own properties.");
        return;
      }
      const now = new Date().toISOString();
      const entry = buildTextEntryFromCopy(copy, entryTitle, now);
      const row = syncPromotionRowLegacy({
        id: makePromotionId(),
        managerUserId: userId ?? null,
        propertyId,
        propertyLabel: label,
        title: entryTitle,
        theme: "cobalt",
        flyerSize: "letter",
        template: PROMOTION_TEMPLATE_DEFAULT,
        status: "generated",
        inputs,
        copy: null,
        textCopy: copy,
        textCopies: [entry],
        createdAt: now,
        updatedAt: now,
      });
      upsertManagerPromotion(row);
      setTextModalAssetId(null);
      setExpandedId(makePromotionAssetId(row.id, "text", entry.id));
      setTick((n) => n + 1);
      onUpdated?.();
      showToast(source === "ai" ? "Promotion text created." : "Promotion text created (offline copy).");
    } catch {
      showToast("Could not generate promotion text.");
    } finally {
      setGeneratingTextId(null);
    }
  }

  function saveAssetTitle(asset: PromotionAsset, title: string) {
    if (asset.kind === "flyer" && asset.flyerEntry) {
      upsertManagerPromotion(updateFlyerEntryOnRow(asset.row, asset.flyerEntry.id, { title }));
    } else if (asset.kind === "text" && asset.textEntry) {
      upsertManagerPromotion(updateTextEntryOnRow(asset.row, asset.textEntry.id, { title }));
    }
    setTick((n) => n + 1);
    onUpdated?.();
  }

  function saveTextEntry(row: ManagerPromotionRow, entry: PromotionTextEntry) {
    upsertManagerPromotion(updateTextEntryOnRow(row, entry.id, entry));
    setTick((n) => n + 1);
    onUpdated?.();
  }

  function deleteAsset(asset: PromotionAsset) {
    if (asset.kind === "flyer" && asset.flyerEntry) {
      const next = removeFlyerEntryFromRow(asset.row, asset.flyerEntry.id);
      if (next) upsertManagerPromotion(next);
      else deleteManagerPromotionRow(asset.row.id);
    } else if (asset.kind === "text" && asset.textEntry) {
      const next = removeTextEntryFromRow(asset.row, asset.textEntry.id);
      if (next) upsertManagerPromotion(next);
      else deleteManagerPromotionRow(asset.row.id);
    }
    if (expandedId === asset.id) setExpandedId(null);
    setTick((n) => n + 1);
    onUpdated?.();
    showToast("Promotion deleted.");
  }

  if (!propertyId) return null;

  const textModalAsset =
    textModalAssetId && textModalAssetId !== "__new__"
      ? assets.find((a) => a.id === textModalAssetId) ?? null
      : null;

  const renderHeaderActions = (asset: PromotionAsset) => {
    if (asset.kind === "flyer") {
      return (
        <PromotionFlyerHeaderActions
          asset={asset}
          onEdit={openEditFlyer}
          onDelete={(_row, entryId) => {
            const flyerAsset = assets.find(
              (a) => a.row.id === asset.row.id && a.flyerEntry?.id === entryId,
            );
            if (flyerAsset) deleteAsset(flyerAsset);
          }}
          canDelete
        />
      );
    }

    return (
      <PromotionTextHeaderActions
        asset={asset}
        onEdit={(row, entryId) =>
          setTextModalAssetId(makePromotionAssetId(row.id, "text", entryId))
        }
        onDelete={(row, entryId) => {
          const textAsset = assets.find((a) => a.row.id === row.id && a.textEntry?.id === entryId);
          if (textAsset) deleteAsset(textAsset);
        }}
        editing={generatingTextId === asset.textEntry?.id}
        showToast={showToast}
      />
    );
  };

  const renderExpanded = (asset: PromotionAsset) => {
    if (asset.kind === "flyer") {
      return <PromotionFlyerAssetDetail asset={asset} />;
    }

    return (
      <PromotionTextAssetDetail
        asset={asset}
        onSave={saveTextEntry}
        showToast={showToast}
      />
    );
  };

  return (
    <>
      <PortalCollapsibleSection
        title="Promotion"
        expanded={sectionExpanded}
        onExpandedChange={setSectionExpanded}
        collapsible
        className="mt-4"
        toggleDataAttr="promotion-section-toggle"
        headerActions={
          <Button
            type="button"
            variant="outline"
            className="h-8 rounded-full px-3 text-xs"
            onClick={() => setShowChooser(true)}
            data-attr="manager-property-new-promotion"
          >
            New promotion
          </Button>
        }
        contentClassName="px-4 py-3"
      >
        <PromotionAssetStack
          assets={assets}
          expandedId={expandedId}
          onToggleExpand={(id) => setExpandedId((cur) => (cur === id ? null : id))}
          onSaveTitle={saveAssetTitle}
          renderHeaderActions={renderHeaderActions}
          renderExpanded={renderExpanded}
          emptyMessage="No promotions for this property yet."
        />
      </PortalCollapsibleSection>

      <PromotionNewChooserModal
        open={showChooser}
        onClose={() => setShowChooser(false)}
        onChoose={onChooseNewKind}
      />

      <PromotionTextGenerateModal
        open={textModalAssetId !== null}
        onClose={() => {
          setTextModalAssetId(null);
        }}
        busy={generatingTextId !== null}
        initialFormat={textModalAsset?.textEntry?.copy.format}
        initialTone={
          textModalAsset?.row.inputs.tone ??
          draftWithPropertyKey(EMPTY_DRAFT, propertyId, listings, autofillOpts).tone
        }
        initialImages={
          textModalAsset?.row.inputs.images ??
          draftWithPropertyKey(EMPTY_DRAFT, propertyId, listings, autofillOpts).images
        }
        onGenerate={(opts) => {
          void createOrRegenerateText(opts, textModalAsset);
        }}
      />

      <Modal
        open={showForm}
        title={editingEntryId ? "Edit flyer" : "New flyer"}
        onClose={closeForm}
        panelClassName="max-w-2xl"
        footer={
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => void generate()} disabled={generating} data-attr="promotion-generate">
              {generating ? "Generating…" : editingEntryId ? "Update flyer" : "Generate flyer"}
            </Button>
            <Button type="button" variant="outline" onClick={closeForm}>
              Cancel
            </Button>
          </div>
        }
      >
        <PromotionForm
          draft={draft}
          setDraft={setDraft}
          listings={listings}
          onSelectProperty={() => {}}
          hidePropertyPicker
        />
      </Modal>
    </>
  );
}
