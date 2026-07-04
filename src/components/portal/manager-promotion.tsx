"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { ManagerPortalPageShell, MANAGER_TABLE_TH } from "@/components/portal/portal-metrics";
import {
  PORTAL_DATA_TABLE_SCROLL,
  PORTAL_DATA_TABLE_WRAP,
  PortalDataTableEmpty,
  PORTAL_TABLE_HEAD_ROW,
  PORTAL_TABLE_TR_EXPANDABLE,
  PORTAL_TABLE_DETAIL_ROW,
  PORTAL_TABLE_DETAIL_CELL,
  PORTAL_TABLE_TD,
  PORTAL_MOBILE_CARD_CLASS,
  PORTAL_DETAIL_BTN,
  PortalTableDetailActions,
  createPortalRowExpandClick,
} from "@/components/portal/portal-data-table";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input, Select, Textarea } from "@/components/ui/input";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { useManagerUserId } from "@/hooks/use-manager-user-id";
import { track } from "@/lib/analytics/track-client";
import { PromotionFlyerPreview, downloadPromotionFlyer } from "@/components/portal/promotion-flyer-preview";
import {
  buildManagerPromotionPropertyOptions,
  type ManagerPromotionPropertyOption,
} from "@/lib/manager-property-links";
import {
  FLYER_IMAGE_LIMIT,
  normalizePromotionTemplate,
  PROMOTION_TEMPLATE_DEFAULT,
  PROMOTION_TEMPLATE_OPTIONS,
  PROMOTION_THEME_OPTIONS,
  PROMOTION_TONE_OPTIONS,
  PROMOTION_SIZE_OPTIONS,
  type FlyerSize,
  type ManagerPromotionRow,
  type PromotionInputs,
  type PromotionTemplate,
  type PromotionTheme,
} from "@/lib/promotion-flyer";
import {
  MANAGER_PROMOTIONS_EVENT,
  generateFlyerCopy,
  makePromotionId,
  readManagerPromotionRows,
  syncManagerPromotionsFromServer,
  upsertManagerPromotion,
  deleteManagerPromotionRow,
} from "@/lib/manager-promotions-storage";
import {
  PROPERTY_PIPELINE_EVENT,
  syncPropertyPipelineFromServer,
} from "@/lib/demo-property-pipeline";

type PromotionDraft = {
  propertyKey: string;
  propertyLabel: string;
  title: string;
  headline: string;
  sellingPoints: string;
  customDetails: string;
  price: string;
  promo: string;
  cta: string;
  contact: string;
  theme: PromotionTheme;
  flyerSize: FlyerSize;
  template: PromotionTemplate;
  tone: string;
  /** Uploaded property photos as downscaled data URLs. */
  images: string[];
};

const CUSTOM_PROPERTY_KEY = "__custom__";

const EMPTY_DRAFT: PromotionDraft = {
  propertyKey: CUSTOM_PROPERTY_KEY,
  propertyLabel: "",
  title: "",
  headline: "",
  sellingPoints: "",
  customDetails: "",
  price: "",
  promo: "",
  cta: "",
  contact: "",
  theme: "cobalt",
  flyerSize: "letter",
  template: PROMOTION_TEMPLATE_DEFAULT,
  tone: PROMOTION_TONE_OPTIONS[0]!,
  images: [],
};

function draftInputs(draft: PromotionDraft): PromotionInputs {
  return {
    headline: draft.headline.trim(),
    sellingPoints: draft.sellingPoints.trim(),
    price: draft.price.trim(),
    promo: draft.promo.trim(),
    cta: draft.cta.trim(),
    contact: draft.contact.trim(),
    tone: draft.tone.trim(),
    customDetails: draft.customDetails.trim(),
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

function formatDate(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "—";
  return new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function ManagerPromotion() {
  const { showToast } = useAppUi();
  const { userId, ready: authReady } = useManagerUserId();
  const [tick, setTick] = useState(0);
  const [propertyTick, setPropertyTick] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState<PromotionDraft>(EMPTY_DRAFT);
  const [generating, setGenerating] = useState(false);
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

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
    return readManagerPromotionRows().sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }, [tick]);

  // Owner-scoped: only the manager's OWN live listings (plus co-managed ones),
  // with clean display names — never another manager's or a raw seed key.
  const listings = useMemo<ManagerPromotionPropertyOption[]>(() => {
    void propertyTick;
    return buildManagerPromotionPropertyOptions(userId);
  }, [userId, propertyTick]);

  const openNew = useCallback(() => {
    setDraft(EMPTY_DRAFT);
    setEditingId(null);
    setShowForm(true);
  }, []);

  const closeForm = useCallback(() => {
    setShowForm(false);
    setEditingId(null);
    setDraft(EMPTY_DRAFT);
  }, []);

  const openEdit = useCallback(
    (row: ManagerPromotionRow) => {
      setDraft({
        propertyKey:
          row.propertyId && listings.some((l) => l.id === row.propertyId)
            ? row.propertyId
            : CUSTOM_PROPERTY_KEY,
        propertyLabel: row.propertyLabel,
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
      });
      setEditingId(row.id);
      setShowForm(true);
    },
    [listings],
  );

  function onSelectProperty(key: string) {
    if (key === CUSTOM_PROPERTY_KEY) {
      setDraft((d) => ({ ...d, propertyKey: key }));
      return;
    }
    const listing = listings.find((l) => l.id === key)?.property;
    setDraft((d) => ({
      ...d,
      propertyKey: key,
      propertyLabel: listing ? `${listing.title} — ${listing.neighborhood || listing.address}` : d.propertyLabel,
      price: d.price.trim() ? d.price : listing?.rentLabel ?? d.price,
      sellingPoints:
        d.sellingPoints.trim() || !listing
          ? d.sellingPoints
          : [`${listing.beds} bed · ${listing.baths} bath`, listing.petFriendly ? "Pet friendly" : "", listing.tagline]
              .filter(Boolean)
              .join("\n"),
    }));
  }

  async function generate() {
    const label = draft.propertyLabel.trim();
    const title = draft.title.trim() || draft.headline.trim() || label || "Untitled promotion";
    if (!label && !draft.headline.trim()) {
      showToast("Add a property/listing or a headline first.");
      return;
    }
    const propertyId = draft.propertyKey === CUSTOM_PROPERTY_KEY ? null : draft.propertyKey;
    const editing = editingId ? promotions.find((p) => p.id === editingId) ?? null : null;
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

  async function regenerate(row: ManagerPromotionRow) {
    setRegeneratingId(row.id);
    track("promotion_regenerated", { theme: row.theme, template: normalizePromotionTemplate(row.template) });
    try {
      const { copy, source } = await generateFlyerCopy(row.inputs, row.propertyLabel, row.propertyId);
      if (source === "forbidden") {
        showToast("You can only create flyers for your own properties.");
        return;
      }
      upsertManagerPromotion({ ...row, copy, status: "generated", updatedAt: new Date().toISOString() });
      showToast("Flyer regenerated.");
    } catch {
      showToast("Could not regenerate the flyer.");
    } finally {
      setRegeneratingId(null);
    }
  }

  function removePromotion(id: string) {
    if (!deleteManagerPromotionRow(id)) return;
    if (editingId === id) closeForm();
    if (expandedId === id) setExpandedId(null);
    showToast("Promotion deleted.");
  }

  const renderRowDetail = (row: ManagerPromotionRow) => (
    <>
      <div>
        <PromotionFlyerPreview promotion={row} embedded />
      </div>
      <PortalTableDetailActions>
        <Button
          type="button"
          variant="outline"
          className={PORTAL_DETAIL_BTN}
          onClick={() => downloadPromotionFlyer(row)}
          data-attr="promotion-flyer-download"
        >
          Download
        </Button>
        <Button
          type="button"
          variant="outline"
          className={PORTAL_DETAIL_BTN}
          onClick={() => openEdit(row)}
          data-attr="promotion-edit"
        >
          Edit
        </Button>
        <Button
          type="button"
          variant="outline"
          className={PORTAL_DETAIL_BTN}
          onClick={() => regenerate(row)}
          disabled={regeneratingId === row.id}
          data-attr="promotion-regenerate"
        >
          {regeneratingId === row.id ? "Regenerating…" : "Regenerate"}
        </Button>
        <Button
          type="button"
          variant="outline"
          className={PORTAL_DETAIL_BTN}
          onClick={() => removePromotion(row.id)}
          data-attr="promotion-delete"
        >
          Delete
        </Button>
      </PortalTableDetailActions>
    </>
  );

  return (
    <ManagerPortalPageShell
      title="Promotion"
      titleAside={
        <Button type="button" onClick={openNew} data-attr="promotion-new">
          New promotion
        </Button>
      }
    >
      <Modal
        open={showForm}
        title={editingId ? "Edit promotion" : "New promotion"}
        onClose={closeForm}
        panelClassName="max-w-2xl"
      >
        <PromotionForm draft={draft} setDraft={setDraft} listings={listings} onSelectProperty={onSelectProperty} />
        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="button" onClick={generate} disabled={generating} data-attr="promotion-generate">
            {generating
              ? editingId
                ? "Updating…"
                : "Generating…"
              : editingId
                ? "Update flyer"
                : "Generate flyer"}
          </Button>
          <Button type="button" variant="outline" onClick={closeForm}>
            Cancel
          </Button>
        </div>
      </Modal>

      {promotions.length === 0 ? (
        <PortalDataTableEmpty message="No promotions yet." icon="data" />
      ) : (
        <>
          <div className="space-y-2 lg:hidden">
            {promotions.map((row) => {
              const isOpen = expandedId === row.id;
              return (
                <div key={row.id} className={PORTAL_MOBILE_CARD_CLASS}>
                  <button
                    type="button"
                    className="w-full text-left"
                    onClick={() => setExpandedId((cur) => (cur === row.id ? null : row.id))}
                    data-attr="promotion-row"
                  >
                    <p className="truncate font-semibold text-foreground">{row.propertyLabel || "—"}</p>
                    <p className="mt-0.5 truncate text-xs text-muted">
                      {row.copy?.headline || row.title || "—"}
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-muted/90">
                      Created {formatDate(row.createdAt)}
                    </p>
                  </button>
                  <div className="mt-2">
                    <Button
                      type="button"
                      variant="outline"
                      className={PORTAL_DETAIL_BTN}
                      onClick={() => setExpandedId((cur) => (cur === row.id ? null : row.id))}
                    >
                      {isOpen ? "Less" : "Details"}
                    </Button>
                  </div>
                  {isOpen ? <div className="mt-3 border-t border-border pt-3">{renderRowDetail(row)}</div> : null}
                </div>
              );
            })}
          </div>
          <div className={`${PORTAL_DATA_TABLE_WRAP} hidden lg:block`}>
            <div className={PORTAL_DATA_TABLE_SCROLL}>
              <table className="w-full min-w-[560px] border-collapse text-left text-sm">
                <thead>
                  <tr className={PORTAL_TABLE_HEAD_ROW}>
                    <th className={MANAGER_TABLE_TH}>Property / Listing</th>
                    <th className={MANAGER_TABLE_TH}>Title / Headline</th>
                    <th className={MANAGER_TABLE_TH}>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {promotions.map((row) => {
                    const isOpen = expandedId === row.id;
                    return (
                      <Fragment key={row.id}>
                        <tr
                          className={`${PORTAL_TABLE_TR_EXPANDABLE} ${isOpen ? "bg-accent/30" : ""}`}
                          onClick={createPortalRowExpandClick(() =>
                            setExpandedId((cur) => (cur === row.id ? null : row.id)),
                          )}
                          aria-expanded={isOpen}
                          data-attr="promotion-row"
                        >
                          <td className={PORTAL_TABLE_TD}>{row.propertyLabel || "—"}</td>
                          <td className={PORTAL_TABLE_TD}>{row.copy?.headline || row.title || "—"}</td>
                          <td className={PORTAL_TABLE_TD}>{formatDate(row.createdAt)}</td>
                        </tr>
                        {isOpen ? (
                          <tr className={PORTAL_TABLE_DETAIL_ROW}>
                            <td colSpan={3} className={PORTAL_TABLE_DETAIL_CELL}>
                              {renderRowDetail(row)}
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
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

function PromotionForm({
  draft,
  setDraft,
  listings,
  onSelectProperty,
}: {
  draft: PromotionDraft;
  setDraft: React.Dispatch<React.SetStateAction<PromotionDraft>>;
  listings: ManagerPromotionPropertyOption[];
  onSelectProperty: (key: string) => void;
}) {
  const { showToast } = useAppUi();
  const [readingPhotos, setReadingPhotos] = useState(false);
  const isCustom = draft.propertyKey === CUSTOM_PROPERTY_KEY;
  const selectedTemplate =
    PROMOTION_TEMPLATE_OPTIONS.find((t) => t.id === draft.template) ?? PROMOTION_TEMPLATE_OPTIONS[0]!;

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
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
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
      <div>
        <label className="text-xs font-semibold text-muted">Property label (shown on flyer)</label>
        <Input
          className="mt-1"
          value={draft.propertyLabel}
          onChange={(e) => setDraft((d) => ({ ...d, propertyLabel: e.target.value }))}
          placeholder="The Pioneer — Pioneer Square"
        />
      </div>
      {isCustom ? (
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
        <label className="text-xs font-semibold text-muted">Promotion title (internal)</label>
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
      <div className="sm:col-span-2">
        <label className="text-xs font-semibold text-muted">
          Property photos <span className="font-normal">(up to {FLYER_IMAGE_LIMIT})</span>
        </label>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          {draft.images.map((src, i) => (
            <div key={i} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element -- small local data-URL thumbnail */}
              <img
                src={src}
                alt={`Uploaded property photo ${i + 1}`}
                className="h-16 w-20 rounded-lg border border-border object-cover"
              />
              <button
                type="button"
                aria-label={`Remove photo ${i + 1}`}
                onClick={() => setDraft((d) => ({ ...d, images: d.images.filter((_, j) => j !== i) }))}
                className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-foreground text-[11px] font-bold leading-none text-background shadow"
                data-attr="promotion-photo-remove"
              >
                ×
              </button>
            </div>
          ))}
          {draft.images.length < FLYER_IMAGE_LIMIT ? (
            <label
              className="flex h-16 w-20 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-lg border border-dashed border-border text-muted transition-colors hover:border-primary/40 hover:text-primary"
              data-attr="promotion-photo-add"
            >
              <span className="text-lg leading-none">+</span>
              <span className="text-[10px] font-semibold">{readingPhotos ? "Adding…" : "Add photo"}</span>
              <input
                type="file"
                accept="image/*"
                multiple
                className="sr-only"
                disabled={readingPhotos}
                onChange={(e) => {
                  void onPhotoFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
          ) : null}
        </div>
        <p className="mt-1 text-[11px] text-muted">
          Shown in the flyer&apos;s photo slots (hero, sidebar, photo band). Photos are downscaled automatically;
          templates without a photo still render cleanly.
        </p>
      </div>
    </div>
  );
}
