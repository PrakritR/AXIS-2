"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/input";
import { PromotionAiDraftCard } from "@/components/portal/promotion-ai-draft-card";
import { PromotionPropertyPicker } from "@/components/portal/promotion-form";
import { useAppUi } from "@/components/providers/app-ui-provider";
import type { ManagerPromotionPropertyOption } from "@/lib/manager-property-links";
import {
  PROMOTION_TEXT_FORMAT_DEFAULT,
  PROMOTION_TEXT_FORMAT_OPTIONS,
  type PromotionTextFormat,
} from "@/lib/promotion-text";
import { FLYER_IMAGE_LIMIT, PROMOTION_TONE_OPTIONS } from "@/lib/promotion-flyer";
import { fileToFlyerImage } from "@/lib/promotion-image-upload";

function sameImages(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
}

export type PromotionTextGenerateOptions = {
  format: PromotionTextFormat;
  tone: string;
  extraInstructions: string;
  images: string[];
};

/**
 * The Channel / Tone / notes body of the promotion-text generator, without a
 * Modal shell. Extracted so it can live standalone (below) OR inline inside the
 * unified "New promotion" modal, where the type dropdown swaps between the flyer
 * form and this composer. Reports "dirty" so the parent can warn before a type
 * switch discards typed content.
 *
 * Pass `propertyKey` + `onSelectProperty` to surface the property picker — the
 * create surface needs it so a text promotion is attached to a real property
 * instead of silently saving as "Untitled promotion" with no property. The
 * standalone edit modal omits them: the asset's property is already fixed.
 */
export function PromotionTextComposer({
  onGenerate,
  busy,
  initialFormat,
  initialTone,
  initialImages,
  onDirtyChange,
  submitDataAttr = "promotion-text-generate-submit",
  propertyKey,
  listings,
  onSelectProperty,
}: {
  onGenerate: (opts: PromotionTextGenerateOptions) => void;
  busy?: boolean;
  initialFormat?: PromotionTextFormat;
  initialTone?: string;
  initialImages?: string[];
  onDirtyChange?: (dirty: boolean) => void;
  submitDataAttr?: string;
  propertyKey?: string;
  listings?: ManagerPromotionPropertyOption[];
  onSelectProperty?: (key: string) => void;
}) {
  const { showToast } = useAppUi();
  const baseFormat = initialFormat ?? PROMOTION_TEXT_FORMAT_DEFAULT;
  const baseTone = initialTone?.trim() || PROMOTION_TONE_OPTIONS[0]!;
  const [format, setFormat] = useState<PromotionTextFormat>(baseFormat);
  const [tone, setTone] = useState(baseTone);
  const [extraInstructions, setExtraInstructions] = useState("");
  const [images, setImages] = useState<string[]>((initialImages ?? []).slice(0, FLYER_IMAGE_LIMIT));
  const [readingPhotos, setReadingPhotos] = useState(false);

  // Re-seed when the initial values change (e.g. the standalone modal reopens for
  // a different asset). Mounting fresh inside the unified modal covers that case.
  useEffect(() => {
    setFormat(baseFormat);
    setTone(baseTone);
    setExtraInstructions("");
    setImages((initialImages ?? []).slice(0, FLYER_IMAGE_LIMIT));
  }, [baseFormat, baseTone, initialImages]);

  const baseImages = (initialImages ?? []).slice(0, FLYER_IMAGE_LIMIT);
  const dirty =
    format !== baseFormat ||
    tone !== baseTone ||
    extraInstructions.trim() !== "" ||
    !sameImages(images, baseImages);
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  async function onPhotoFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    const room = FLYER_IMAGE_LIMIT - images.length;
    const files = Array.from(list).slice(0, Math.max(0, room));
    setReadingPhotos(true);
    try {
      const results = await Promise.all(files.map(fileToFlyerImage));
      const added = results.filter((src): src is string => Boolean(src));
      if (added.length) {
        setImages((cur) => [...cur, ...added].slice(0, FLYER_IMAGE_LIMIT));
      }
      if (added.length < list.length) {
        showToast(
          added.length < files.length
            ? "Some files couldn't be read as images."
            : `Up to ${FLYER_IMAGE_LIMIT} photos per promotion.`,
        );
      }
    } finally {
      setReadingPhotos(false);
    }
  }

  const selected = PROMOTION_TEXT_FORMAT_OPTIONS.find((o) => o.id === format);

  return (
    <div className="space-y-4 text-sm">
      {propertyKey !== undefined && onSelectProperty ? (
        <PromotionPropertyPicker
          id="promotion-text-property"
          value={propertyKey}
          listings={listings ?? []}
          onSelect={onSelectProperty}
          customLabel="Custom (no property)"
        />
      ) : null}
      <div>
        <label className="text-xs font-semibold text-muted" htmlFor="promotion-text-format">
          Channel / format
        </label>
        <Select
          id="promotion-text-format"
          className="mt-1"
          value={format}
          onChange={(e) => setFormat(e.target.value as PromotionTextFormat)}
        >
          {PROMOTION_TEXT_FORMAT_OPTIONS.map((opt) => (
            <option key={opt.id} value={opt.id}>
              {opt.label}
            </option>
          ))}
        </Select>
        {selected ? <p className="mt-1.5 text-xs text-muted">{selected.description}</p> : null}
      </div>
      <div>
        <label className="text-xs font-semibold text-muted" htmlFor="promotion-text-tone">
          Tone
        </label>
        <Select
          id="promotion-text-tone"
          className="mt-1"
          value={tone}
          onChange={(e) => setTone(e.target.value)}
        >
          {PROMOTION_TONE_OPTIONS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </Select>
      </div>
      <PromotionAiDraftCard
        prompt={extraInstructions}
        onPromptChange={setExtraInstructions}
        promptId="promotion-text-notes"
        promptPlaceholder="Mention the rooftop deck, highlight pet-friendly policy, keep it under 200 words…"
        images={images}
        readingPhotos={readingPhotos}
        onPhotoFiles={(files) => void onPhotoFiles(files)}
        onRemovePhoto={(i) => setImages((cur) => cur.filter((_, j) => j !== i))}
        onDraft={() => onGenerate({ format, tone, extraInstructions, images })}
        drafting={busy}
        draftDataAttr={submitDataAttr}
      />
    </div>
  );
}

export function PromotionTextGenerateModal({
  open,
  onClose,
  onGenerate,
  busy,
  initialFormat,
  initialTone,
  initialImages,
}: {
  open: boolean;
  onClose: () => void;
  onGenerate: (opts: PromotionTextGenerateOptions) => void;
  busy?: boolean;
  initialFormat?: PromotionTextFormat;
  initialTone?: string;
  initialImages?: string[];
}) {
  return (
    <Modal
      open={open}
      title="Generate promotion text"
      onClose={onClose}
      busy={busy}
      panelClassName="max-w-lg"
      dense
      footer={
        <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
      }
    >
      <PromotionTextComposer
        onGenerate={onGenerate}
        busy={busy}
        initialFormat={initialFormat}
        initialTone={initialTone}
        initialImages={initialImages}
      />
    </Modal>
  );
}
