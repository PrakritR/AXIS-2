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
  PROMOTION_THEME_OPTIONS,
  PROMOTION_TONE_OPTIONS,
  PROMOTION_SIZE_OPTIONS,
  type FlyerSize,
  type ManagerPromotionRow,
  type PromotionInputs,
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
  tone: string;
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
  tone: PROMOTION_TONE_OPTIONS[0]!,
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
  };
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
        tone: row.inputs.tone || PROMOTION_TONE_OPTIONS[0]!,
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
      track("promotion_regenerated", { theme: draft.theme });
    } else {
      track("promotion_generation_started", { theme: draft.theme, flyer_size: draft.flyerSize });
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
    track("promotion_regenerated", { theme: row.theme });
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
        <div className={PORTAL_DATA_TABLE_WRAP}>
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
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted">
                              <span className="inline-flex items-center gap-1.5">
                                <span className="font-semibold uppercase tracking-[0.12em] text-muted/80">Status</span>
                                <span
                                  className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${
                                    row.status === "generated"
                                      ? "portal-badge-success ring-[color-mix(in_srgb,currentColor_25%,transparent)]"
                                      : "bg-accent/30 text-muted ring-border"
                                  }`}
                                >
                                  {row.status === "generated" ? "Generated" : "Draft"}
                                </span>
                              </span>
                              {row.title ? (
                                <span>
                                  <span className="font-semibold uppercase tracking-[0.12em] text-muted/80">Title</span>{" "}
                                  {row.title}
                                </span>
                              ) : null}
                            </div>
                            <div className="mt-4">
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
      )}
    </ManagerPortalPageShell>
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
  const isCustom = draft.propertyKey === CUSTOM_PROPERTY_KEY;
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
    </div>
  );
}
