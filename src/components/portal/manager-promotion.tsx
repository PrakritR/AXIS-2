"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ManagerPortalPageShell,
  ManagerPortalFilterRow,
  ManagerPortalStatusPills,
  PORTAL_HEADER_ACTION_BTN,
} from "@/components/portal/portal-metrics";
import { PortalCollapsibleSection } from "@/components/portal/portal-collapsible-section";
import { PortalPropertyFilterPill } from "@/components/portal/manager-section-shell";
import {
  buildManagerPropertyFilterOptions,
  samePropertyId,
} from "@/lib/manager-portfolio-access";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { useManagerUserId } from "@/hooks/use-manager-user-id";
import { track } from "@/lib/analytics/track-client";
import {
  DEMO_PROMOTION_AUTOFILL_EVENT,
  DEMO_PROMOTION_GENERATED_EVENT,
} from "@/lib/demo/demo-playback";
import { isDemoModeActive } from "@/lib/demo/demo-session";
import { PromotionAssetStack } from "@/components/portal/promotion-asset-list";
import {
  PromotionFlyerAssetDetail,
  PromotionFlyerHeaderActions,
  PromotionTextAssetDetail,
  PromotionTextHeaderActions,
} from "@/components/portal/promotion-asset-detail";
import { PromotionNewModal } from "@/components/portal/promotion-new-modal";
import { PromotionTextGenerateModal } from "@/components/portal/promotion-text-generate-modal";
import {
  CUSTOM_PROPERTY_KEY,
  EMPTY_DRAFT,
  PromotionForm,
  draftInputs,
  draftWithPropertyKey,
  type PromotionDraft,
} from "@/components/portal/promotion-form";
import {
  flattenPromotionAssets,
  makePromotionAssetId,
  nextPromotionAssetDefaultTitle,
  sortPromotionAssets,
  type PromotionAsset,
  type PromotionAssetKind,
} from "@/lib/promotion-assets";
import {
  buildManagerPromotionPropertyOptions,
  type ManagerPromotionPropertyOption,
} from "@/lib/manager-property-links";
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
import { readPromotionTextEntries, type PromotionTextEntry, type PromotionTextFormat } from "@/lib/promotion-text";
import {
  PROPERTY_PIPELINE_EVENT,
  syncPropertyPipelineFromServer,
} from "@/lib/demo-property-pipeline";

/** Content-type filter pills at the top of the Promotion page. `image` maps to
 *  flyer assets (`kind: "flyer"`), `text` to text assets. The pills are mutually
 *  exclusive (no "All") — like the Applications/Services status pills, which
 *  default to their first bucket rather than an aggregate. */
export type PromotionContentFilter = "text" | "image";

function flyerEntryToDraft(
  row: ManagerPromotionRow,
  entry: FlyerEntry,
  listings: ManagerPromotionPropertyOption[],
): PromotionDraft {
  return {
    propertyKey:
      row.propertyId && listings.some((l) => l.id === row.propertyId)
        ? row.propertyId
        : CUSTOM_PROPERTY_KEY,
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


export function ManagerPromotion() {
  const { showToast } = useAppUi();
  const { userId, email: managerEmail, ready: authReady } = useManagerUserId();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const handledFlyerDeepLink = useRef(false);
  const [tick, setTick] = useState(0);
  const [propertyTick, setPropertyTick] = useState(0);
  // Unified "New promotion" modal (type dropdown + inline flyer/text form).
  const [showNewModal, setShowNewModal] = useState(false);
  // Edit-flyer modal (create-new now lives in the unified modal above).
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState<PromotionDraft>(EMPTY_DRAFT);
  const [generating, setGenerating] = useState(false);
  const [generatingTextId, setGeneratingTextId] = useState<string | null>(null);
  const [textModalAssetId, setTextModalAssetId] = useState<string | null>(null);
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sectionExpanded, setSectionExpanded] = useState(true);
  const [demoPromotionGeneratePending, setDemoPromotionGeneratePending] = useState(false);
  const [contentFilter, setContentFilter] = useState<PromotionContentFilter>("text");
  const [propertyFilter, setPropertyFilter] = useState("");

  useEffect(() => {
    if (!authReady) return;
    void syncManagerPromotionsFromServer({ force: true });
    void syncPropertyPipelineFromServer({ force: true });
  }, [authReady, userId]);

  useEffect(() => {
    const onPromos = () => setTick((n) => n + 1);
    const onProps = () => setPropertyTick((n) => n + 1);
    window.addEventListener(MANAGER_PROMOTIONS_EVENT, onPromos);
    window.addEventListener(PROPERTY_PIPELINE_EVENT, onProps);
    return () => {
      window.removeEventListener(MANAGER_PROMOTIONS_EVENT, onPromos);
      window.removeEventListener(PROPERTY_PIPELINE_EVENT, onProps);
    };
  }, []);

  const promotions = useMemo(() => {
    void tick;
    return readManagerPromotionRows();
  }, [tick]);

  const assets = useMemo(
    () => sortPromotionAssets(flattenPromotionAssets(promotions), "newest"),
    [promotions],
  );

  // Property filter drives both the visible list and the content-type counts,
  // mirroring the Services page (counts reflect the current property scope).
  const propertyScopedAssets = useMemo(() => {
    if (!propertyFilter) return assets;
    return assets.filter((a) => samePropertyId(a.row.propertyId, propertyFilter));
  }, [assets, propertyFilter]);

  const contentCounts = useMemo(() => {
    let text = 0;
    let image = 0;
    for (const a of propertyScopedAssets) {
      if (a.kind === "text") text += 1;
      else image += 1;
    }
    return { text, image };
  }, [propertyScopedAssets]);

  const contentTabs = useMemo(
    () => [
      { id: "text", label: "Text", count: contentCounts.text, dataAttr: "promotion-filter-text" },
      { id: "image", label: "Image", count: contentCounts.image, dataAttr: "promotion-filter-image" },
    ],
    [contentCounts],
  );

  const filteredAssets = useMemo(() => {
    const wantedKind: PromotionAssetKind = contentFilter === "image" ? "flyer" : "text";
    return propertyScopedAssets.filter((a) => a.kind === wantedKind);
  }, [propertyScopedAssets, contentFilter]);

  const listings = useMemo<ManagerPromotionPropertyOption[]>(() => {
    void propertyTick;
    return buildManagerPromotionPropertyOptions(userId);
  }, [userId, propertyTick]);

  // "All your properties" filter options: portfolio properties merged with any
  // property a promotion is already attached to (same pattern as Services).
  const filterPropertyOptions = useMemo(() => {
    void propertyTick;
    const opts = buildManagerPropertyFilterOptions(userId ?? null);
    for (const row of promotions) {
      const pid = row.propertyId?.trim();
      if (!pid || opts.some((p) => samePropertyId(p.id, pid))) continue;
      opts.push({ id: pid, label: row.propertyLabel || pid });
    }
    return opts.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
  }, [userId, propertyTick, promotions]);

  const autofillOpts = useMemo(
    () => ({
      managerContact: managerEmail ?? "",
      appOrigin: typeof window !== "undefined" ? window.location.origin : "",
    }),
    [managerEmail],
  );

  // Seed the flyer draft (optionally from a property) and open the unified
  // "New promotion" modal. It opens on the flyer form; the in-modal type
  // dropdown swaps to the text composer without a separate "Continue" step.
  const openNewPromotion = useCallback(
    (propertyId?: string) => {
      setEditingRowId(null);
      setEditingEntryId(null);
      if (propertyId && listings.some((l) => l.id === propertyId)) {
        setDraft(draftWithPropertyKey(EMPTY_DRAFT, propertyId, listings, autofillOpts));
      } else {
        setDraft(EMPTY_DRAFT);
      }
      setShowNewModal(true);
    },
    [listings, autofillOpts],
  );

  useEffect(() => {
    if (!isDemoModeActive()) return;
    const onAutofill = (e: Event) => {
      const detail = (e as CustomEvent<{ propertyId?: string; generateAfter?: boolean }>).detail;
      const pid = detail?.propertyId?.trim() || listings[0]?.id;
      if (!pid) return;
      setDraft(draftWithPropertyKey(EMPTY_DRAFT, pid, listings, autofillOpts));
      setEditingRowId(null);
      setEditingEntryId(null);
      setShowNewModal(true);
      if (detail?.generateAfter) setDemoPromotionGeneratePending(true);
    };
    window.addEventListener(DEMO_PROMOTION_AUTOFILL_EVENT, onAutofill as EventListener);
    return () => window.removeEventListener(DEMO_PROMOTION_AUTOFILL_EVENT, onAutofill as EventListener);
  }, [listings, autofillOpts]);

  useEffect(() => {
    if (handledFlyerDeepLink.current || searchParams.get("new") !== "1") return;
    if (!authReady) return;
    const propertyId = searchParams.get("propertyId")?.trim() || "";
    if (propertyId && listings.length === 0 && userId) return;

    handledFlyerDeepLink.current = true;
    openNewPromotion(propertyId || undefined);

    const next = new URLSearchParams(searchParams.toString());
    next.delete("new");
    next.delete("propertyId");
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [authReady, listings, userId, searchParams, pathname, router, openNewPromotion]);

  // Closes every promotion compose surface — the unified new modal, the
  // edit-flyer modal and the standalone text modal — so no caller can leave one
  // of them open after a write.
  const closeForm = useCallback(() => {
    setShowForm(false);
    setShowNewModal(false);
    setTextModalAssetId(null);
    setEditingRowId(null);
    setEditingEntryId(null);
    setDraft(EMPTY_DRAFT);
  }, []);

  // Both filters are mutually exclusive selections, so a saved asset can sit
  // outside either of them. Move both to whatever renders the saved row before
  // expanding it — otherwise the success toast points at nothing.
  const revealAsset = useCallback(
    (assetId: string, kind: PromotionContentFilter, rowPropertyId: string | null | undefined) => {
      setContentFilter(kind);
      setPropertyFilter((cur) =>
        !cur || samePropertyId(rowPropertyId, cur) ? cur : rowPropertyId?.trim() || "",
      );
      setExpandedId(assetId);
    },
    [],
  );

  const openEditFlyer = useCallback(
    (row: ManagerPromotionRow, entryId: string) => {
      const entry = readFlyerEntries(row).find((e) => e.id === entryId) ?? null;
      if (!entry) return;
      setDraft(flyerEntryToDraft(row, entry, listings));
      setEditingRowId(row.id);
      setEditingEntryId(entryId);
      setShowForm(true);
    },
    [listings],
  );

  function onSelectProperty(key: string) {
    setDraft((d) => draftWithPropertyKey(d, key, listings, autofillOpts));
  }

  async function generate() {
    const label = draft.propertyLabel.trim();
    const entryTitle =
      draft.title.trim() || nextPromotionAssetDefaultTitle(assets, "flyer");
    if (!label && !draft.headline.trim()) {
      showToast("Add a property/listing or a headline first.");
      return;
    }
    const propertyId = draft.propertyKey === CUSTOM_PROPERTY_KEY ? null : draft.propertyKey;
    const editingRow = editingRowId ? promotions.find((p) => p.id === editingRowId) ?? null : null;
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
      const assetId = makePromotionAssetId(savedRow.id, "flyer", entryId);
      revealAsset(assetId, "image", savedRow.propertyId);
      if (isDemoModeActive()) {
        window.dispatchEvent(new CustomEvent(DEMO_PROMOTION_GENERATED_EVENT, { detail: { assetId } }));
      }
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

  async function regenerateText(
    row: ManagerPromotionRow,
    entryId: string,
    opts: { format: PromotionTextFormat; tone: string; extraInstructions: string; images: string[] },
  ) {
    const entry = readPromotionTextEntries(row).find((e) => e.id === entryId);
    if (!entry) return;
    setGeneratingTextId(entryId);
    try {
      const inputs = {
        ...row.inputs,
        tone: opts.tone.trim() || row.inputs.tone,
        images: opts.images.slice(0, FLYER_IMAGE_LIMIT),
      };
      const { copy, source } = await generatePromotionTextCopy(inputs, row.propertyLabel, opts.format, {
        propertyId: row.propertyId,
        extraInstructions: opts.extraInstructions,
      });
      if (source === "forbidden") {
        showToast("You can only create promotions for your own properties.");
        return;
      }
      upsertManagerPromotion(
        updateTextEntryOnRow({ ...row, inputs }, entryId, {
          copy,
          updatedAt: new Date().toISOString(),
        }),
      );
      setTextModalAssetId(null);
      showToast(source === "ai" ? "Promotion text generated." : "Promotion text generated (offline copy).");
    } catch {
      showToast("Could not generate promotion text.");
    } finally {
      setGeneratingTextId(null);
    }
  }

  async function createTextFromModal(opts: {
    format: PromotionTextFormat;
    tone: string;
    extraInstructions: string;
    images: string[];
  }) {
    // The unified new-promotion modal shares one `draft` for property context;
    // the text composer contributes format/tone/notes/images via `opts`.
    const base = draft;
    const label = base.propertyLabel.trim() || base.headline.trim() || "Untitled promotion";
    const propertyId = base.propertyKey === CUSTOM_PROPERTY_KEY ? null : base.propertyKey;
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
      closeForm();
      revealAsset(makePromotionAssetId(row.id, "text", entry.id), "text", row.propertyId);
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
  }

  function saveTextEntry(row: ManagerPromotionRow, entry: PromotionTextEntry) {
    upsertManagerPromotion(updateTextEntryOnRow(row, entry.id, entry));
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
    if (editingRowId === asset.row.id) closeForm();
    showToast("Promotion deleted.");
  }

  useEffect(() => {
    if (!demoPromotionGeneratePending || !isDemoModeActive()) return;
    setDemoPromotionGeneratePending(false);
    void generate();
  }, [demoPromotionGeneratePending, draft]);

  // The standalone text modal is edit-only now — creating lives in PromotionNewModal.
  const textModalAsset = textModalAssetId
    ? assets.find((a) => a.id === textModalAssetId) ?? null
    : null;

  const renderHeaderActions = (asset: PromotionAsset, _indexWithinKind: number) => {
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
        onEdit={(row, entryId) => setTextModalAssetId(makePromotionAssetId(row.id, "text", entryId))}
        onDelete={(row, entryId) => {
          const textAsset = assets.find(
            (a) => a.row.id === row.id && a.textEntry?.id === entryId,
          );
          if (textAsset) deleteAsset(textAsset);
        }}
        editing={generatingTextId === asset.textEntry?.id}
        showToast={showToast}
      />
    );
  };

  const renderExpanded = (asset: PromotionAsset, _indexWithinKind: number) => {
    if (asset.kind === "flyer") {
      return <PromotionFlyerAssetDetail asset={asset} />;
    }

    return (
      <PromotionTextAssetDetail
        asset={asset}
        onSave={(row, entry) => saveTextEntry(row, entry)}
        showToast={showToast}
      />
    );
  };

  return (
    <ManagerPortalPageShell
      title="Promotion"
      titleAside={
        <Button
          type="button"
          variant="primary"
          className={`shrink-0 ${PORTAL_HEADER_ACTION_BTN}`}
          onClick={() => openNewPromotion()}
          data-attr="promotion-new"
        >
          New promotion
        </Button>
      }
      filterRow={
        <ManagerPortalFilterRow>
          <ManagerPortalStatusPills
            tabs={contentTabs}
            activeId={contentFilter}
            onChange={(id) => setContentFilter(id as PromotionContentFilter)}
          />
          <PortalPropertyFilterPill
            propertyOptions={filterPropertyOptions}
            propertyValue={propertyFilter}
            onPropertyChange={setPropertyFilter}
          />
        </ManagerPortalFilterRow>
      }
    >
      <PortalCollapsibleSection
        title="Your promotions"
        expanded={sectionExpanded}
        onExpandedChange={setSectionExpanded}
        collapsible={assets.length > 0}
        toggleDataAttr="promotion-section-toggle"
        contentClassName="px-4 py-3"
      >
        <PromotionAssetStack
          assets={filteredAssets}
          emptyMessage={
            assets.length === 0
              ? "No promotions yet."
              : "No promotions match these filters."
          }
          expandedId={expandedId}
          onToggleExpand={(id) => setExpandedId((cur) => (cur === id ? null : id))}
          onSaveTitle={saveAssetTitle}
          renderHeaderActions={renderHeaderActions}
          renderExpanded={renderExpanded}
        />
      </PortalCollapsibleSection>

      <PromotionNewModal
        open={showNewModal}
        onClose={closeForm}
        draft={draft}
        setDraft={setDraft}
        listings={listings}
        onSelectProperty={onSelectProperty}
        onGenerateFlyer={() => void generate()}
        flyerBusy={generating}
        onGenerateText={(opts) => void createTextFromModal(opts)}
        textBusy={generatingTextId !== null}
      />

      {/* Edit an existing flyer (create-new lives in PromotionNewModal above). */}
      <Modal
        open={showForm}
        title="Edit flyer"
        onClose={closeForm}
        panelClassName="max-w-2xl"
        footer={
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => void generate()} disabled={generating} data-attr="promotion-generate">
              {generating ? "Updating…" : "Update flyer"}
            </Button>
            <Button type="button" variant="outline" onClick={closeForm} disabled={generating}>
              Cancel
            </Button>
          </div>
        }
      >
        {/* Modal's footer variant fixes the shell and expects the CHILD to scroll,
            so without this wrapper the tail of the form (Flyer name, Headline
            idea, …) was simply clipped and unreachable. */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
          <PromotionForm
            draft={draft}
            setDraft={setDraft}
            listings={listings}
            onSelectProperty={onSelectProperty}
          />
        </div>
      </Modal>

      <PromotionTextGenerateModal
        open={textModalAssetId !== null}
        onClose={() => setTextModalAssetId(null)}
        busy={generatingTextId !== null}
        initialFormat={textModalAsset?.textEntry?.copy.format}
        initialTone={textModalAsset?.row.inputs.tone}
        initialImages={textModalAsset?.row.inputs.images}
        onGenerate={(opts) => {
          if (!textModalAsset?.textEntry) return;
          void regenerateText(textModalAsset.row, textModalAsset.textEntry.id, opts);
        }}
      />
    </ManagerPortalPageShell>
  );
}

