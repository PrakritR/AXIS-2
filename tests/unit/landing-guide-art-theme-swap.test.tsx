// @vitest-environment jsdom
//
// The homepage "Learn how to manage your house" guide cards ship one screenshot
// per theme: a light portal mock and a dark one. The site defaults to
// `data-theme="dark"`, so the dark art must be the one shown there while the
// light art is hidden. The swap is pure CSS (no client JS) driven by
// `data-theme`, so this test checks two things:
//
//   1. Both the light AND dark webp for each guide are referenced in the DOM,
//      tagged with the light/dark toggle classes.
//   2. `landing-proplane.css` hides the light art and shows the dark art under
//      `[data-theme="dark"]` (jsdom does not apply the external stylesheet, so
//      the rule itself is asserted from source).
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { LearnSection } from "@/components/marketing/landing-home-sections";

afterEach(cleanup);

const CSS = fs.readFileSync(
  path.resolve(__dirname, "../../src/components/marketing/landing-proplane.css"),
  "utf8",
);

// Collapse whitespace so brittle formatting differences don't break matches.
const cssFlat = CSS.replace(/\s+/g, " ");

describe("homepage guide art light/dark swap", () => {
  it("references both the light and dark webp for each guide", () => {
    const { container } = render(<LearnSection />);
    const srcs = Array.from(container.querySelectorAll("img")).map((img) =>
      // next/image can rewrite src into an optimizer URL; assert on the encoded path.
      decodeURIComponent(img.getAttribute("src") ?? ""),
    );
    const joined = srcs.join(" ");

    for (const file of [
      "/marketing/guide-messages.webp",
      "/marketing/guide-messages-dark.webp",
      "/marketing/guide-tours.webp",
      "/marketing/guide-tours-dark.webp",
    ]) {
      expect(joined).toContain(file);
    }
  });

  it("tags each guide image with the matching light/dark toggle class", () => {
    const { container } = render(<LearnSection />);
    const lightImgs = container.querySelectorAll("img.lp-art-img-light");
    const darkImgs = container.querySelectorAll("img.lp-art-img-dark");
    // One light + one dark image per guide card (messages + tours).
    expect(lightImgs).toHaveLength(2);
    expect(darkImgs).toHaveLength(2);
  });

  it("hides the light art and shows the dark art under [data-theme=dark]", () => {
    // Default (light theme / no override): dark art is hidden.
    expect(cssFlat).toContain(".lp-art-img-dark { display: none; }");
    // Dark theme: light art hidden, dark art shown.
    expect(cssFlat).toContain('[data-theme="dark"] .lp-art-img-light { display: none; }');
    expect(cssFlat).toContain('[data-theme="dark"] .lp-art-img-dark { display: block; }');
  });

  it("gives the dark guide containers a purple-tinted near-black wash", () => {
    expect(cssFlat).toMatch(
      /\[data-theme="dark"\] \.lp-art-messages, \[data-theme="dark"\] \.lp-art-tours \{[^}]*--pl-purple/,
    );
  });
});
