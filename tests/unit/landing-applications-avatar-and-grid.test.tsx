// @vitest-environment jsdom
//
// Covers the three homepage landing tweaks from user feedback:
//   1. Applicant initials render as prominent CIRCULAR brand-accent avatars.
//   2. The Applications demo box / rows / names are enlarged.
//   3. The blueprint square background is ONE size everywhere (a shared
//      `--lp-grid-size` token) and is a continuous motif across the flow-band
//      sections instead of appearing/disappearing between them.
//
// jsdom does not apply external stylesheets, so the CSS-rule assertions read the
// source files directly (same approach as landing-guide-art-theme-swap.test).
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { ApplicationsPipelinePanel } from "@/components/marketing/landing-applications-pipeline";

afterEach(cleanup);

beforeAll(() => {
  // The panel's autoplay hooks touch APIs jsdom lacks; stub them so it renders.
  if (!("IntersectionObserver" in globalThis)) {
    class IO {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    // @ts-expect-error minimal test stub
    globalThis.IntersectionObserver = IO;
  }
  if (!window.matchMedia) {
    // @ts-expect-error minimal test stub
    window.matchMedia = (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent() {
        return false;
      },
    });
  }
});

const read = (rel: string) => fs.readFileSync(path.resolve(__dirname, rel), "utf8");
const flat = (s: string) => s.replace(/\s+/g, " ");

const pipeCss = flat(read("../../src/components/marketing/landing-applications-pipeline.css"));
const proplaneCss = flat(read("../../src/components/marketing/landing-proplane.css"));
const globalsCss = flat(read("../../src/app/globals.css"));
const demoHeroTsx = read("../../src/components/marketing/landing-demo-hero.tsx");
const dashDemoTsx = read("../../src/components/marketing/landing-dashboard-chat-demo.tsx");
const ibxDemoTsx = read("../../src/components/marketing/landing-inbox-approve-demo.tsx");

describe("landing applications avatars", () => {
  it("renders each applicant's initials inside a circular avatar chip", () => {
    const { container } = render(<ApplicationsPipelinePanel />);
    const avatars = Array.from(container.querySelectorAll(".lp-pipe-avatar"));
    expect(avatars.length).toBeGreaterThan(0);
    // Every avatar shows two-letter uppercase initials (e.g. "MC", "PN", "DR").
    for (const avatar of avatars) {
      expect(avatar.textContent?.trim()).toMatch(/^[A-Z]{2}$/);
    }
  });

  it("styles the avatar as a filled brand-accent circle with white initials", () => {
    // Pull just the base `.lp-pipe-avatar { ... }` rule.
    const rule = pipeCss.match(/\.lp-pipe-avatar \{([^}]*)\}/)?.[1] ?? "";
    expect(rule).toContain("border-radius: 999px"); // circular
    expect(rule).toContain("var(--lp-pipe-accent)"); // brand-accent fill
    expect(rule).toContain("color: var(--pl-white)"); // high-contrast initials
    expect(rule).toContain("box-shadow"); // lifts off the row so it "pops"
  });
});

describe("landing applications demo is enlarged", () => {
  it("uses a larger avatar, name, and row than before", () => {
    expect(pipeCss).toMatch(/\.lp-pipe-avatar \{[^}]*width: 42px/);
    expect(pipeCss).toMatch(/\.lp-pipe-name \{[^}]*font-size: 15\.5px/);
    expect(pipeCss).toMatch(/\.lp-pipe-row \{[^}]*padding: 14px 16px/);
  });

  it("widens the applications panel column in the hero", () => {
    expect(demoHeroTsx).toContain("max-w-[524px]");
    expect(demoHeroTsx).not.toContain("max-w-[468px]");
  });
});

describe("landing blueprint grid is one consistent size", () => {
  it("defines a single shared --lp-grid-size token", () => {
    expect(globalsCss).toMatch(/:root \{[^}]*--lp-grid-size: 56px/);
  });

  it("drives the hero lattice from the shared token (no hard-coded pitch)", () => {
    expect(globalsCss).toContain("transparent 1px var(--lp-grid-size)");
    expect(globalsCss).not.toContain("transparent 1px 56px");
  });

  it("drives the blueprint grid from the shared token (no 24px square)", () => {
    expect(proplaneCss).toMatch(
      /\.lp-blueprint \{[^}]*background-size: var\(--lp-grid-size\) var\(--lp-grid-size\)/,
    );
    expect(proplaneCss).not.toContain("background-size: 24px 24px");
  });

  it("applies the blueprint as a continuous motif across the flow-band sections", () => {
    expect(dashDemoTsx).toContain("lp-dash-demo lp-blueprint");
    expect(ibxDemoTsx).toContain("lp-ibx-demo lp-blueprint");
    // The learn section keeps its blueprint class too.
    expect(read("../../src/components/marketing/landing-home-sections.tsx")).toContain(
      "lp-learn lp-blueprint",
    );
  });
});
