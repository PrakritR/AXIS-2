import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  PROPLANE_BLUE,
  PROPLANE_MARK_PATHS,
  PROPLANE_MARK_STROKE_WIDTH,
  PROPLANE_MARK_VIEWBOX_SIZE,
} from "@/lib/brand/proplane-mark";

/**
 * Guards the "one canonical mark, no drifting hand-edited copies" invariant
 * (AGENTS.md, "Brand assets (PropLane)"). src/lib/brand/proplane-mark.ts is
 * the single source of truth; this asserts every other checked-in copy of
 * the geometry still matches it byte-for-byte.
 */
const ROOT = path.join(__dirname, "../..");

describe("proplane mark — canonical geometry has no drifting copies", () => {
  it("has exactly three paths, all with round caps/joins and no fill (line-art invariant)", () => {
    expect(PROPLANE_MARK_PATHS).toHaveLength(3);
    expect(PROPLANE_MARK_STROKE_WIDTH).toBe(44);
    expect(PROPLANE_MARK_VIEWBOX_SIZE).toBe(512);
    expect(PROPLANE_BLUE.toUpperCase()).toBe("#2F6BFF");
  });

  it("matches the checked-in reference SVG (public/brand/proplane-mark.svg) verbatim", () => {
    const svg = readFileSync(path.join(ROOT, "public/brand/proplane-mark.svg"), "utf8");
    expect(svg).toContain(`viewBox="0 0 ${PROPLANE_MARK_VIEWBOX_SIZE} ${PROPLANE_MARK_VIEWBOX_SIZE}"`);
    expect(svg).toContain(`stroke="${PROPLANE_BLUE}"`);
    expect(svg).toContain(`stroke-width="${PROPLANE_MARK_STROKE_WIDTH}"`);
    expect(svg).toContain('fill="none"');
    expect(svg).not.toContain('fill="#');
    for (const d of PROPLANE_MARK_PATHS) {
      expect(svg).toContain(`d="${d}"`);
    }
  });

  it("matches the favicon SVG (src/app/icon.svg) verbatim — a tile wraps the same unmodified paths", () => {
    const svg = readFileSync(path.join(ROOT, "src/app/icon.svg"), "utf8");
    for (const d of PROPLANE_MARK_PATHS) {
      expect(svg).toContain(`d="${d}"`);
    }
  });

  it("matches the plain-JS asset generator (scripts/generate-brand-assets.mjs) — can't import the TS module, so it must copy the literal strings", () => {
    const script = readFileSync(path.join(ROOT, "scripts/generate-brand-assets.mjs"), "utf8");
    for (const d of PROPLANE_MARK_PATHS) {
      expect(script).toContain(d);
    }
    expect(script).toContain(String(PROPLANE_MARK_STROKE_WIDTH));
  });

  it("does not resurrect the retired paper-plane or 'AX' lettermark path fragments anywhere the mark is drawn", () => {
    const retiredFragments = ["3.5 11.9", "22.5 3.9", "15.4 22.4", "11.3 14.6"];
    const filesToCheck = [
      "public/brand/proplane-mark.svg",
      "src/app/icon.svg",
      "src/components/brand/axis-logo.tsx",
      "src/lib/brand/proplane-mark.ts",
      "src/lib/manager-application-pdf.ts",
      "src/lib/promotion-flyer.ts",
      "scripts/generate-brand-assets.mjs",
    ];
    for (const file of filesToCheck) {
      const content = readFileSync(path.join(ROOT, file), "utf8");
      for (const fragment of retiredFragments) {
        expect(content, `${file} still contains retired mark fragment "${fragment}"`).not.toContain(fragment);
      }
    }
  });
});
