#!/usr/bin/env node
/**
 * Generate every raster surface of the PropLane mark (favicon, PWA icons,
 * iOS app icon + splash, the PDF export logo) from one canonical geometry,
 * and write them straight into their asset locations.
 *
 * Source of truth for the geometry is src/lib/brand/proplane-mark.ts (a
 * rounded house/chevron outline with a crossing X, single-colour line art).
 * This script is plain Node ESM (no TypeScript loader), so it re-declares
 * the same literal path strings below — tests/unit/proplane-mark.test.ts
 * asserts this file's source text still contains every path from that
 * module, so an edit to one without the other fails the suite instead of
 * drifting silently. The checked-in reference SVG is public/brand/proplane-mark.svg.
 *
 * Writes:
 *   src/app/favicon.ico                                                  32x32 rounded tile + mark, multi-res ICO
 *   icons/icon-{48,72,96,128,192,256,512}.webp                           legacy PWA manifest icon set (public/manifest.webmanifest)
 *   resources/icon.png    1024x1024  opaque white tile + blue mark — the `@capacitor/assets` source
 *   resources/splash.png  2732x2732  dark bg + centered white tile + blue mark
 *   ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png     (1024, the marketing icon)
 *   ios/App/App/Assets.xcassets/Splash.imageset/splash-2732.png + Contents.json
 *   src/lib/reports/export/assets/axis-logo-mark.png                     transparent PNG embedded in exported PDFs
 *
 * resources/{icon,splash}.png stay the @capacitor/assets sources (see
 * docs/mobile-app.md) so a future `npx @capacitor/assets generate` reproduces
 * every derived size from these two files.
 *
 * Run: node scripts/generate-brand-assets.mjs   (sharp is a repo devDependency)
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// --- PropLane palette (src/app/globals.css) --------------------------------
const BLUE = "#2f6bff"; // --pl-blue
const APP_DARK = "#080b14"; // capacitor.config.ts backgroundColor
const WHITE = "#ffffff";

// The canonical PropLane mark from src/lib/brand/proplane-mark.ts, in its
// native 0..512 design units. Rounded house/chevron outline + crossing X,
// stroke only, no fill.
const MARK_VIEWBOX = 512;
const MARK_STROKE_WIDTH = 44;
const MARK_PATHS = [
  "M 84 452 L 84 218 a 54 54 0 0 1 21 -43 L 233 79 a 38 38 0 0 1 46 0 L 407 175 a 54 54 0 0 1 21 43 L 428 452",
  "M 170 288 L 342 452",
  "M 342 288 L 170 452",
];
// The mark's own bbox sits close to the centre of its 512-unit viewBox, so a
// straight translate+scale of the viewBox centre lands the glyph centred.
const GLYPH_CX = MARK_VIEWBOX / 2;
const GLYPH_CY = MARK_VIEWBOX / 2;

/**
 * Emit the mark centred at (cx,cy) in canvas px, scaled so the glyph's
 * 512-unit design space maps through `unit` px per unit. `unit` also scales
 * the stroke width automatically (SVG transforms scale strokes), keeping the
 * line weight proportional at every output size.
 */
function markGroup(cx, cy, unit, color = BLUE) {
  const paths = MARK_PATHS.map((d) => `<path d="${d}" />`).join("\n      ");
  return `
    <g transform="translate(${cx},${cy}) scale(${unit}) translate(${-GLYPH_CX},${-GLYPH_CY})"
       fill="none" stroke="${color}" stroke-width="${MARK_STROKE_WIDTH}" stroke-linecap="round" stroke-linejoin="round">
      ${paths}
    </g>`;
}

/** Full-bleed opaque tile: solid background + centred mark, sized so the glyph fills ~62% of the canvas. */
function tileSvg(size, { bg, radius = 0 } = {}) {
  const unit = (size * 0.62) / MARK_VIEWBOX;
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${size}" height="${size}" rx="${radius}" fill="${bg}" />
    ${markGroup(size / 2, size / 2, unit)}
  </svg>`;
}

/** Dark app background + a centered light rounded tile carrying the mark (splash screen). */
function splashSvg(size) {
  const tile = size * (900 / 2732);
  const tileX = (size - tile) / 2;
  const unit = (tile * 0.58) / MARK_VIEWBOX;
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${size}" height="${size}" fill="${APP_DARK}" />
    <rect x="${tileX}" y="${tileX}" width="${tile}" height="${tile}" rx="${tile * 0.24}" fill="${WHITE}" />
    ${markGroup(size / 2, size / 2, unit)}
  </svg>`;
}

/** Mark only, transparent background — for contexts that already provide their own backdrop (PDF page, favicon tile). */
function transparentMarkSvg(size, padFraction = 0.62) {
  const unit = (size * padFraction) / MARK_VIEWBOX;
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
    ${markGroup(size / 2, size / 2, unit)}
  </svg>`;
}

/**
 * Both `tileSvg`/`splashSvg` canvases are fully opaque by construction, so
 * `flatten` is a no-op on pixel values — it exists to drop the alpha channel,
 * which App Store Connect rejects on the marketing icon (ITMS-90717). The
 * encoder then writes RGB (PNG colour type 2) rather than RGBA (colour type 6).
 */
async function opaquePng(svg, size, out, background) {
  mkdirSync(dirname(out), { recursive: true });
  await sharp(Buffer.from(svg)).resize(size, size).flatten({ background }).png().toFile(out);
  const { channels, hasAlpha } = await sharp(out).metadata();
  if (hasAlpha || channels !== 3) {
    throw new Error(`${out} kept an alpha channel (channels=${channels}, hasAlpha=${hasAlpha})`);
  }
  console.log(`  wrote ${out.replace(`${ROOT}/`, "")} (${size}x${size}, opaque RGB)`);
}

async function transparentPng(svg, size, out) {
  mkdirSync(dirname(out), { recursive: true });
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(out);
  console.log(`  wrote ${out.replace(`${ROOT}/`, "")} (${size}x${size}, transparent RGBA)`);
}

/**
 * Build a valid .ico from PNG buffers. Small sizes are packed as classic
 * uncompressed 32bpp BMP/DIB entries (maximum viewer compatibility); the
 * largest entry keeps its PNG compression (Vista+ ICOs support this) so a
 * 256x256 entry doesn't balloon the file to a quarter-megabyte of raw pixels
 * the way a naive all-BMP packer would.
 */
async function buildIco(entries) {
  const dirSize = 16;
  const parts = [];
  for (const { size, png } of entries) {
    if (size >= 256) {
      parts.push({ size, data: png });
      continue;
    }
    const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const { width, height } = info;
    const rowBytes = width * 4;
    const dib = Buffer.alloc(rowBytes * height);
    for (let y = 0; y < height; y++) {
      const srcRow = y * rowBytes;
      const dstRow = (height - 1 - y) * rowBytes; // BMP rows are bottom-up
      for (let x = 0; x < rowBytes; x += 4) {
        const so = srcRow + x;
        const dOff = dstRow + x;
        dib[dOff] = data[so + 2]; // B
        dib[dOff + 1] = data[so + 1]; // G
        dib[dOff + 2] = data[so]; // R
        dib[dOff + 3] = data[so + 3]; // A
      }
    }
    const header = Buffer.alloc(40);
    header.writeUInt32LE(40, 0);
    header.writeInt32LE(width, 4);
    header.writeInt32LE(height * 2, 8); // doubled height = legacy AND-mask convention
    header.writeUInt16LE(1, 12);
    header.writeUInt16LE(32, 14);
    parts.push({ size, data: Buffer.concat([header, dib]) });
  }

  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(parts.length, 4);

  const dirs = [];
  const datas = [];
  let offset = 6 + dirSize * parts.length;
  for (const part of parts) {
    const dir = Buffer.alloc(dirSize);
    const wh = part.size === 256 ? 0 : part.size;
    dir.writeUInt8(wh, 0);
    dir.writeUInt8(wh, 1);
    dir.writeUInt16LE(1, 4);
    dir.writeUInt16LE(32, 6);
    dir.writeUInt32LE(part.data.length, 8);
    dir.writeUInt32LE(offset, 12);
    dirs.push(dir);
    datas.push(part.data);
    offset += part.data.length;
  }
  return Buffer.concat([header, ...dirs, ...datas]);
}

const SPLASH_CONTENTS = {
  images: ["1x", "2x", "3x"].map((scale) => ({
    idiom: "universal",
    filename: "splash-2732.png",
    scale,
  })),
  info: { author: "xcode", version: 1 },
};

// PWA-style icon set referenced by public/manifest.webmanifest — kept .webp
// extension to match the existing manifest entries, though the bytes written
// are PNG (as the previous "AX" lettermark set also was).
const PWA_ICON_SIZES = [48, 72, 96, 128, 192, 256, 512];

async function main() {
  const appicon = join(ROOT, "ios/App/App/Assets.xcassets/AppIcon.appiconset");
  const splashset = join(ROOT, "ios/App/App/Assets.xcassets/Splash.imageset");

  console.log("Generating PropLane brand assets from the canonical mark:");

  // --- Favicon (32x32 rounded tile, embedded in an .ico container) --------
  const faviconSvg = tileSvg(256, { bg: WHITE, radius: 256 * (9 / 32) });
  const faviconEntries = await Promise.all(
    [16, 32, 48, 256].map(async (size) => ({
      size,
      png: await sharp(Buffer.from(faviconSvg)).resize(size, size).png().toBuffer(),
    })),
  );
  const icoBuffer = await buildIco(faviconEntries);
  const favicoPath = join(ROOT, "src/app/favicon.ico");
  writeFileSync(favicoPath, icoBuffer);
  console.log(
    `  wrote ${favicoPath.replace(`${ROOT}/`, "")} (${icoBuffer.length} bytes: 16/32/48 BMP + 256 PNG entries)`,
  );

  // --- PWA manifest icon set (public/manifest.webmanifest) ----------------
  for (const size of PWA_ICON_SIZES) {
    const svg = tileSvg(size, { bg: WHITE, radius: size * (9 / 32) });
    await opaquePng(svg, size, join(ROOT, `icons/icon-${size}.webp`), WHITE);
  }

  // --- Capacitor asset sources + iOS app icon / splash ---------------------
  await opaquePng(tileSvg(1024, { bg: WHITE }), 1024, join(ROOT, "resources/icon.png"), WHITE);
  await opaquePng(splashSvg(2732), 2732, join(ROOT, "resources/splash.png"), APP_DARK);
  await opaquePng(tileSvg(1024, { bg: WHITE }), 1024, join(appicon, "AppIcon-512@2x.png"), WHITE);
  await opaquePng(splashSvg(2732), 2732, join(splashset, "splash-2732.png"), APP_DARK);
  writeFileSync(join(splashset, "Contents.json"), `${JSON.stringify(SPLASH_CONTENTS, null, 2)}\n`);
  console.log(`  wrote ${join(splashset, "Contents.json").replace(`${ROOT}/`, "")}`);

  // --- PDF export logo (transparent, drawn directly on the white page) ----
  await transparentPng(
    transparentMarkSvg(256, 0.86),
    256,
    join(ROOT, "src/lib/reports/export/assets/axis-logo-mark.png"),
  );

  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
