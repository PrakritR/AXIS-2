"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Select, Textarea } from "@/components/ui/input";
import {
  PROMOTION_TEXT_FORMAT_DEFAULT,
  PROMOTION_TEXT_FORMAT_OPTIONS,
  type PromotionTextFormat,
} from "@/lib/promotion-text";
import { PROMOTION_TONE_OPTIONS } from "@/lib/promotion-flyer";

export function PromotionTextGenerateModal({
  open,
  onClose,
  onGenerate,
  busy,
  initialFormat,
  initialTone,
}: {
  open: boolean;
  onClose: () => void;
  onGenerate: (opts: { format: PromotionTextFormat; tone: string; extraInstructions: string }) => void;
  busy?: boolean;
  initialFormat?: PromotionTextFormat;
  initialTone?: string;
}) {
  const [format, setFormat] = useState<PromotionTextFormat>(PROMOTION_TEXT_FORMAT_DEFAULT);
  const [tone, setTone] = useState(PROMOTION_TONE_OPTIONS[0]!);
  const [extraInstructions, setExtraInstructions] = useState("");

  useEffect(() => {
    if (!open) return;
    setFormat(initialFormat ?? PROMOTION_TEXT_FORMAT_DEFAULT);
    setTone(initialTone?.trim() || PROMOTION_TONE_OPTIONS[0]!);
    setExtraInstructions("");
  }, [open, initialFormat, initialTone]);

  const selected = PROMOTION_TEXT_FORMAT_OPTIONS.find((o) => o.id === format);

  return (
    <Modal open={open} title="Generate promotion text" onClose={onClose} panelClassName="max-w-lg" dense>
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
        <div>
          <label className="text-xs font-semibold text-muted" htmlFor="promotion-text-notes">
            Extra instructions (optional)
          </label>
          <Textarea
            id="promotion-text-notes"
            className="mt-1"
            rows={3}
            value={extraInstructions}
            onChange={(e) => setExtraInstructions(e.target.value)}
            placeholder="Mention the rooftop deck, highlight pet-friendly policy, keep it under 200 words…"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            disabled={busy}
            data-attr="promotion-text-generate-submit"
            onClick={() => onGenerate({ format, tone, extraInstructions })}
          >
            {busy ? "Generating…" : "Generate text"}
          </Button>
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  );
}
