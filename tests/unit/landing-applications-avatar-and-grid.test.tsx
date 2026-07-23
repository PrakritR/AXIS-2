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
const homeSectionsTsx = read("../../src/components/marketing/landing-home-sections.tsx");

// Scope every assertion to the one rule / element under test — a whole-file grep
// fails on unrelated future rules that legitimately reuse a value.
const avatarRule = pipeCss.match(/\.lp-pipe-avatar \{([^}]*)\}/)?.[1] ?? "";
const heroGridClass = demoHeroTsx.match(/className="(relative mx-auto grid[^"]*)"/)?.[1] ?? "";
const panelWrapClass =
  demoHeroTsx.match(/className="([^"]*)"\s*>\s*<ApplicationsPipelinePanel/)?.[1] ?? "";

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
    expect(avatarRule).toContain("border-radius: 999px"); // circular
    expect(avatarRule).toContain("var(--lp-pipe-avatar-fill)"); // brand-accent fill
    expect(avatarRule).toContain("color: var(--pl-white)"); // high-contrast initials
    expect(avatarRule).toContain("box-shadow"); // lifts off the row so it "pops"
  });

  it("builds the fill from the DEEP accent so white initials clear WCAG AA", () => {
    // --pl-accent alone is only ~3.4:1 against white in dark theme; the deep
    // accent clears 4.5:1 in both themes, and the highlight stop is capped so
    // the lightest part of the gradient clears it too.
    expect(avatarRule).toContain(
      "--lp-pipe-avatar-fill: color-mix(in srgb, var(--pl-accent-deep) 92%, black)",
    );
    const highlight = Number(
      avatarRule.match(/color-mix\(in srgb, var\(--lp-pipe-avatar-fill\) (\d+)%, white\)/)?.[1],
    );
    expect(highlight).toBeGreaterThanOrEqual(88);
  });
});

describe("landing applications demo is enlarged", () => {
  it("uses a larger avatar, name, and row than before", () => {
    expect(pipeCss).toMatch(/\.lp-pipe-avatar \{[^}]*width: 42px/);
    expect(pipeCss).toMatch(/\.lp-pipe-name \{[^}]*font-size: 15\.5px/);
    expect(pipeCss).toMatch(/\.lp-pipe-row \{[^}]*padding: 14px 16px/);
  });

  it("indents the expanded detail to the row's own content edge on mobile", () => {
    const mobileDetail = pipeCss.match(
      /@media \(max-width: 640px\) \{.*?\.lp-pipe-detail \{([^}]*)\}/,
    )?.[1];
    expect(mobileDetail).toContain("padding-left: 16px");
  });

  it("widens the applications panel column in the hero", () => {
    expect(panelWrapClass).toContain("max-w-[524px]");
    expect(panelWrapClass).not.toContain("max-w-[468px]");
  });

  it("gives the panel a hero grid track wide enough for that cap to bind", () => {
    // A `max-w` the track can never reach is a no-op; derive the track width
    // from the same tokens the markup declares.
    const containerMax = Number(heroGridClass.match(/max-w-\[(\d+)px\]/)?.[1]);
    const inlinePad = Number(heroGridClass.match(/sm:px-(\d+)/)?.[1]) * 4;
    const gap = Number(heroGridClass.match(/lg:gap-(\d+)/)?.[1]) * 4;
    const cols = heroGridClass.match(
      /lg:grid-cols-\[minmax\(0,([\d.]+)fr\)_minmax\(0,([\d.]+)fr\)\]/,
    );
    const leftFr = Number(cols?.[1]);
    const rightFr = Number(cols?.[2]);
    const panelMax = Number(panelWrapClass.match(/max-w-\[(\d+)px\]/)?.[1]);

    const freeSpace = containerMax - inlinePad * 2 - gap;
    const rightTrack = (freeSpace * rightFr) / (leftFr + rightFr);

    expect(panelMax).toBe(524);
    expect(rightTrack).toBeGreaterThanOrEqual(panelMax);
  });
});

describe("landing blueprint grid is one consistent size", () => {
  it("defines a single shared --lp-grid-size token", () => {
    expect(globalsCss).toMatch(/:root \{[^}]*--lp-grid-size: 56px/);
  });

  it("drives the hero lattice from the shared token (no hard-coded pitch)", () => {
    const rule = globalsCss.match(/\.landing-hero-grid \{([^}]*)\}/)?.[1] ?? "";
    expect(rule).toContain("transparent 1px var(--lp-grid-size)");
    expect(rule).not.toContain("transparent 1px 56px");
  });

  it("drives the blueprint grid from the shared token (no 24px square)", () => {
    const rule = proplaneCss.match(/\.lp-blueprint \{([^}]*)\}/)?.[1] ?? "";
    expect(rule).toContain("background-size: var(--lp-grid-size) var(--lp-grid-size)");
    expect(rule).not.toContain("background-size: 24px 24px");
  });

  it("paints the grid once on the flow-band wrapper, not per section", () => {
    // A per-section background restarts its tiling origin at each section's own
    // top edge, leaving an off-pitch row at every seam. One wrapper = one grid.
    expect(homeSectionsTsx).toContain('className="lp-flow-band lp-blueprint"');
    expect(homeSectionsTsx).toMatch(
      /lp-flow-band lp-blueprint[\s\S]*?<LandingDashboardChatDemo \/>[\s\S]*?<LandingInboxApproveDemo \/>[\s\S]*?<LearnSection \/>[\s\S]*?<\/div>/,
    );
    expect(dashDemoTsx).not.toContain("lp-blueprint");
    expect(ibxDemoTsx).not.toContain("lp-blueprint");
    expect(homeSectionsTsx).not.toContain("lp-learn lp-blueprint");
  });

  it("leaves the flow-band sections transparent so the one grid shows through", () => {
    for (const selector of ["\\.lp-dash-demo", "\\.lp-ibx-demo", "\\.lp-learn"]) {
      const rule = proplaneCss.match(new RegExp(`${selector} \\{([^}]*)\\}`))?.[1] ?? "";
      expect(rule).not.toContain("background: var(--lp-surface)");
    }
  });
});
