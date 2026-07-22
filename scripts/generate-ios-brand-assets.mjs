#!/usr/bin/env node
/**
 * Generate the PropLane native-app icon + splash from the canonical paper-plane
 * mark, and write them straight into the iOS asset catalog.
 *
 * Source of truth for the glyph is the web brand mark in
 * src/components/brand/axis-logo.tsx (the same two SVG paths — plane body +
 * fold line — are reproduced below). Palette is the PropLane steel/blue from
 * src/app/globals.css (--pl-blue* + --steel-light) and the dark app background
 * (#080b14, matching capacitor.config.ts SplashScreen.backgroundColor).
 *
 * Writes:
 *   resources/icon.png    1024x1024  full-bleed steel/blue gradient + white plane
 *   resources/splash.png  2732x2732  dark bg + centered brand tile + white plane
 *   ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png   (1024, the marketing icon)
 *   ios/App/App/Assets.xcassets/Splash.imageset/splash-2732.png + Contents.json
 *
 * resources/{icon,splash}.png stay the @capacitor/assets sources (see
 * docs/mobile-app.md) so a future `npx @capacitor/assets generate` reproduces
 * every derived size from these two files.
 *
 * Run: node scripts/generate-ios-brand-assets.mjs   (sharp is a repo dependency)
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// --- PropLane palette (src/app/globals.css) --------------------------------
const BLUE_SOFT = "#5a8cff"; // --pl-blue-soft
const BLUE = "#2f6bff"; // --pl-blue
const BLUE_DEEP = "#1e4fd6"; // --pl-blue-deep
const APP_DARK = "#080b14"; // capacitor.config.ts backgroundColor

// The paper-plane mark from axis-logo.tsx, in its native 0..26 design units.
// Body is a filled quadrilateral; the fold line runs tip→notch like the web mark.
const PLANE_BODY = "M3.5 11.9L22.5 3.9L15.4 22.4L11.3 14.6Z";
const PLANE_FOLD = "M11.3 14.6L22.5 3.9";
const GLYPH_CX = 13; // bbox centre of the mark within its 26-unit box
const GLYPH_CY = 13.15;

/**
 * Emit the mark centred at (cx,cy) in canvas px, scaled so the glyph's design
 * units map through `unit` px each. White body with rounded joins + a deep-blue
 * fold crease, so it reads as a folded plane at any size.
 */
function planeGroup(cx, cy, unit) {
  return `
    <g transform="translate(${cx},${cy}) scale(${unit}) translate(${-GLYPH_CX},${-GLYPH_CY})">
      <path d="${PLANE_BODY}" fill="#ffffff" stroke="#ffffff" stroke-width="2.1"
            stroke-linejoin="round" stroke-linecap="round" />
      <path d="${PLANE_FOLD}" fill="none" stroke="${BLUE_DEEP}" stroke-width="1.7"
            stroke-linecap="round" />
    </g>`;
}

function iconSvg() {
  const S = 1024;
  return `<svg width="${S}" height="${S}" viewBox="0 0 ${S} ${S}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="${S}" y2="${S}" gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="${BLUE_SOFT}" />
        <stop offset="0.55" stop-color="${BLUE}" />
        <stop offset="1" stop-color="${BLUE_DEEP}" />
      </linearGradient>
    </defs>
    <rect width="${S}" height="${S}" fill="url(#bg)" />
    ${planeGroup(S / 2, S / 2, 27)}
  </svg>`;
}

function splashSvg() {
  const S = 2732;
  const tile = 900;
  const tileX = (S - tile) / 2;
  return `<svg width="${S}" height="${S}" viewBox="0 0 ${S} ${S}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="tile" x1="${tileX}" y1="${tileX}" x2="${tileX + tile}" y2="${tileX + tile}" gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="${BLUE_SOFT}" />
        <stop offset="0.55" stop-color="${BLUE}" />
        <stop offset="1" stop-color="${BLUE_DEEP}" />
      </linearGradient>
    </defs>
    <rect width="${S}" height="${S}" fill="${APP_DARK}" />
    <rect x="${tileX}" y="${tileX}" width="${tile}" height="${tile}" rx="215" fill="url(#tile)" />
    ${planeGroup(S / 2, S / 2, 26)}
  </svg>`;
}

/**
 * Both canvases are fully opaque by construction, so `flatten` is a no-op on
 * pixel values — it exists to drop the alpha channel, which App Store Connect
 * rejects on the marketing icon (ITMS-90717). The encoder then writes RGB
 * (PNG colour type 2) rather than RGBA (colour type 6).
 */
async function png(svg, size, out, background) {
  mkdirSync(dirname(out), { recursive: true });
  await sharp(Buffer.from(svg)).resize(size, size).flatten({ background }).png().toFile(out);
  const { channels, hasAlpha } = await sharp(out).metadata();
  if (hasAlpha || channels !== 3) {
    throw new Error(`${out} kept an alpha channel (channels=${channels}, hasAlpha=${hasAlpha})`);
  }
  console.log(`  wrote ${out.replace(`${ROOT}/`, "")} (${size}x${size}, opaque RGB)`);
}

const SPLASH_CONTENTS = {
  images: ["1x", "2x", "3x"].map((scale) => ({
    idiom: "universal",
    filename: "splash-2732.png",
    scale,
  })),
  info: { author: "xcode", version: 1 },
};

async function main() {
  const appicon = join(ROOT, "ios/App/App/Assets.xcassets/AppIcon.appiconset");
  const splashset = join(ROOT, "ios/App/App/Assets.xcassets/Splash.imageset");

  console.log("Generating PropLane iOS brand assets:");
  // Sources for @capacitor/assets (docs/mobile-app.md).
  await png(iconSvg(), 1024, join(ROOT, "resources/icon.png"), BLUE);
  await png(splashSvg(), 2732, join(ROOT, "resources/splash.png"), APP_DARK);
  // The shipped iOS marketing icon (AppIcon.appiconset references this file).
  await png(iconSvg(), 1024, join(appicon, "AppIcon-512@2x.png"), BLUE);
  // Launch-screen image referenced by Base.lproj/LaunchScreen.storyboard ("Splash").
  await png(splashSvg(), 2732, join(splashset, "splash-2732.png"), APP_DARK);
  writeFileSync(join(splashset, "Contents.json"), `${JSON.stringify(SPLASH_CONTENTS, null, 2)}\n`);
  console.log(`  wrote ${join(splashset, "Contents.json").replace(`${ROOT}/`, "")}`);
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
