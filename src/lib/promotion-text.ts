/**
 * Promotion marketing text — social posts, listing blurbs, email, SMS.
 * Separate from flyer copy; shares {@link PromotionInputs} as facts.
 */

import { composeFallbackFlyerCopy, parseSellingPoints, type PromotionInputs } from "@/lib/promotion-flyer";

export type PromotionTextFormat =
  | "instagram_caption"
  | "facebook_post"
  | "listing_blurb"
  | "email_blast"
  | "sms";

export type PromotionTextCopy = {
  format: PromotionTextFormat;
  hook: string;
  body: string;
  hashtags: string;
  ctaLine: string;
  subjectLine?: string;
};

/** One generated or hand-edited promotion text block (multiple per listing). */
export type PromotionTextEntry = {
  id: string;
  /** Manager-editable list label; defaults to "Text N" when empty. */
  title?: string;
  copy: PromotionTextCopy;
  createdAt: string;
  updatedAt: string;
};

export function makePromotionTextEntryId(): string {
  return `ptext-${crypto.randomUUID()}`;
}

export function defaultPromotionTextEntryTitle(sequenceNumber: number): string {
  return `Text ${sequenceNumber}`;
}

/** Prefer a manager-set title; otherwise numbered "Text N". */
export function promotionTextEntryDisplayTitle(
  entry: Pick<PromotionTextEntry, "title">,
  index: number,
): string {
  const trimmed = entry.title?.trim();
  return trimmed || defaultPromotionTextEntryTitle(index + 1);
}

export function createPromotionTextEntry(
  copy: PromotionTextCopy,
  title = "",
  now = new Date().toISOString(),
): PromotionTextEntry {
  return { id: makePromotionTextEntryId(), title: title.trim(), copy, createdAt: now, updatedAt: now };
}

function isPromotionTextEntry(raw: unknown): raw is PromotionTextEntry {
  if (!raw || typeof raw !== "object") return false;
  const e = raw as PromotionTextEntry;
  return Boolean(e.id && e.copy && typeof e.copy.body === "string");
}

/** Read text entries from a promotion row, migrating legacy single `textCopy`. */
export function readPromotionTextEntries(row: {
  textCopy?: PromotionTextCopy | null;
  textCopies?: PromotionTextEntry[];
}): PromotionTextEntry[] {
  if (Array.isArray(row.textCopies)) {
    const entries = row.textCopies.filter(isPromotionTextEntry).filter((e) => e.copy.body.trim());
    if (entries.length > 0) return entries;
  }
  if (row.textCopy?.body?.trim()) {
    const now = new Date().toISOString();
    return [{ id: makePromotionTextEntryId(), title: "", copy: row.textCopy, createdAt: now, updatedAt: now }];
  }
  return [];
}

/** Keep legacy `textCopy` in sync with the newest entry for older clients. */
export function primaryPromotionTextCopy(entries: PromotionTextEntry[]): PromotionTextCopy | null {
  return entries[0]?.copy ?? null;
}

/** Parse a manually edited plain-text block back into structured copy. */
export function promotionTextFromPlain(plain: string, base: PromotionTextCopy): PromotionTextCopy {
  const trimmed = plain.trim();
  if (!trimmed) return { ...base, hook: "", body: "", ctaLine: "", hashtags: "", subjectLine: undefined };

  if (base.format === "email_blast") {
    const lines = trimmed.split(/\r?\n/);
    if (lines[0]?.startsWith("Subject:")) {
      const subjectLine = lines[0].replace(/^Subject:\s*/, "").trim();
      const body = lines.slice(1).join("\n").trim();
      return { ...base, subjectLine, hook: "", body, ctaLine: "", hashtags: "" };
    }
  }

  const hashtagMatch = trimmed.match(/((?:#\w+\s*)+)$/);
  const hashtags = base.format === "instagram_caption" && hashtagMatch ? hashtagMatch[1]!.trim() : "";
  const withoutTags = hashtags ? trimmed.slice(0, trimmed.length - hashtagMatch![0]!.length).trim() : trimmed;
  const paragraphs = withoutTags.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);

  if (paragraphs.length <= 1) {
    return { ...base, hook: "", body: withoutTags, ctaLine: "", hashtags };
  }

  const hook = paragraphs[0] ?? "";
  const ctaLine = paragraphs.length > 2 ? (paragraphs[paragraphs.length - 1] ?? "") : "";
  const bodyParts = paragraphs.slice(1, ctaLine ? -1 : undefined);
  return {
    ...base,
    hook,
    body: bodyParts.join("\n\n"),
    ctaLine,
    hashtags,
    subjectLine: base.format === "email_blast" ? base.subjectLine : undefined,
  };
}

export const PROMOTION_TEXT_FORMAT_OPTIONS: {
  id: PromotionTextFormat;
  label: string;
  description: string;
}[] = [
  {
    id: "instagram_caption",
    label: "Instagram caption",
    description: "Short, visual hook with emojis-friendly lines and hashtags.",
  },
  {
    id: "facebook_post",
    label: "Facebook post",
    description: "Conversational post with room for detail and a clear CTA.",
  },
  {
    id: "listing_blurb",
    label: "Listing blurb",
    description: "Polished paragraph for Zillow, Craigslist, or your website.",
  },
  {
    id: "email_blast",
    label: "Email blast",
    description: "Subject line plus scannable body for prospects on your list.",
  },
  {
    id: "sms",
    label: "SMS / text",
    description: "Brief message under 320 characters with one clear next step.",
  },
];

export const PROMOTION_TEXT_FORMAT_DEFAULT: PromotionTextFormat = "listing_blurb";

const FORMAT_PROMPTS: Record<PromotionTextFormat, string> = {
  instagram_caption:
    "Write an Instagram caption: 2–4 short lines, energetic but professional, end with 3–6 relevant hashtags (no #fairhousing violations).",
  facebook_post:
    "Write a Facebook rental post: friendly opening, 2 short paragraphs, bullet amenities if helpful, end with a clear CTA line.",
  listing_blurb:
    "Write a listing description: one strong opening sentence, 2 paragraphs describing the home and neighborhood, fair-housing safe.",
  email_blast:
    "Write an email blast: compelling subject line (<=10 words) plus body with greeting, value props, and CTA. Keep it scannable.",
  sms:
    "Write a single SMS under 300 characters: property + price if given + one CTA. No hashtags.",
};

export function promotionTextFormatPrompt(format: PromotionTextFormat): string {
  return FORMAT_PROMPTS[format] ?? FORMAT_PROMPTS.listing_blurb;
}

export function normalizePromotionTextFormat(raw: unknown): PromotionTextFormat {
  const id = String(raw ?? "").trim() as PromotionTextFormat;
  return PROMOTION_TEXT_FORMAT_OPTIONS.some((o) => o.id === id) ? id : PROMOTION_TEXT_FORMAT_DEFAULT;
}

export function composeFallbackPromotionText(
  inputs: PromotionInputs,
  propertyLabel: string,
  format: PromotionTextFormat,
): PromotionTextCopy {
  const flyer = composeFallbackFlyerCopy(inputs, propertyLabel);
  const points = flyer.sellingPoints.slice(0, 4);
  const priceBit = inputs.price.trim() ? ` ${inputs.price.trim()}.` : "";
  const promoBit = inputs.promo.trim() ? ` ${inputs.promo.trim()}.` : "";
  const cta = inputs.cta.trim() || flyer.ctaText;
  const contact = inputs.contact.trim();
  const ctaLine = contact ? `${cta} — ${contact}` : cta;

  const hook = flyer.headline;
  const bodyParagraphs = [
    flyer.subheadline,
    points.length ? points.join(" · ") : "",
    promoBit.trim(),
  ]
    .filter(Boolean)
    .join("\n\n");

  const hashtags =
    format === "instagram_caption"
      ? "#ForRent #SeattleHousing #ApartmentLiving #NowLeasing"
      : "";

  const base: PromotionTextCopy = {
    format,
    hook,
    body: bodyParagraphs,
    hashtags,
    ctaLine,
  };

  if (format === "email_blast") {
    return {
      ...base,
      subjectLine: `Now leasing${propertyLabel ? `: ${propertyLabel}` : ""}${priceBit ? ` — ${inputs.price.trim()}` : ""}`.slice(
        0,
        80,
      ),
      body: `Hi there,\n\n${flyer.subheadline}${priceBit}${promoBit}\n\n${points.map((p) => `• ${p}`).join("\n")}\n\n${ctaLine}`,
    };
  }

  if (format === "sms") {
    const sms = `${hook}${priceBit}${promoBit} ${ctaLine}`.replace(/\s+/g, " ").trim().slice(0, 300);
    return { ...base, hook: "", body: sms, hashtags: "", ctaLine: "" };
  }

  if (format === "facebook_post") {
    return {
      ...base,
      body: `${flyer.subheadline}${priceBit}${promoBit}\n\n${points.map((p) => `✓ ${p}`).join("\n")}`,
    };
  }

  if (format === "instagram_caption") {
    return {
      ...base,
      body: `${flyer.subheadline}${priceBit}\n${points.slice(0, 3).join("\n")}${promoBit}`,
    };
  }

  // listing_blurb — prefer house overview and concrete facts over generic filler
  const overview = inputs.customDetails.trim();
  const name = propertyLabel.split(" — ")[0]?.trim() || propertyLabel.trim();
  const locationBit = [inputs.address.trim(), name].filter(Boolean).join(" · ");
  const hookLine =
    name && overview
      ? `Welcome to ${name}.`
      : name
        ? `Now leasing at ${name}.`
        : hook;
  const bodyCore = overview
    ? overview
    : `${flyer.subheadline}${priceBit}${promoBit}`.trim();
  const amenityBit = points.length ? points.join(". ") + "." : "";
  return {
    ...base,
    hook: hookLine,
    body: [bodyCore, amenityBit, locationBit ? `Located in ${locationBit}.` : ""].filter(Boolean).join("\n\n"),
  };
}

/** Flatten generated text for clipboard / preview. */
export function formatPromotionTextPlain(copy: PromotionTextCopy): string {
  const parts: string[] = [];
  if (copy.subjectLine?.trim()) parts.push(`Subject: ${copy.subjectLine.trim()}`, "");
  if (copy.hook.trim()) parts.push(copy.hook.trim());
  if (copy.body.trim()) parts.push(copy.body.trim());
  if (copy.ctaLine.trim()) parts.push(copy.ctaLine.trim());
  if (copy.hashtags.trim()) parts.push(copy.hashtags.trim());
  return parts.join("\n\n").trim();
}

export function sellingPointsPreview(inputs: PromotionInputs): string[] {
  return parseSellingPoints(
    inputs.sellingPoints.trim() ? inputs.sellingPoints : inputs.customDetails,
  );
}
