"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { PortalCollapsibleSection } from "@/components/portal/portal-collapsible-section";
import { PORTAL_TOOLBAR_SELECT, PortalToolbarSelectWrap } from "@/components/portal/portal-metrics";
import {
  EMPTY_DRAFT,
  PromotionForm,
  draftInputs,
  draftWithPropertyKey,
  type PromotionDraft,
} from "@/components/portal/manager-promotion";
import { PromotionFlyerPreview, downloadPromotionFlyer } from "@/components/portal/promotion-flyer-preview";
import { PromotionTextGenerateModal } from "@/components/portal/promotion-text-generate-modal";
import { PromotionTextEntriesList } from "@/components/portal/promotion-text-preview";
import { PromotionEntryEditableTitle } from "@/components/portal/promotion-entry-title";
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
} from "@/lib/manager-promotions-storage";
import {
  createFlyerEntry,
  defaultFlyerEntryTitle,
  flyerEntryDisplayTitle,
  flyerRowForEntry,
  normalizePromotionTemplate,
  primaryFlyerEntry,
  readFlyerEntries,
  PROMOTION_TONE_OPTIONS,
  type FlyerEntry,
  type ManagerPromotionRow,
} from "@/lib/promotion-flyer";
import {
  createPromotionTextEntry,
  defaultPromotionTextEntryTitle,
  primaryPromotionTextCopy,
  readPromotionTextEntries,
  type PromotionTextEntry,
  type PromotionTextFormat,
} from "@/lib/promotion-text";

type PromotionView = "flyer" | "text";

function entryToDraft(row: ManagerPromotionRow, entry: FlyerEntry): PromotionDraft {
  return {
    propertyKey: row.propertyId ?? "",
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
    theme: entry.theme,
    flyerSize: entry.flyerSize,
    template: normalizePromotionTemplate(entry.template),
    tone: entry.inputs.tone || PROMOTION_TONE_OPTIONS[0]!,
    images: entry.inputs.images ?? [],
  };
}

/** Sync a promotion row's legacy top-level flyer fields from its primary variant. */
function withFlyerEntries(row: ManagerPromotionRow, entries: FlyerEntry[]): ManagerPromotionRow {
  const primary = primaryFlyerEntry(entries);
  return {
    ...row,
    theme: primary?.theme ?? row.theme,
    flyerSize: primary?.flyerSize ?? row.flyerSize,
    template: primary?.template ?? row.template,
    inputs: primary?.inputs ?? row.inputs,
    copy: primary?.copy ?? row.copy,
    flyerCopies: entries,
    status: "generated",
    updatedAt: new Date().toISOString(),
  };
}

function withTextEntries(row: ManagerPromotionRow, entries: PromotionTextEntry[]): ManagerPromotionRow {
  return {
    ...row,
    textCopies: entries,
    textCopy: primaryPromotionTextCopy(entries),
    updatedAt: new Date().toISOString(),
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
  const [editingFlyerId, setEditingFlyerId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [regeneratingFlyerId, setRegeneratingFlyerId] = useState<string | null>(null);
  const [generatingText, setGeneratingText] = useState(false);
  const [generatingTextEntryId, setGeneratingTextEntryId] = useState<string | null>(null);
  const [showTextModal, setShowTextModal] = useState(false);
  const [textModalEntryId, setTextModalEntryId] = useState<string | null>(null);
  const [previewEpoch, setPreviewEpoch] = useState(0);
  const [promotionExpanded, setPromotionExpanded] = useState(true);
  const [view, setView] = useState<PromotionView>("flyer");

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

  const textEntries = useMemo(
    () => (promotion ? readPromotionTextEntries(promotion) : []),
    [promotion],
  );

  const flyerEntries = useMemo(
    () => (promotion ? readFlyerEntries(promotion) : []),
    [promotion],
  );

  useEffect(() => {
    setPromotionExpanded(true);
  }, [promotion?.id, promotion?.updatedAt]);

  // Add another flyer variant — prefill from the primary flyer's facts when a
  // promotion already exists so the manager just tweaks the design/copy.
  const openNewFlyer = useCallback(() => {
    const primary = primaryFlyerEntry(flyerEntries);
    if (promotion && primary) {
      setDraft(entryToDraft(promotion, primary));
      setEditingId(promotion.id);
    } else {
      setDraft(draftWithPropertyKey(EMPTY_DRAFT, listingId, listings));
      setEditingId(promotion?.id ?? null);
    }
    setEditingFlyerId(null);
    setShowForm(true);
  }, [listingId, listings, promotion, flyerEntries]);

  const openEditFlyer = useCallback(
    (entry: FlyerEntry) => {
      if (!promotion) return;
      setDraft(entryToDraft(promotion, entry));
      setEditingId(promotion.id);
      setEditingFlyerId(entry.id);
      setShowForm(true);
    },
    [promotion],
  );

  const closeForm = useCallback(() => {
    setShowForm(false);
    setEditingId(null);
    setEditingFlyerId(null);
    setDraft(EMPTY_DRAFT);
    setPreviewEpoch((n) => n + 1);
  }, []);

  function persistPromotion(row: ManagerPromotionRow) {
    upsertManagerPromotion(row);
    setTick((n) => n + 1);
    onUpdated?.();
  }

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
    if (editing && editingFlyerId) {
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
      if (!editing) {
        const entry = createFlyerEntry(
          {
            title: defaultFlyerEntryTitle(1),
            copy,
            template: draft.template,
            theme: draft.theme,
            flyerSize: draft.flyerSize,
            inputs,
          },
          now,
        );
        persistPromotion({
          id: makePromotionId(),
          managerUserId: userId ?? null,
          propertyId,
          propertyLabel: label,
          title,
          theme: draft.theme,
          flyerSize: draft.flyerSize,
          template: draft.template,
          status: "generated",
          inputs,
          copy,
          flyerCopies: [entry],
          textCopy: null,
          createdAt: now,
          updatedAt: now,
        });
      } else {
        const entries = readFlyerEntries(editing);
        const nextEntries = editingFlyerId
          ? entries.map((entry) =>
              entry.id === editingFlyerId
                ? {
                    ...entry,
                    title:
                      draft.title.trim() ||
                      entry.title ||
                      defaultFlyerEntryTitle(entries.findIndex((e) => e.id === editingFlyerId) + 1),
                    copy,
                    template: draft.template,
                    theme: draft.theme,
                    flyerSize: draft.flyerSize,
                    inputs,
                    updatedAt: now,
                  }
                : entry,
            )
          : [
              createFlyerEntry(
                {
                  title: defaultFlyerEntryTitle(entries.length + 1),
                  copy,
                  template: draft.template,
                  theme: draft.theme,
                  flyerSize: draft.flyerSize,
                  inputs,
                },
                now,
              ),
              ...entries,
            ];
        persistPromotion(withFlyerEntries(editing, nextEntries));
      }
      closeForm();
      setView("flyer");
      showToast(
        editing && editingFlyerId
          ? "Flyer updated."
          : source === "ai"
            ? "Flyer generated."
            : "Flyer generated (offline copy).",
      );
    } catch {
      showToast(
        editing && editingFlyerId ? "Could not update the flyer. Try again." : "Could not generate the flyer. Try again.",
      );
    } finally {
      setGenerating(false);
    }
  }

  async function regenerateFlyer(entryId: string) {
    if (!promotion) return;
    const entries = readFlyerEntries(promotion);
    const target = entries.find((entry) => entry.id === entryId);
    if (!target) return;
    setRegeneratingFlyerId(entryId);
    track("promotion_regenerated", {
      theme: target.theme,
      template: normalizePromotionTemplate(target.template),
    });
    try {
      const { copy, source } = await generateFlyerCopy(target.inputs, promotion.propertyLabel, promotion.propertyId);
      if (source === "forbidden") {
        showToast("You can only create flyers for your own properties.");
        return;
      }
      const now = new Date().toISOString();
      const nextEntries = entries.map((entry) =>
        entry.id === entryId ? { ...entry, copy, updatedAt: now } : entry,
      );
      persistPromotion(withFlyerEntries(promotion, nextEntries));
      showToast("Flyer regenerated.");
    } catch {
      showToast("Could not regenerate the flyer.");
    } finally {
      setRegeneratingFlyerId(null);
    }
  }

  function deleteFlyerEntry(entryId: string) {
    if (!promotion) return;
    const remaining = readFlyerEntries(promotion).filter((entry) => entry.id !== entryId);
    if (remaining.length === 0) return;
    persistPromotion(withFlyerEntries(promotion, remaining));
    showToast("Flyer removed.");
  }

  function openTextModal(entryId?: string | null) {
    setTextModalEntryId(entryId ?? null);
    setShowTextModal(true);
  }

  function saveFlyerTitle(entryId: string, title: string) {
    if (!promotion) return;
    const entries = readFlyerEntries(promotion).map((entry) =>
      entry.id === entryId ? { ...entry, title, updatedAt: new Date().toISOString() } : entry,
    );
    persistPromotion(withFlyerEntries(promotion, entries));
  }

  function ensurePromotionRow(): ManagerPromotionRow | null {
    if (promotion) return promotion;
    const draft = draftWithPropertyKey(EMPTY_DRAFT, listingId, listings);
    const label = draft.propertyLabel.trim();
    if (!label) return null;
    const now = new Date().toISOString();
    return {
      id: makePromotionId(),
      managerUserId: userId ?? null,
      propertyId: listingId.trim() || null,
      propertyLabel: label,
      title: label,
      theme: draft.theme,
      flyerSize: draft.flyerSize,
      template: draft.template,
      status: "draft",
      inputs: draftInputs(draft),
      copy: null,
      textCopy: null,
      textCopies: [],
      createdAt: now,
      updatedAt: now,
    };
  }

  async function generateText(opts: {
    format: PromotionTextFormat;
    tone: string;
    extraInstructions: string;
  }) {
    const baseRow = ensurePromotionRow();
    if (!baseRow) {
      showToast("Could not load property details for this listing.");
      return;
    }
    const targetEntryId = textModalEntryId;
    setGeneratingText(true);
    if (targetEntryId) setGeneratingTextEntryId(targetEntryId);
    try {
      const inputs = { ...baseRow.inputs, tone: opts.tone.trim() || baseRow.inputs.tone };
      const { copy, source } = await generatePromotionTextCopy(inputs, baseRow.propertyLabel, opts.format, {
        propertyId: baseRow.propertyId,
        extraInstructions: opts.extraInstructions,
        managerUserId: userId,
      });
      if (source === "forbidden") {
        showToast("You can only create promotions for your own properties.");
        return;
      }
      const existing = readPromotionTextEntries(baseRow);
      const newEntry = createPromotionTextEntry(copy, defaultPromotionTextEntryTitle(existing.length + 1));
      let nextEntries: PromotionTextEntry[];
      if (targetEntryId) {
        nextEntries = existing.map((entry) =>
          entry.id === targetEntryId
            ? { ...newEntry, id: entry.id, title: entry.title ?? newEntry.title, createdAt: entry.createdAt }
            : entry,
        );
      } else {
        nextEntries = [newEntry, ...existing];
      }
      persistPromotion(withTextEntries({ ...baseRow, inputs }, nextEntries));
      setShowTextModal(false);
      setTextModalEntryId(null);
      setView("text");
      showToast(source === "ai" ? "Promotion text generated." : "Promotion text generated (offline copy).");
    } catch {
      showToast("Could not generate promotion text.");
    } finally {
      setGeneratingText(false);
      setGeneratingTextEntryId(null);
    }
  }

  function saveTextEntry(entry: PromotionTextEntry) {
    if (!promotion) return;
    const nextEntries = readPromotionTextEntries(promotion).map((row) => (row.id === entry.id ? entry : row));
    persistPromotion(withTextEntries(promotion, nextEntries));
  }

  function deleteTextEntry(id: string) {
    if (!promotion) return;
    const nextEntries = readPromotionTextEntries(promotion).filter((entry) => entry.id !== id);
    persistPromotion(withTextEntries(promotion, nextEntries));
    showToast("Promotion text removed.");
  }

  if (!listingId.trim()) return null;

  const hasFlyer = flyerEntries.length > 0;
  const textModalEntry = textModalEntryId
    ? textEntries.find((entry) => entry.id === textModalEntryId) ?? null
    : null;

  const flyerActions = (
    <Button
      type="button"
      variant="outline"
      className="h-8 rounded-full px-3 text-xs"
      data-attr="manager-property-create-flyer"
      onClick={openNewFlyer}
    >
      Generate
    </Button>
  );

  const textActions = (
    <Button
      type="button"
      variant="outline"
      className="h-8 rounded-full px-3 text-xs"
      data-attr="promotion-text-generate-open"
      onClick={() => openTextModal(null)}
    >
      Generate
    </Button>
  );

  return (
    <>
      <PortalCollapsibleSection
        title="Promotion"
        expanded={promotionExpanded}
        onExpandedChange={setPromotionExpanded}
        collapsible
        surfaceMuted={false}
        toggleDataAttr="promotion-section-toggle"
        contentClassName="space-y-3 px-4 py-3"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <PortalToolbarSelectWrap>
            <select
              className={`${PORTAL_TOOLBAR_SELECT} h-9 min-w-[7.5rem] text-xs font-semibold`}
              value={view}
              onChange={(e) => setView(e.target.value as PromotionView)}
              data-attr="promotion-view-select"
              aria-label="Promotion view"
            >
              <option value="flyer">Flyer</option>
              <option value="text">Text</option>
            </select>
          </PortalToolbarSelectWrap>
          <div className="flex flex-wrap items-center gap-1.5">{view === "flyer" ? flyerActions : textActions}</div>
        </div>

        {view === "flyer" ? (
          hasFlyer && promotion ? (
            <div className="space-y-3">
              {flyerEntries.map((entry, index) => (
                <PortalCollapsibleSection
                  key={entry.id}
                  title={
                    <PromotionEntryEditableTitle
                      value={entry.title}
                      fallback={flyerEntryDisplayTitle(entry, index)}
                      onSave={(title) => saveFlyerTitle(entry.id, title)}
                    />
                  }
                  titleVariant="label"
                  defaultExpanded={index === 0}
                  surfaceMuted={false}
                  contentClassName="p-0 pt-0"
                  toggleDataAttr="promotion-flyer-entry-toggle"
                  headerActions={
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-8 rounded-full px-3 text-xs"
                        data-attr="promotion-flyer-download"
                        onClick={() => downloadPromotionFlyer(flyerRowForEntry(promotion, entry))}
                      >
                        Download
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-8 rounded-full px-3 text-xs"
                        data-attr="promotion-edit"
                        onClick={() => openEditFlyer(entry)}
                      >
                        Edit
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-8 rounded-full px-3 text-xs"
                        data-attr="promotion-regenerate"
                        onClick={() => void regenerateFlyer(entry.id)}
                        disabled={regeneratingFlyerId === entry.id}
                      >
                        {regeneratingFlyerId === entry.id ? "Regenerating…" : "Regenerate"}
                      </Button>
                      {flyerEntries.length > 1 ? (
                        <button
                          type="button"
                          aria-label="Delete flyer"
                          className="flex h-8 w-8 items-center justify-center rounded-full text-muted transition hover:bg-accent hover:text-foreground"
                          data-attr="promotion-flyer-delete"
                          onClick={() => deleteFlyerEntry(entry.id)}
                        >
                          ×
                        </button>
                      ) : null}
                    </>
                  }
                >
                  <div className="min-w-0 max-w-full overflow-x-auto p-3 sm:p-4">
                    <PromotionFlyerPreview
                      key={`${entry.id}-${entry.updatedAt}-${previewEpoch}`}
                      promotion={flyerRowForEntry(promotion, entry)}
                      embedded
                    />
                  </div>
                </PortalCollapsibleSection>
              ))}
            </div>
          ) : null
        ) : (
          <PromotionTextEntriesList
            entries={textEntries}
            onSave={saveTextEntry}
            onDelete={deleteTextEntry}
            onRegenerate={(id) => openTextModal(id)}
            regeneratingId={generatingTextEntryId}
            showToast={showToast}
          />
        )}
      </PortalCollapsibleSection>

      <PromotionTextGenerateModal
        open={showTextModal}
        onClose={() => {
          setShowTextModal(false);
          setTextModalEntryId(null);
        }}
        busy={generatingText}
        initialFormat={textModalEntry?.copy.format}
        initialTone={promotion?.inputs.tone ?? ensurePromotionRow()?.inputs.tone}
        onGenerate={(opts) => void generateText(opts)}
      />

      <Modal
        open={showForm}
        title={editingFlyerId ? "Edit flyer" : hasFlyer ? "New flyer" : "Create flyer"}
        onClose={closeForm}
        panelClassName="max-w-2xl"
      >
        {promotion?.copy && editingFlyerId ? (
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
            {generating ? "Generating…" : editingFlyerId ? "Update flyer" : "Generate flyer"}
          </Button>
          <Button type="button" variant="outline" onClick={closeForm}>
            Cancel
          </Button>
        </div>
      </Modal>
    </>
  );
}
