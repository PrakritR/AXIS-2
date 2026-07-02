/**
 * Shared promotion / flyer model + on-brand HTML flyer renderer.
 *
 * Framework-agnostic (no `window`, no React) so it is importable from the client
 * store, the server generation route, and the flyer preview component. The flyer
 * is rendered as a self-contained HTML document (inlined CSS, Axis brand tokens)
 * so it can be shown in an isolated <iframe>, printed, or saved to PDF via the
 * browser with no image-generation API and no extra dependency.
 */

export type PromotionTheme = "cobalt" | "sunset" | "forest" | "slate";

export type PromotionStatus = "draft" | "generated";

/** Raw inputs the manager sets in the form (untrusted free text). */
export type PromotionInputs = {
  headline: string;
  /** Newline- or comma-separated key selling points / amenities. */
  sellingPoints: string;
  price: string;
  /** Promo offer, e.g. "First month free". */
  promo: string;
  /** Call to action, e.g. "Book a tour today". */
  cta: string;
  /** Contact line, e.g. "leasing@axis.com · (206) 555-0142". */
  contact: string;
  /** Copy tone, e.g. "Warm & welcoming". */
  tone: string;
};

/** AI-composed (or fallback-composed) flyer copy. Facts stay from inputs. */
export type FlyerCopy = {
  headline: string;
  subheadline: string;
  sellingPoints: string[];
  promoLine: string;
  ctaText: string;
  closingLine: string;
};

export type ManagerPromotionRow = {
  id: string;
  managerUserId: string | null;
  propertyId: string | null;
  /** Denormalized property/listing label for the table + flyer. */
  propertyLabel: string;
  /** Short promotion title (table column). */
  title: string;
  theme: PromotionTheme;
  status: PromotionStatus;
  inputs: PromotionInputs;
  /** null until copy has been generated. */
  copy: FlyerCopy | null;
  createdAt: string;
  updatedAt: string;
};

export const PROMOTION_THEME_OPTIONS: { id: PromotionTheme; label: string }[] = [
  { id: "cobalt", label: "Axis Cobalt" },
  { id: "sunset", label: "Sunset" },
  { id: "forest", label: "Forest" },
  { id: "slate", label: "Slate" },
];

export const PROMOTION_TONE_OPTIONS = [
  "Warm & welcoming",
  "Modern & upscale",
  "Bold & energetic",
  "Calm & professional",
];

type ThemePalette = { from: string; to: string; accent: string; ink: string };

const THEME_PALETTES: Record<PromotionTheme, ThemePalette> = {
  // Axis brand gradient (globals.css --btn-primary).
  cobalt: { from: "#2f6bff", to: "#5a8cff", accent: "#1e4fd6", ink: "#0b1b3a" },
  sunset: { from: "#ff7a45", to: "#ff4d6d", accent: "#d6303f", ink: "#3a0b16" },
  forest: { from: "#0e7c66", to: "#16a34a", accent: "#0b5d4a", ink: "#052117" },
  slate: { from: "#0b1b3a", to: "#334155", accent: "#1e293b", ink: "#0b1b3a" },
};

export function paletteForTheme(theme: PromotionTheme): ThemePalette {
  return THEME_PALETTES[theme] ?? THEME_PALETTES.cobalt;
}

/** Split the raw selling-points textarea into clean bullet strings. */
export function parseSellingPoints(raw: string): string[] {
  return raw
    .split(/\r?\n|·|•|;|,/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 6);
}

/**
 * Deterministic fallback copy composer used when the AI route is unavailable
 * (demo sandbox, offline, or missing ANTHROPIC_API_KEY). Never invents facts —
 * it only reshapes the manager-provided inputs into flyer-ready copy.
 */
export function composeFallbackFlyerCopy(inputs: PromotionInputs, propertyLabel: string): FlyerCopy {
  const points = parseSellingPoints(inputs.sellingPoints);
  const headline = inputs.headline.trim() || (propertyLabel ? `Now Leasing — ${propertyLabel}` : "Now Leasing");
  const subParts: string[] = [];
  if (propertyLabel) subParts.push(propertyLabel);
  if (inputs.price.trim()) subParts.push(inputs.price.trim());
  const subheadline = subParts.join(" · ") || "Your next home is ready";
  const promoLine = inputs.promo.trim();
  const ctaText = inputs.cta.trim() || "Schedule a tour today";
  const closingLine = inputs.contact.trim()
    ? `Contact us: ${inputs.contact.trim()}`
    : "Contact the leasing team to learn more.";
  return {
    headline,
    subheadline,
    sellingPoints: points.length ? points : ["Freshly maintained and move-in ready", "Great location", "Responsive management"],
    promoLine,
    ctaText,
    closingLine,
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Render a promotion as a standalone, print-ready HTML document (Letter portrait).
 * Falls back to composed copy when `row.copy` is null so a preview always renders.
 */
export function buildFlyerHtml(row: ManagerPromotionRow): string {
  const palette = paletteForTheme(row.theme);
  const copy = row.copy ?? composeFallbackFlyerCopy(row.inputs, row.propertyLabel);
  const bullets = copy.sellingPoints
    .map(
      (point) =>
        `<li><span class="dot" aria-hidden="true"></span><span>${escapeHtml(point)}</span></li>`,
    )
    .join("");
  const promoBadge = copy.promoLine
    ? `<div class="promo">${escapeHtml(copy.promoLine)}</div>`
    : "";
  const price = row.inputs.price.trim()
    ? `<div class="price">${escapeHtml(row.inputs.price.trim())}</div>`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(copy.headline)}</title>
<style>
  @page { size: letter portrait; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: ${palette.ink};
    background: #eef2fb;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .sheet {
    width: 8.5in;
    min-height: 11in;
    margin: 0 auto;
    background: #ffffff;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .hero {
    position: relative;
    padding: 0.85in 0.8in 0.7in;
    color: #ffffff;
    background: linear-gradient(135deg, ${palette.from}, ${palette.to});
  }
  .eyebrow { font-size: 13px; font-weight: 700; letter-spacing: 0.22em; text-transform: uppercase; opacity: 0.9; }
  .headline { margin: 14px 0 0; font-size: 48px; line-height: 1.05; font-weight: 800; letter-spacing: -0.02em; }
  .subheadline { margin: 14px 0 0; font-size: 20px; font-weight: 500; opacity: 0.95; }
  .promo {
    display: inline-block; margin-top: 22px; padding: 10px 18px; border-radius: 999px;
    background: rgba(255,255,255,0.18); border: 1.5px solid rgba(255,255,255,0.55);
    font-size: 16px; font-weight: 700; letter-spacing: 0.01em;
  }
  .body { padding: 0.6in 0.8in 0.5in; display: flex; flex-direction: column; gap: 26px; flex: 1; }
  .points { list-style: none; margin: 0; padding: 0; display: grid; gap: 14px; }
  .points li { display: flex; align-items: flex-start; gap: 12px; font-size: 18px; font-weight: 500; line-height: 1.35; }
  .dot { margin-top: 8px; width: 9px; height: 9px; border-radius: 999px; background: ${palette.accent}; flex: 0 0 auto; }
  .price { font-size: 30px; font-weight: 800; color: ${palette.accent}; letter-spacing: -0.01em; }
  .cta {
    margin-top: auto; padding: 22px 26px; border-radius: 18px; background: ${palette.ink};
    color: #ffffff; display: flex; flex-direction: column; gap: 6px;
  }
  .cta-text { font-size: 24px; font-weight: 800; letter-spacing: -0.01em; }
  .cta-closing { font-size: 15px; font-weight: 500; opacity: 0.9; }
  .footer {
    padding: 16px 0.8in; border-top: 1px solid #e2e8f5; display: flex; justify-content: space-between;
    align-items: center; font-size: 12px; color: #64748b;
  }
  .footer strong { color: ${palette.accent}; }
</style>
</head>
<body>
  <div class="sheet">
    <div class="hero">
      <div class="eyebrow">${escapeHtml(row.propertyLabel || "Now Leasing")}</div>
      <h1 class="headline">${escapeHtml(copy.headline)}</h1>
      <p class="subheadline">${escapeHtml(copy.subheadline)}</p>
      ${promoBadge}
    </div>
    <div class="body">
      <ul class="points">${bullets}</ul>
      ${price}
      <div class="cta">
        <div class="cta-text">${escapeHtml(copy.ctaText)}</div>
        <div class="cta-closing">${escapeHtml(copy.closingLine)}</div>
      </div>
    </div>
    <div class="footer">
      <span>Marketing flyer</span>
      <span>Powered by <strong>Axis</strong></span>
    </div>
  </div>
</body>
</html>`;
}
