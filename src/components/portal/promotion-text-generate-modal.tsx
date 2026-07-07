"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/input";
import { PromotionAiDraftCard } from "@/components/portal/promotion-ai-draft-card";
import { useAppUi } from "@/components/providers/app-ui-provider";
import {
  PROMOTION_TEXT_FORMAT_DEFAULT,
  PROMOTION_TEXT_FORMAT_OPTIONS,
  type PromotionTextFormat,
} from "@/lib/promotion-text";
import { FLYER_IMAGE_LIMIT, PROMOTION_TONE_OPTIONS } from "@/lib/promotion-flyer";

const FLYER_IMAGE_MAX_DIM = 1280;

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
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.78);
  } catch {
    return null;
  }
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
  onGenerate: (opts: {
    format: PromotionTextFormat;
    tone: string;
    extraInstructions: string;
    images: string[];
  }) => void;
  busy?: boolean;
  initialFormat?: PromotionTextFormat;
  initialTone?: string;
  initialImages?: string[];
}) {
  const { showToast } = useAppUi();
  const [format, setFormat] = useState<PromotionTextFormat>(PROMOTION_TEXT_FORMAT_DEFAULT);
  const [tone, setTone] = useState(PROMOTION_TONE_OPTIONS[0]!);
  const [extraInstructions, setExtraInstructions] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [readingPhotos, setReadingPhotos] = useState(false);

  useEffect(() => {
    if (!open) return;
    setFormat(initialFormat ?? PROMOTION_TEXT_FORMAT_DEFAULT);
    setTone(initialTone?.trim() || PROMOTION_TONE_OPTIONS[0]!);
    setExtraInstructions("");
    setImages((initialImages ?? []).slice(0, FLYER_IMAGE_LIMIT));
  }, [open, initialFormat, initialTone, initialImages]);

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
    <Modal
      open={open}
      title="Generate promotion text"
      onClose={onClose}
      panelClassName="max-w-lg"
      dense
      footer={
        <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
      }
    >
      <div className="space-y-4 text-sm">
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
          draftDataAttr="promotion-text-generate-submit"
        />
      </div>
    </Modal>
  );
}
