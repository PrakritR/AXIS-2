import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

// `<html>` is the document root, so nothing can contain it. A selector that puts
// `html[...]` in a descendant position therefore never matches anything, and the
// failure is silent — it breaks no build, no lint, and no unit test.
//
// That shipped a real visual defect: `[data-theme="dark"] html[data-portal-sticky-chrome]
// .portal-calendar-toolbar` left the sticky calendar toolbar painted
// `--portal-surface-light` in dark mode on every PortalCalendarPanels surface.
// Both attributes live on <html>, so it had to be a compound selector
// (`html[data-theme="dark"][data-portal-sticky-chrome]`). Only the dark-mode e2e
// spec caught it, and that job is skipped on every PR (see AGENTS.md).

// Discovered rather than listed, so a stylesheet added or renamed tomorrow is
// covered without anyone remembering to extend this file — the same silence the
// guard exists to break.
function findStylesheets(root: string): string[] {
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".css")) found.push(relative(root, full).split(sep).join("/"));
    }
  };
  walk(join(root, "src"));
  return found.sort();
}

const STYLESHEETS = findStylesheets(process.cwd());

function splitTopLevel(selector: string, separator: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const char of selector) {
    if (char === "(" || char === "[") depth += 1;
    else if (char === ")" || char === "]") depth -= 1;
    if (char === separator && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  parts.push(current);
  return parts;
}

function selectorsWithDescendantHtml(css: string): string[] {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const preludes: string[] = [];
  let buffer = "";
  for (const char of withoutComments) {
    if (char === "{") {
      preludes.push(buffer);
      buffer = "";
    } else if (char === "}" || char === ";") {
      buffer = "";
    } else {
      buffer += char;
    }
  }

  const offenders: string[] = [];
  for (const prelude of preludes) {
    const selectorList = prelude.trim();
    if (!selectorList || selectorList.startsWith("@")) continue;
    for (const complexSelector of splitTopLevel(selectorList, ",")) {
      const selector = complexSelector.trim().replace(/\s+/g, " ");
      if (!selector) continue;
      if (/[\s>+~]html\b/.test(selector)) offenders.push(selector);
    }
  }
  return offenders;
}

describe("stylesheet root-element selectors", () => {
  it("found stylesheets to check", () => {
    expect(STYLESHEETS.length, "no .css files found under src/ — the guard would pass vacuously").toBeGreaterThan(0);
  });

  for (const stylesheet of STYLESHEETS) {
    it(`never places html in a descendant position in ${stylesheet}`, () => {
      const css = readFileSync(join(process.cwd(), stylesheet), "utf8");
      const offenders = selectorsWithDescendantHtml(css);
      expect(
        offenders,
        `${stylesheet} has selector(s) matching nothing because <html> cannot be a descendant — ` +
          `make them compound (html[a][b]) instead:\n  ${offenders.join("\n  ")}`,
      ).toEqual([]);
    });
  }

  it("detects the sticky calendar toolbar selector this guard was written for", () => {
    const regressed = '[data-theme="dark"] html[data-portal-sticky-chrome] .portal-calendar-toolbar { color: red; }';
    expect(selectorsWithDescendantHtml(regressed)).toEqual([
      '[data-theme="dark"] html[data-portal-sticky-chrome] .portal-calendar-toolbar',
    ]);
  });

  it("accepts the compound form that actually matches", () => {
    const fixed = 'html[data-theme="dark"][data-portal-sticky-chrome] .portal-calendar-toolbar { color: red; }';
    expect(selectorsWithDescendantHtml(fixed)).toEqual([]);
  });
});
