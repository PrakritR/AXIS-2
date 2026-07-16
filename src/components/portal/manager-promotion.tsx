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
import { Input, Select, Textarea } from "@/components/ui/input";
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
import { PromotionNewChooserModal } from "@/components/portal/promotion-new-chooser-modal";
import { PromotionTextGenerateModal } from "@/components/portal/promotion-text-generate-modal";
import { PromotionAiDraftCard } from "@/components/portal/promotion-ai-draft-card";
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
  applyFlyerCopyToDraftFields,
  normalizePromotionTemplate,
  PROMOTION_TEMPLATE_DEFAULT,
  PROMOTION_TEMPLATE_OPTIONS,
  PROMOTION_THEME_OPTIONS,
  PROMOTION_TONE_OPTIONS,
  PROMOTION_SIZE_OPTIONS,
  readFlyerEntries,
  type FlyerEntry,
  type FlyerSize,
  type ManagerPromotionRow,
  type PromotionInputs,
  type PromotionTemplate,
  type PromotionTheme,
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
import { enrichPromotionDraftFromListing } from "@/lib/promotion-listing-context";
import {
  PROPERTY_PIPELINE_EVENT,
  syncPropertyPipelineFromServer,
} from "@/lib/demo-property-pipeline";

export type PromotionDraft = {
  propertyKey: string;
  propertyLabel: string;
  address: string;
  title: string;
  headline: string;
  sellingPoints: string;
  customDetails: string;
  price: string;
  promo: string;
  cta: string;
  contact: string;
  schedulingUrl: string;
  includeSchedulingLink: boolean;
  theme: PromotionTheme;
  flyerSize: FlyerSize;
  template: PromotionTemplate;
  tone: string;
  /** Free-form notes for AI draft / generate — not persisted on the saved flyer row. */
  aiPrompt: string;
  /** Uploaded property photos as downscaled data URLs. */
  images: string[];
};

export const CUSTOM_PROPERTY_KEY = "__custom__";

/** Content-type sort/group pills at the top of the Promotion page. `image`
 *  maps to flyer assets (`kind: "flyer"`), `text` to text assets. */
export type PromotionContentFilter = "all" | "text" | "image";

export const EMPTY_DRAFT: PromotionDraft = {
  propertyKey: CUSTOM_PROPERTY_KEY,
  propertyLabel: "",
  address: "",
  title: "",
  headline: "",
  sellingPoints: "",
  customDetails: "",
  price: "",
  promo: "",
  cta: "",
  contact: "",
  schedulingUrl: "",
  includeSchedulingLink: true,
  theme: "cobalt",
  flyerSize: "letter",
  template: PROMOTION_TEMPLATE_DEFAULT,
  tone: PROMOTION_TONE_OPTIONS[0]!,
  aiPrompt: "",
  images: [],
};

export function draftInputs(draft: PromotionDraft): PromotionInputs {
  return {
    headline: draft.headline.trim(),
    sellingPoints: draft.sellingPoints.trim(),
    price: draft.price.trim(),
    promo: draft.promo.trim(),
    cta: draft.cta.trim(),
    contact: draft.contact.trim(),
    tone: draft.tone.trim(),
    address: draft.address.trim(),
    customDetails: draft.customDetails.trim(),
    schedulingUrl: draft.schedulingUrl.trim(),
    includeSchedulingLink: draft.includeSchedulingLink,
    images: draft.images.slice(0, FLYER_IMAGE_LIMIT),
  };
}

/** Longest edge of a stored flyer photo — keeps data URLs small enough to persist. */
const FLYER_IMAGE_MAX_DIM = 1280;

/**
 * Read an uploaded photo and downscale it client-side (canvas → JPEG) so the
 * stored data URL stays a reasonable size. Returns null for non-images or
 * unreadable files.
 */
async function fileToFlyerImage(file: File): Promise<string | null> {
  if (!file.type.startsWith("image/") || file.size > 15 * 1024 * 1024) return null;
  try {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = dataUrl;
    });
    if (!img.width || !img.height) return null;
    const scale = Math.min(1, FLYER_IMAGE_MAX_DIM / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    // JPEG has no alpha — flatten transparent PNGs onto white, not black.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.78);
  } catch {
    return null;
  }
}

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

export function draftWithPropertyKey(
  base: PromotionDraft,
  key: string,
  listings: ManagerPromotionPropertyOption[],
  opts?: { managerContact?: string },
): PromotionDraft {
  if (key === CUSTOM_PROPERTY_KEY) return { ...base, propertyKey: key };
  const property = listings.find((l) => l.id === key)?.property;
  if (!property) return { ...base, propertyKey: key };
  return enrichPromotionDraftFromListing({ ...base, propertyKey: key }, property, opts);
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
  const [showChooser, setShowChooser] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState<PromotionDraft>(EMPTY_DRAFT);
  const [generating, setGenerating] = useState(false);
  const [generatingTextId, setGeneratingTextId] = useState<string | null>(null);
  const [textModalAssetId, setTextModalAssetId] = useState<string | null>(null);
  const [pendingTextDraft, setPendingTextDraft] = useState<PromotionDraft | null>(null);
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sectionExpanded, setSectionExpanded] = useState(true);
  const [deepLinkPropertyId, setDeepLinkPropertyId] = useState<string | null>(null);
  const [demoPromotionGeneratePending, setDemoPromotionGeneratePending] = useState(false);
  const [contentFilter, setContentFilter] = useState<PromotionContentFilter>("all");
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
    return { all: propertyScopedAssets.length, text, image };
  }, [propertyScopedAssets]);

  const contentTabs = useMemo(
    () => [
      { id: "all", label: "All", count: contentCounts.all, dataAttr: "promotion-filter-all" },
      { id: "text", label: "Text", count: contentCounts.text, dataAttr: "promotion-filter-text" },
      { id: "image", label: "Image", count: contentCounts.image, dataAttr: "promotion-filter-image" },
    ],
    [contentCounts],
  );

  const filteredAssets = useMemo(() => {
    if (contentFilter === "all") return propertyScopedAssets;
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

  useEffect(() => {
    if (!isDemoModeActive()) return;
    const onAutofill = (e: Event) => {
      const detail = (e as CustomEvent<{ propertyId?: string; generateAfter?: boolean }>).detail;
      const pid = detail?.propertyId?.trim() || listings[0]?.id;
      if (!pid) return;
      setDraft(draftWithPropertyKey(EMPTY_DRAFT, pid, listings, autofillOpts));
      setShowChooser(false);
      setShowForm(true);
      setEditingRowId(null);
      setEditingEntryId(null);
      if (detail?.generateAfter) setDemoPromotionGeneratePending(true);
    };
    window.addEventListener(DEMO_PROMOTION_AUTOFILL_EVENT, onAutofill as EventListener);
    return () => window.removeEventListener(DEMO_PROMOTION_AUTOFILL_EVENT, onAutofill as EventListener);
  }, [listings, autofillOpts]);

  const openChooser = useCallback(() => {
    setShowChooser(true);
  }, []);

  const openNewFlyerForm = useCallback(
    (propertyId?: string) => {
      setEditingRowId(null);
      setEditingEntryId(null);
      if (propertyId && listings.some((l) => l.id === propertyId)) {
        setDraft(draftWithPropertyKey(EMPTY_DRAFT, propertyId, listings, autofillOpts));
      } else {
        setDraft(EMPTY_DRAFT);
      }
      setShowForm(true);
    },
    [listings, autofillOpts],
  );

  useEffect(() => {
    if (handledFlyerDeepLink.current || searchParams.get("new") !== "1") return;
    if (!authReady) return;
    const propertyId = searchParams.get("propertyId")?.trim() || "";
    if (propertyId && listings.length === 0 && userId) return;

    handledFlyerDeepLink.current = true;
    setDeepLinkPropertyId(propertyId || null);
    setShowChooser(true);

    const next = new URLSearchParams(searchParams.toString());
    next.delete("new");
    next.delete("propertyId");
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [authReady, listings, userId, searchParams, pathname, router]);

  const closeForm = useCallback(() => {
    setShowForm(false);
    setEditingRowId(null);
    setEditingEntryId(null);
    setDraft(EMPTY_DRAFT);
  }, []);

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

  function onChooseNewKind(kind: PromotionAssetKind) {
    setShowChooser(false);
    if (kind === "flyer") {
      openNewFlyerForm(deepLinkPropertyId ?? undefined);
      setDeepLinkPropertyId(null);
      return;
    }
    const base =
      deepLinkPropertyId && listings.some((l) => l.id === deepLinkPropertyId)
        ? draftWithPropertyKey(EMPTY_DRAFT, deepLinkPropertyId, listings, autofillOpts)
        : EMPTY_DRAFT;
    setPendingTextDraft(base);
    setTextModalAssetId("__new__");
    setDeepLinkPropertyId(null);
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
      setExpandedId(assetId);
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
    const base = pendingTextDraft ?? EMPTY_DRAFT;
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
      setTextModalAssetId(null);
      setPendingTextDraft(null);
      setExpandedId(makePromotionAssetId(row.id, "text", entry.id));
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

  const textModalAsset =
    textModalAssetId && textModalAssetId !== "__new__"
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
          onClick={openChooser}
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

      <PromotionNewChooserModal
        open={showChooser}
        onClose={() => setShowChooser(false)}
        onChoose={onChooseNewKind}
      />

      <Modal
        open={showForm}
        title={editingEntryId ? "Edit flyer" : "New flyer"}
        onClose={closeForm}
        panelClassName="max-w-2xl"
        footer={
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => void generate()} disabled={generating} data-attr="promotion-generate">
              {generating
                ? editingEntryId
                  ? "Updating…"
                  : "Generating…"
                : editingEntryId
                  ? "Update flyer"
                  : "Generate flyer"}
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
          onSelectProperty={onSelectProperty}
        />
      </Modal>

      <PromotionTextGenerateModal
        open={textModalAssetId !== null}
        onClose={() => {
          setTextModalAssetId(null);
          setPendingTextDraft(null);
        }}
        busy={generatingTextId !== null}
        initialFormat={textModalAsset?.textEntry?.copy.format}
        initialTone={textModalAsset?.row.inputs.tone ?? pendingTextDraft?.tone}
        initialImages={textModalAsset?.row.inputs.images ?? pendingTextDraft?.images}
        onGenerate={(opts) => {
          if (textModalAssetId === "__new__") {
            void createTextFromModal(opts);
            return;
          }
          if (!textModalAsset?.textEntry) return;
          void regenerateText(textModalAsset.row, textModalAsset.textEntry.id, opts);
        }}
      />
    </ManagerPortalPageShell>
  );
}

/**
 * Tiny abstract sketch of each template's layout so the picker reads visually
 * (photo areas = tinted blocks, text = hairlines) without rendering real flyers.
 */
function TemplateThumb({ id }: { id: PromotionTemplate }) {
  const photo = "rounded-[3px] bg-primary/50";
  const bar = "rounded-[2px] bg-foreground/60";
  const line = "rounded-[2px] bg-foreground/25";
  const frame = "flex h-16 w-full flex-col gap-1 rounded-md border border-border bg-card p-1.5";
  const circle = "rounded-full bg-primary/50";
  if (id === "showcase") {
    return (
      <div className={`${frame} flex-row items-start justify-between`} aria-hidden="true">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className={`${line} h-1 w-1/2`} />
          <div className={`${bar} h-1.5 w-full`} />
          <div className={`${line} h-1 w-2/3`} />
        </div>
        <div className={`${circle} h-8 w-8 shrink-0`} />
      </div>
    );
  }
  if (id === "listing_sheet") {
    return (
      <div className={frame} aria-hidden="true">
        <div className={`${bar} mx-auto h-1.5 w-2/3`} />
        <div className="flex flex-1 gap-1">
          <div className={`${photo} h-full w-3/5`} />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className={`${line} h-1.5 w-full`} />
            <div className={`${line} h-1 w-full`} />
            <div className={`${line} h-1 w-2/3`} />
          </div>
        </div>
      </div>
    );
  }
  if (id === "photo_hero") {
    return (
      <div className={frame} aria-hidden="true">
        <div className={`${photo} h-7 w-full`} />
        <div className={`${bar} h-1.5 w-3/4`} />
        <div className={`${line} h-1 w-full`} />
        <div className={`${line} h-1 w-2/3`} />
      </div>
    );
  }
  if (id === "split") {
    return (
      <div className={`${frame} flex-row`} aria-hidden="true">
        <div className={`${photo} h-full w-2/5`} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className={`${bar} h-1.5 w-3/4`} />
          <div className={`${line} h-1 w-full`} />
          <div className={`${line} h-1 w-5/6`} />
          <div className={`${line} h-1 w-2/3`} />
        </div>
      </div>
    );
  }
  if (id === "feature_grid") {
    return (
      <div className={frame} aria-hidden="true">
        <div className={`${bar} h-1.5 w-full`} />
        <div className={`${photo} h-4 w-full`} />
        <div className="grid flex-1 grid-cols-2 gap-1">
          <div className={`${line} h-full`} />
          <div className={`${line} h-full`} />
          <div className={`${line} h-full`} />
          <div className={`${line} h-full`} />
        </div>
      </div>
    );
  }
  if (id === "bold_banner") {
    return (
      <div className={frame} aria-hidden="true">
        <div className={`${bar} h-4 w-full`} />
        <div className={`${photo} h-3 w-full`} />
        <div className={`${line} h-1 w-full`} />
        <div className={`${bar} h-2 w-full`} />
      </div>
    );
  }
  return (
    <div className={`${frame} items-center`} aria-hidden="true">
      <div className={`${line} h-1 w-1/3`} />
      <div className={`${bar} h-1.5 w-2/3`} />
      <div className={`${photo} h-5 w-1/2`} />
      <div className={`${line} h-1 w-1/2`} />
    </div>
  );
}

export function PromotionForm({
  draft,
  setDraft,
  listings,
  onSelectProperty,
  hidePropertyPicker = false,
}: {
  draft: PromotionDraft;
  setDraft: React.Dispatch<React.SetStateAction<PromotionDraft>>;
  listings: ManagerPromotionPropertyOption[];
  onSelectProperty: (key: string) => void;
  hidePropertyPicker?: boolean;
}) {
  const { showToast } = useAppUi();
  const [readingPhotos, setReadingPhotos] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const isCustom = draft.propertyKey === CUSTOM_PROPERTY_KEY;
  const selectedTemplate =
    PROMOTION_TEMPLATE_OPTIONS.find((t) => t.id === draft.template) ?? PROMOTION_TEMPLATE_OPTIONS[0]!;

  async function draftWithAi() {
    const label = draft.propertyLabel.trim();
    if (!label && !draft.headline.trim() && isCustom) {
      showToast("Add a property/listing or a headline first.");
      return;
    }
    const propertyId = draft.propertyKey === CUSTOM_PROPERTY_KEY ? null : draft.propertyKey;
    setDrafting(true);
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
      setDraft((d) => applyFlyerCopyToDraftFields(d, copy));
      showToast(source === "ai" ? "Draft fields filled with AI copy." : "Draft fields filled (offline copy).");
    } catch {
      showToast("Could not draft flyer copy. Try again.");
    } finally {
      setDrafting(false);
    }
  }

  async function onPhotoFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    const room = FLYER_IMAGE_LIMIT - draft.images.length;
    const files = Array.from(list).slice(0, Math.max(0, room));
    setReadingPhotos(true);
    try {
      const results = await Promise.all(files.map(fileToFlyerImage));
      const added = results.filter((src): src is string => Boolean(src));
      if (added.length) {
        setDraft((d) => ({ ...d, images: [...d.images, ...added].slice(0, FLYER_IMAGE_LIMIT) }));
      }
      if (added.length < list.length) {
        showToast(
          added.length < files.length
            ? "Some files couldn't be read as images."
            : `Up to ${FLYER_IMAGE_LIMIT} photos per flyer.`,
        );
      }
    } finally {
      setReadingPhotos(false);
    }
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <PromotionAiDraftCard
          prompt={draft.aiPrompt}
          onPromptChange={(value) => setDraft((d) => ({ ...d, aiPrompt: value }))}
          promptId="promotion-flyer-ai-prompt"
          promptPlaceholder="Describe highlights, tone, or anything to emphasize…"
          images={draft.images}
          readingPhotos={readingPhotos}
          onPhotoFiles={(files) => void onPhotoFiles(files)}
          onRemovePhoto={(i) => setDraft((d) => ({ ...d, images: d.images.filter((_, j) => j !== i) }))}
          onDraft={() => void draftWithAi()}
          drafting={drafting}
        />
      </div>
      {hidePropertyPicker ? null : (
        <div>
          <label className="text-xs font-semibold text-muted">Property / listing</label>
          <Select className="mt-1" value={draft.propertyKey} onChange={(e) => onSelectProperty(e.target.value)}>
            <option value={CUSTOM_PROPERTY_KEY}>Custom (type below)</option>
            {listings.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </Select>
        </div>
      )}
      <div>
        <label className="text-xs font-semibold text-muted">Property label (shown on flyer)</label>
        <Input
          className="mt-1"
          value={draft.propertyLabel}
          onChange={(e) => setDraft((d) => ({ ...d, propertyLabel: e.target.value }))}
          placeholder="The Pioneer — Pioneer Square"
        />
      </div>
      <div className="sm:col-span-2">
        <label className="text-xs font-semibold text-muted">Address (shown on flyer)</label>
        <Input
          className="mt-1"
          value={draft.address}
          onChange={(e) => setDraft((d) => ({ ...d, address: e.target.value }))}
          placeholder="1420 Broadway, Seattle, WA 98122"
        />
      </div>
      {isCustom && !hidePropertyPicker ? (
        <div className="sm:col-span-2">
          <label className="text-xs font-semibold text-muted">Custom property details</label>
          <Textarea
            className="mt-1"
            rows={4}
            value={draft.customDetails}
            onChange={(e) => setDraft((d) => ({ ...d, customDetails: e.target.value }))}
            placeholder={"Address, unit mix, square footage, standout features, neighborhood — anything the flyer should highlight."}
          />
          <p className="mt-1 text-[11px] text-muted">
            Fed to the AI as facts to advertise. Used to fill in selling points when you leave them blank.
          </p>
        </div>
      ) : null}
      <div className="sm:col-span-2">
        <label className="text-xs font-semibold text-muted">Flyer name</label>
        <Input
          className="mt-1"
          value={draft.title}
          onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
          placeholder="Spring leasing push"
        />
      </div>
      <div className="sm:col-span-2">
        <label className="text-xs font-semibold text-muted">Headline idea (optional)</label>
        <Input
          className="mt-1"
          value={draft.headline}
          onChange={(e) => setDraft((d) => ({ ...d, headline: e.target.value }))}
          placeholder="Modern living in the heart of the city"
        />
      </div>
      <div className="sm:col-span-2">
        <label className="text-xs font-semibold text-muted">Key selling points / amenities (one per line)</label>
        <Textarea
          className="mt-1"
          rows={4}
          value={draft.sellingPoints}
          onChange={(e) => setDraft((d) => ({ ...d, sellingPoints: e.target.value }))}
          placeholder={"In-unit laundry\nRooftop deck\nSteps from transit"}
        />
      </div>
      <div>
        <label className="text-xs font-semibold text-muted">Price</label>
        <Input
          className="mt-1"
          value={draft.price}
          onChange={(e) => setDraft((d) => ({ ...d, price: e.target.value }))}
          placeholder="$2,400/mo"
        />
      </div>
      <div>
        <label className="text-xs font-semibold text-muted">Promotional offer</label>
        <Input
          className="mt-1"
          value={draft.promo}
          onChange={(e) => setDraft((d) => ({ ...d, promo: e.target.value }))}
          placeholder="First month free"
        />
      </div>
      <div>
        <label className="text-xs font-semibold text-muted">Call to action</label>
        <Input
          className="mt-1"
          value={draft.cta}
          onChange={(e) => setDraft((d) => ({ ...d, cta: e.target.value }))}
          placeholder="Book a tour today"
        />
      </div>
      <div>
        <label className="text-xs font-semibold text-muted">Contact</label>
        <Input
          className="mt-1"
          value={draft.contact}
          onChange={(e) => setDraft((d) => ({ ...d, contact: e.target.value }))}
          placeholder="leasing@axis.com · (206) 555-0142"
        />
      </div>
      <div>
        <label className="flex items-center gap-2 text-xs font-semibold text-muted">
          <input
            type="checkbox"
            checked={draft.includeSchedulingLink}
            onChange={(e) => setDraft((d) => ({ ...d, includeSchedulingLink: e.target.checked }))}
          />
          Include scheduling link in flyer &amp; text
        </label>
        {draft.includeSchedulingLink ? (
          <Input
            className="mt-1"
            value={draft.schedulingUrl}
            onChange={(e) => setDraft((d) => ({ ...d, schedulingUrl: e.target.value }))}
            placeholder="https://…/rent/tours-contact?propertyId=…"
          />
        ) : null}
      </div>
      <div>
        <label className="text-xs font-semibold text-muted">Theme</label>
        <Select
          className="mt-1"
          value={draft.theme}
          onChange={(e) => setDraft((d) => ({ ...d, theme: e.target.value as PromotionTheme }))}
        >
          {PROMOTION_THEME_OPTIONS.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <label className="text-xs font-semibold text-muted">Tone</label>
        <Select
          className="mt-1"
          value={draft.tone}
          onChange={(e) => setDraft((d) => ({ ...d, tone: e.target.value }))}
        >
          {PROMOTION_TONE_OPTIONS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </Select>
      </div>
      <div className="sm:col-span-2">
        <label className="text-xs font-semibold text-muted">Flyer size</label>
        <Select
          className="mt-1"
          value={draft.flyerSize}
          onChange={(e) => setDraft((d) => ({ ...d, flyerSize: e.target.value as FlyerSize }))}
          data-attr="promotion-flyer-size"
        >
          {PROMOTION_SIZE_OPTIONS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </Select>
      </div>
      <div className="sm:col-span-2">
        <label className="text-xs font-semibold text-muted">Flyer template</label>
        <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-5" role="radiogroup" aria-label="Flyer template">
          {PROMOTION_TEMPLATE_OPTIONS.map((t) => {
            const active = draft.template === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={active}
                title={t.description}
                onClick={() => setDraft((d) => ({ ...d, template: t.id }))}
                className={`rounded-xl border p-2 text-left outline-none transition-[border-color,box-shadow] focus-visible:ring-2 focus-visible:ring-primary/25 ${
                  active ? "border-primary/60 ring-2 ring-primary/20" : "border-border hover:border-primary/30"
                }`}
                data-attr="promotion-template-option"
              >
                <TemplateThumb id={t.id} />
                <div className={`mt-1.5 truncate text-[11px] font-semibold ${active ? "text-primary" : "text-foreground"}`}>
                  {t.label}
                </div>
              </button>
            );
          })}
        </div>
        <p className="mt-1 text-[11px] text-muted">{selectedTemplate.description}</p>
      </div>
    </div>
  );
}
