"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Modal, ModalFooter } from "@/components/ui/modal";
import {
  PORTAL_LIST_ADD_ICONS,
  PORTAL_LIST_ADD_ROW_WRAP_CLASS,
  PortalListAddRow,
} from "@/components/portal/portal-list-add-row";
import {
  PORTAL_PROPERTY_DETAIL_ACTION_BUTTON_CLASS,
  PORTAL_PROPERTY_DETAIL_LIST_ROW_CLASS,
  PortalPropertyDetailSection,
} from "@/components/portal/portal-property-detail-section";
import {
  EMPTY_DRAFT,
  PromotionForm,
  draftInputs,
  draftWithPropertyKey,
  promotionTextIdentityFromDraft,
  type PromotionDraft,
} from "@/components/portal/promotion-form";
import { PromotionNewModal } from "@/components/portal/promotion-new-modal";
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
  nextPromotionAssetDefaultTitle,
  promotionAssetBoxTitle,
  promotionAssetKindIndices,
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
  removeUploadEntryFromRow,
  appendUploadEntryToRow,
  syncPromotionRowLegacy,
  updateFlyerEntryOnRow,
  updateTextEntryOnRow,
} from "@/lib/promotion-row-ops";
import { type PromotionTextFormat } from "@/lib/promotion-text";
import {
  fileToPromotionUpload,
  makePromotionUploadId,
  readPromotionUploadEntries,
  type PromotionUploadEntry,
} from "@/lib/promotion-upload";

function promotionKindLabel(kind: PromotionAssetKind): string {
  if (kind === "flyer") return "Flyer";
  if (kind === "text") return "Text";
  return "Upload";
}

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
  headerActionsExtra,
  onRegisterNewPromotion,
}: {
  listingId: string;
  showToast: (m: string) => void;
  onUpdated?: () => void;
  headerActionsExtra?: ReactNode;
  /** Parent header "New promotion" — same handler as the former section footer button. */
  onRegisterNewPromotion?: (openNewPromotion: (() => void) | null) => void;
}) {
  const { userId, email: managerEmail, ready: authReady } = useManagerUserId();
  // Aborts the copy request owned by whichever compose modal is open.
  const generateAbortRef = useRef<AbortController | null>(null);
  const [tick, setTick] = useState(0);
  const [propertyTick, setPropertyTick] = useState(0);
  const [showNewModal, setShowNewModal] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState<PromotionDraft>(EMPTY_DRAFT);
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generatingTextId, setGeneratingTextId] = useState<string | null>(null);
  const [textModalAssetId, setTextModalAssetId] = useState<string | null>(null);

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

  const assetKindIndices = useMemo(() => promotionAssetKindIndices(assets), [assets]);

  // Open the unified "New promotion" modal (type dropdown + inline form, no
  // separate "Continue" step) seeded to this property.
  const openNewPromotion = useCallback(() => {
    setEditingRowId(null);
    setEditingEntryId(null);
    setDraft(draftWithPropertyKey(EMPTY_DRAFT, propertyId, listings, autofillOpts));
    setShowNewModal(true);
  }, [listings, propertyId, autofillOpts]);

  useEffect(() => {
    onRegisterNewPromotion?.(openNewPromotion);
    return () => onRegisterNewPromotion?.(null);
  }, [onRegisterNewPromotion, openNewPromotion]);

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

  const openEditAsset = useCallback(
    (asset: PromotionAsset) => {
      if (asset.kind === "flyer" && asset.flyerEntry) {
        openEditFlyer(asset.row, asset.flyerEntry.id);
        return;
      }
      if (asset.kind === "text" && asset.textEntry) {
        setTextModalAssetId(asset.id);
      }
    },
    [openEditFlyer],
  );

  // Closes every promotion compose surface — the unified new modal, the
  // edit-flyer modal and the standalone text modal — so no caller can leave one
  // of them open after a write. Dismissing also aborts an in-flight generate, so
  // a cancelled request can never land a row behind the closed modal.
  const closeForm = useCallback(() => {
    generateAbortRef.current?.abort();
    setShowForm(false);
    setShowNewModal(false);
    setTextModalAssetId(null);
    setEditingRowId(null);
    setEditingEntryId(null);
    setDraft(EMPTY_DRAFT);
  }, []);

  async function generate() {
    const label = draft.propertyLabel.trim();
    const entryTitle = draft.title.trim() || nextPromotionAssetDefaultTitle(assets, "flyer");
    if (!label && !draft.headline.trim()) {
      showToast("Add a property/listing or a headline first.");
      return;
    }
    const editingRow = editingRowId ? readManagerPromotionRows().find((p) => p.id === editingRowId) ?? null : null;
    const abort = new AbortController();
    generateAbortRef.current = abort;
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
        signal: abort.signal,
      });
      if (source === "cancelled") return;
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
      if (generateAbortRef.current === abort) generateAbortRef.current = null;
      setGenerating(false);
    }
  }

  async function createOrRegenerateText(
    opts: { format: PromotionTextFormat; tone: string; extraInstructions: string; images: string[] },
    asset: PromotionAsset | null,
  ) {
    const abort = new AbortController();
    generateAbortRef.current = abort;
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
          {
            propertyId: asset.row.propertyId,
            extraInstructions: opts.extraInstructions,
            signal: abort.signal,
          },
        );
        if (source === "cancelled") return;
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
        if (generateAbortRef.current === abort) generateAbortRef.current = null;
        setGeneratingTextId(null);
      }
      return;
    }

    const base = draftWithPropertyKey(EMPTY_DRAFT, propertyId, listings, autofillOpts);
    const { propertyLabel: label } = promotionTextIdentityFromDraft(base);
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
        signal: abort.signal,
      });
      if (source === "cancelled") return;
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
      closeForm();
      setTick((n) => n + 1);
      onUpdated?.();
      showToast(source === "ai" ? "Promotion text created." : "Promotion text created (offline copy).");
    } catch {
      showToast("Could not generate promotion text.");
    } finally {
      if (generateAbortRef.current === abort) generateAbortRef.current = null;
      setGeneratingTextId(null);
    }
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
    } else if (asset.kind === "upload" && asset.uploadEntry) {
      const next = removeUploadEntryFromRow(asset.row, asset.uploadEntry.id);
      if (next) upsertManagerPromotion(next);
      else deleteManagerPromotionRow(asset.row.id);
    }
    setTick((n) => n + 1);
    onUpdated?.();
    showToast("Promotion deleted.");
  }

  if (!propertyId) return null;

  // The standalone text modal is edit-only now — creating lives in PromotionNewModal.
  const textModalAsset = textModalAssetId
    ? assets.find((a) => a.id === textModalAssetId) ?? null
    : null;

  async function uploadPromotion(file: File) {
    if (!userId || !propertyId) return;
    setUploadBusy(true);
    try {
      const parsed = await fileToPromotionUpload(file);
      if (!parsed) {
        showToast("Upload a JPG, PNG, or PDF up to 12 MB.");
        return;
      }
      const now = new Date().toISOString();
      const entry: PromotionUploadEntry = {
        id: makePromotionUploadId(),
        title: nextPromotionAssetDefaultTitle(assets, "upload"),
        kind: parsed.kind,
        fileUrl: parsed.fileUrl,
        fileName: file.name,
        mimeType: parsed.mimeType,
        createdAt: now,
        updatedAt: now,
      };
      const existing = readManagerPromotionRows().find((p) => p.propertyId === propertyId) ?? null;
      const seededDraft = draftWithPropertyKey(EMPTY_DRAFT, propertyId, listings, autofillOpts);
      const row =
        existing ??
        syncPromotionRowLegacy({
          id: makePromotionId(),
          managerUserId: userId,
          propertyId,
          propertyLabel: listings.find((l) => l.id === propertyId)?.label ?? "Property",
          title: "Promotion",
          theme: "cobalt",
          flyerSize: "letter",
          status: "generated",
          inputs: draftInputs(seededDraft),
          copy: null,
          createdAt: now,
          updatedAt: now,
        });
      upsertManagerPromotion(appendUploadEntryToRow(row, entry));
      setTick((n) => n + 1);
      onUpdated?.();
      closeForm();
      showToast("Promotion uploaded.");
    } finally {
      setUploadBusy(false);
    }
  }

  return (
    <>
      <PortalPropertyDetailSection contentClassName="space-y-0">
        {headerActionsExtra ? <div className="mb-3">{headerActionsExtra}</div> : null}
        {assets.map((asset) => {
          const indexWithinKind = assetKindIndices.get(asset.id) ?? 0;
          const title = promotionAssetBoxTitle(asset, indexWithinKind);
          const canEdit = asset.kind === "flyer" || asset.kind === "text";
          return (
            <div key={asset.id} className={PORTAL_PROPERTY_DETAIL_LIST_ROW_CLASS}>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">{title}</p>
                <p className="mt-0.5 text-xs text-muted">
                  {promotionKindLabel(asset.kind)} · {asset.subtitle}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap justify-end gap-2">
                {canEdit ? (
                  <Button
                    type="button"
                    variant="outline"
                    className={PORTAL_PROPERTY_DETAIL_ACTION_BUTTON_CLASS}
                    data-attr="promotion-row-edit"
                    onClick={() => openEditAsset(asset)}
                  >
                    Edit
                  </Button>
                ) : null}
                {assets.length > 1 ? (
                  <Button
                    type="button"
                    variant="outline"
                    className={PORTAL_PROPERTY_DETAIL_ACTION_BUTTON_CLASS}
                    data-attr="promotion-row-remove"
                    onClick={() => deleteAsset(asset)}
                  >
                    Remove
                  </Button>
                ) : null}
              </div>
            </div>
          );
        })}
      </PortalPropertyDetailSection>

      <div className={PORTAL_LIST_ADD_ROW_WRAP_CLASS}>
        <PortalListAddRow
          label="Add promotion"
          icon={PORTAL_LIST_ADD_ICONS.promotion}
          onClick={openNewPromotion}
          dataAttr="manager-property-new-promotion"
        />
      </div>

      <PromotionNewModal
        open={showNewModal}
        onClose={closeForm}
        draft={draft}
        setDraft={setDraft}
        listings={listings}
        onSelectProperty={() => {}}
        hidePropertyPicker
        onGenerateFlyer={() => void generate()}
        flyerBusy={generating}
        onGenerateText={(opts) => void createOrRegenerateText(opts, null)}
        textBusy={generatingTextId !== null}
        onUploadPromotion={(file) => void uploadPromotion(file)}
        uploadBusy={uploadBusy}
      />

      {/* Edit an existing text promotion (create-new lives in PromotionNewModal). */}
      <PromotionTextGenerateModal
        open={textModalAssetId !== null}
        onClose={closeForm}
        initialFormat={textModalAsset?.textEntry?.copy.format}
        initialTone={textModalAsset?.row.inputs.tone}
        initialImages={textModalAsset?.row.inputs.images}
        onGenerate={(opts) => {
          void createOrRegenerateText(opts, textModalAsset);
        }}
      />

      {/* Edit an existing flyer (create-new lives in PromotionNewModal above). */}
      <Modal
        open={showForm}
        title="Edit flyer"
        onClose={closeForm}
        panelClassName="max-w-2xl"
        footer={
          <ModalFooter>
            <Button type="button" variant="primary" onClick={() => void generate()} disabled={generating} data-attr="promotion-generate">
              {generating ? "Updating…" : "Update flyer"}
            </Button>
          </ModalFooter>
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
