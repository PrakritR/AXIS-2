"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { ManagerPortalPageShell, ManagerPortalFilterRow, ManagerPortalStatusPills, MANAGER_TABLE_TH } from "@/components/portal/portal-metrics";
import {
  PORTAL_DATA_TABLE_SCROLL,
  PORTAL_DATA_TABLE_WRAP,
  PortalDataTableEmpty,
  PORTAL_TABLE_HEAD_ROW,
  PORTAL_TABLE_TR,
  PORTAL_TABLE_TD,
} from "@/components/portal/portal-data-table";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { useAppUi } from "@/components/providers/app-ui-provider";
import { useManagerUserId } from "@/hooks/use-manager-user-id";
import { track } from "@/lib/analytics/track-client";
import { PromotionFlyerPreview } from "@/components/portal/promotion-flyer-preview";
import {
  PROMOTION_THEME_OPTIONS,
  PROMOTION_TONE_OPTIONS,
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
  readExtraListingsForUser,
  syncPropertyPipelineFromServer,
} from "@/lib/demo-property-pipeline";

type PromotionDraft = {
  propertyKey: string;
  propertyLabel: string;
  title: string;
  headline: string;
  sellingPoints: string;
  price: string;
  promo: string;
  cta: string;
  contact: string;
  theme: PromotionTheme;
  tone: string;
};

const CUSTOM_PROPERTY_KEY = "__custom__";

const EMPTY_DRAFT: PromotionDraft = {
  propertyKey: CUSTOM_PROPERTY_KEY,
  propertyLabel: "",
  title: "",
  headline: "",
  sellingPoints: "",
  price: "",
  promo: "",
  cta: "",
  contact: "",
  theme: "cobalt",
  tone: PROMOTION_TONE_OPTIONS[0]!,
};

const STATUS_TABS: { id: "all" | "generated" | "draft"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "generated", label: "Generated" },
  { id: "draft", label: "Drafts" },
];

function draftInputs(draft: PromotionDraft): PromotionInputs {
  return {
    headline: draft.headline.trim(),
    sellingPoints: draft.sellingPoints.trim(),
    price: draft.price.trim(),
    promo: draft.promo.trim(),
    cta: draft.cta.trim(),
    contact: draft.contact.trim(),
    tone: draft.tone.trim(),
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
  const [bucket, setBucket] = useState<"all" | "generated" | "draft">("all");
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState<PromotionDraft>(EMPTY_DRAFT);
  const [generating, setGenerating] = useState(false);
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);

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

  const listings = useMemo(() => {
    void propertyTick;
    return readExtraListingsForUser(userId);
  }, [userId, propertyTick]);

  const counts = useMemo(
    () => ({
      all: promotions.length,
      generated: promotions.filter((p) => p.status === "generated").length,
      draft: promotions.filter((p) => p.status === "draft").length,
    }),
    [promotions],
  );

  const visible = useMemo(
    () => (bucket === "all" ? promotions : promotions.filter((p) => p.status === bucket)),
    [promotions, bucket],
  );

  const previewPromotion = useMemo(
    () => promotions.find((p) => p.id === previewId) ?? null,
    [promotions, previewId],
  );

  const openNew = useCallback(() => {
    setDraft(EMPTY_DRAFT);
    setShowForm(true);
  }, []);

  function onSelectProperty(key: string) {
    if (key === CUSTOM_PROPERTY_KEY) {
      setDraft((d) => ({ ...d, propertyKey: key }));
      return;
    }
    const listing = listings.find((l) => l.id === key);
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
    setGenerating(true);
    track("promotion_generation_started", { theme: draft.theme });
    try {
      const inputs = draftInputs(draft);
      const { copy, source } = await generateFlyerCopy(inputs, label);
      const now = new Date().toISOString();
      upsertManagerPromotion({
        id: makePromotionId(),
        managerUserId: userId ?? null,
        propertyId: draft.propertyKey === CUSTOM_PROPERTY_KEY ? null : draft.propertyKey,
        propertyLabel: label,
        title,
        theme: draft.theme,
        status: "generated",
        inputs,
        copy,
        createdAt: now,
        updatedAt: now,
      });
      setShowForm(false);
      setDraft(EMPTY_DRAFT);
      showToast(source === "ai" ? "Flyer generated." : "Flyer generated (offline copy).");
    } catch {
      showToast("Could not generate the flyer. Try again.");
    } finally {
      setGenerating(false);
    }
  }

  async function regenerate(row: ManagerPromotionRow) {
    setRegeneratingId(row.id);
    track("promotion_regenerated", { theme: row.theme });
    try {
      const { copy } = await generateFlyerCopy(row.inputs, row.propertyLabel);
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
    if (previewId === id) setPreviewId(null);
    showToast("Promotion deleted.");
  }

  const filterRow = (
    <ManagerPortalFilterRow>
      <ManagerPortalStatusPills
        tabs={STATUS_TABS.map((t) => ({ ...t, count: counts[t.id] }))}
        activeId={bucket}
        onChange={(id) => setBucket(id as "all" | "generated" | "draft")}
      />
    </ManagerPortalFilterRow>
  );

  return (
    <ManagerPortalPageShell
      title="Promotion"
      subtitle="Generate on-brand marketing flyers for your listings with AI."
      titleAside={
        <Button type="button" onClick={openNew} data-attr="promotion-new">
          New promotion
        </Button>
      }
      filterRow={filterRow}
    >
      {showForm ? (
        <div className="mb-6 rounded-2xl border border-border bg-card p-5">
          <p className="text-sm font-semibold text-foreground">New promotion</p>
          <p className="mt-1 text-xs text-muted">
            Set the inputs, then generate. Copy is AI-composed from your facts; the flyer uses your Axis brand styling.
          </p>
          <PromotionForm draft={draft} setDraft={setDraft} listings={listings} onSelectProperty={onSelectProperty} />
          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="button" onClick={generate} disabled={generating} data-attr="promotion-generate">
              {generating ? "Generating…" : "Generate flyer"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setShowForm(false);
                setDraft(EMPTY_DRAFT);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {visible.length === 0 ? (
        <PortalDataTableEmpty
          message={promotions.length === 0 ? "No promotions yet." : "No promotions in this view."}
          icon="data"
        />
      ) : (
        <div className={PORTAL_DATA_TABLE_WRAP}>
          <div className={PORTAL_DATA_TABLE_SCROLL}>
            <table className="w-full min-w-[720px] border-collapse text-left text-sm">
              <thead>
                <tr className={PORTAL_TABLE_HEAD_ROW}>
                  <th className={MANAGER_TABLE_TH}>Property / Listing</th>
                  <th className={MANAGER_TABLE_TH}>Title / Headline</th>
                  <th className={MANAGER_TABLE_TH}>Created</th>
                  <th className={MANAGER_TABLE_TH}>Status</th>
                  <th className={MANAGER_TABLE_TH}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => (
                  <Fragment key={row.id}>
                    <tr className={PORTAL_TABLE_TR}>
                      <td className={PORTAL_TABLE_TD}>{row.propertyLabel || "—"}</td>
                      <td className={PORTAL_TABLE_TD}>{row.copy?.headline || row.title || "—"}</td>
                      <td className={PORTAL_TABLE_TD}>{formatDate(row.createdAt)}</td>
                      <td className={PORTAL_TABLE_TD}>
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${
                            row.status === "generated"
                              ? "portal-badge-success ring-[color-mix(in_srgb,currentColor_25%,transparent)]"
                              : "bg-accent/30 text-muted ring-border"
                          }`}
                        >
                          {row.status === "generated" ? "Generated" : "Draft"}
                        </span>
                      </td>
                      <td className={PORTAL_TABLE_TD}>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            className="h-8 text-xs"
                            onClick={() => setPreviewId(row.id)}
                            data-attr="promotion-view"
                          >
                            View
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            className="h-8 text-xs"
                            onClick={() => regenerate(row)}
                            disabled={regeneratingId === row.id}
                            data-attr="promotion-regenerate"
                          >
                            {regeneratingId === row.id ? "…" : "Regenerate"}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            className="h-8 text-xs"
                            onClick={() => removePromotion(row.id)}
                            data-attr="promotion-delete"
                          >
                            Delete
                          </Button>
                        </div>
                      </td>
                    </tr>
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {previewPromotion ? (
        <PromotionFlyerPreview promotion={previewPromotion} onClose={() => setPreviewId(null)} />
      ) : null}
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
  listings: { id: string; title: string }[];
  onSelectProperty: (key: string) => void;
}) {
  return (
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <div>
        <label className="text-xs font-semibold text-muted">Property / listing</label>
        <Select className="mt-1" value={draft.propertyKey} onChange={(e) => onSelectProperty(e.target.value)}>
          <option value={CUSTOM_PROPERTY_KEY}>Custom (type below)</option>
          {listings.map((l) => (
            <option key={l.id} value={l.id}>
              {l.title}
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
    </div>
  );
}
