// @vitest-environment jsdom
//
// `ManagerPortalPageShell` renders `PortalPageTitleBand` at EVERY breakpoint once
// `hideTitleOnMobileNav` + `titleAside` are set with no `filterRow` (the `useInlineTitleBand`
// path). So a section's header controls can reach a phone by exactly one of two shapes:
//
//   a) BAND-ONLY  — an ungated `titleAside`, no `PortalPageHeaderMobileActionsRow`.
//   b) SPLIT      — a `hidden md:flex` `titleAside` paired with an `md:hidden` mobile row.
//
// Mixing them draws the controls TWICE on mobile. That shipped to production as two
// overlapping "Apply to property" buttons on resident Applications and two "Schedule a tour"
// on resident Tour — the two most important CTAs in the resident journey.
//
// The opposite failure is worse: suppressing the mobile row on a SPLIT section leaves ZERO
// controls, because its band is display:none on phones. Both halves are asserted here.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ManagerPortalPageShell } from "@/components/portal/portal-metrics";
import { PortalPageHeaderMobileActionsRow } from "@/components/portal/portal-section-action-row";

vi.mock("@/hooks/use-is-native-app", () => ({ useNativeChrome: () => false }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/portal/applications",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

afterEach(cleanup);

const PORTAL_DIR = join(process.cwd(), "src/components/portal");

/**
 * Sections still on the SPLIT shape (b). Their `titleAside` is `hidden md:flex`, so the band
 * contributes nothing on a phone and the mobile row is the ONLY control there — deleting it
 * would leave the section with zero controls, not one.
 */
const SPLIT_SHAPE_PANELS = [
  "manager-finances-panel.tsx",
  "manager-documents-panel.tsx",
  "resident-documents-panel.tsx",
  "resident-lease-panel.tsx",
  "resident-payments-panel.tsx",
];

/**
 * A hand-rolled mobile row is identified by its `data-slot` alone, NOT by scanning the
 * className for `md:hidden`. Panels build that className however they like — a template
 * literal with an embedded ternary (`resident-payments-panel.tsx`) contains quotes, so any
 * `[^"]*` bridge from the class list to the attribute terminates early and the panel goes
 * invisible to this sweep. The slot name is the stable marker; a row that forgot `md:hidden`
 * duplicates at every breakpoint and should be caught here too.
 */
const RENDERS_MOBILE_ROW = /<PortalPageHeaderMobileActionsRow|data-slot="[a-z-]*mobile-actions"/;

/**
 * The gate has to be read off the `titleAside` the shell actually receives, never off the
 * file. A panel may hold any number of incidental `hidden … md:flex` blocks that have
 * nothing to do with its header — `manager-applications.tsx` has one on its detail-row
 * action group — and a file-wide scan treats each of them as proof the band is gated,
 * silently exempting the panel from the whole check.
 */
function skipStringLiteral(src: string, index: number): number {
  const quote = src[index];
  let i = index + 1;
  while (i < src.length && src[i] !== quote) {
    if (src[i] === "\\") i += 1;
    i += 1;
  }
  return i;
}

/** Text between the braces of `prefix{ … }`, honouring nesting and quotes. */
function readBracedExpression(src: string, prefix: string, from: number): { text: string; end: number } | null {
  const start = src.indexOf(prefix, from);
  if (start === -1) return null;
  let depth = 0;
  let i = start + prefix.length;
  for (; i < src.length; i += 1) {
    const char = src[i];
    if (char === '"' || char === "'" || char === "`") {
      i = skipStringLiteral(src, i);
      continue;
    }
    if (char === "{") depth += 1;
    else if (char === "}") {
      if (depth === 0) break;
      depth -= 1;
    }
  }
  return { text: src.slice(start + prefix.length, i), end: i };
}

/** The opening tag (`<Name … >`) whose props contain the character at `propIndex`. */
function enclosingOpeningTag(src: string, propIndex: number): { name: string; props: string } | null {
  let start = -1;
  for (let i = propIndex; i >= 0; i -= 1) {
    if (src[i] === ">") break;
    if (src[i] === "<" && /[A-Za-z]/.test(src[i + 1] ?? "")) {
      start = i;
      break;
    }
  }
  if (start === -1) return null;
  let depth = 0;
  let i = start + 1;
  for (; i < src.length; i += 1) {
    const char = src[i];
    if (char === '"' || char === "'" || char === "`") {
      i = skipStringLiteral(src, i);
      continue;
    }
    if (char === "{") depth += 1;
    else if (char === "}") depth -= 1;
    else if (char === ">" && depth === 0) break;
  }
  return { name: /^<([A-Za-z][\w.]*)/.exec(src.slice(start))?.[1] ?? "?", props: src.slice(start, i) };
}

/** The `const <name> = …;` initializer, so an identifier `titleAside` can be inspected. */
function resolveBinding(src: string, identifier: string): string | null {
  const decl = new RegExp(`\\bconst\\s+${identifier}\\s*=`).exec(src);
  if (!decl) return null;
  let depth = 0;
  let i = decl.index + decl[0].length;
  const start = i;
  for (; i < src.length; i += 1) {
    const char = src[i];
    if (char === '"' || char === "'" || char === "`") {
      i = skipStringLiteral(src, i);
      continue;
    }
    if (char === "{" || char === "(" || char === "[") depth += 1;
    else if (char === "}" || char === ")" || char === "]") depth -= 1;
    else if (char === ";" && depth === 0) break;
  }
  return src.slice(start, i);
}

/** The className of the ROOT element the aside renders — a gate on a child proves nothing. */
function rootClassName(expression: string): string | null {
  const stringAt = expression.indexOf('className="');
  const exprAt = expression.indexOf("className={");
  if (stringAt === -1 && exprAt === -1) return null;
  if (exprAt === -1 || (stringAt !== -1 && stringAt < exprAt)) {
    const from = stringAt + 'className="'.length;
    const end = expression.indexOf('"', from);
    return expression.slice(from, end === -1 ? undefined : end);
  }
  return readBracedExpression(expression, "className={", exprAt)?.text ?? null;
}

const DESKTOP_GATE = /(\bhidden\b[\s\S]*\bmd:flex\b)|(\bmd:flex\b[\s\S]*\bhidden\b)|\bmax-md:hidden\b/;

/**
 * Every shell call site that lands on the `useInlineTitleBand` path — `hideTitleOnMobileNav`
 * with a `titleAside` and no `filterRow`, the props that make `ManagerPortalPageShell` draw
 * its band at every breakpoint. With a `filterRow` the shell desktop-gates the aside itself
 * (`titleAsideDesktopOnly`), so those call sites need no manual gate.
 */
function inlineBandTitleAsides(src: string): { tag: string; gated: boolean }[] {
  const found: { tag: string; gated: boolean }[] = [];
  let cursor = 0;
  for (;;) {
    const at = src.indexOf("titleAside={", cursor);
    if (at === -1) break;
    const expression = readBracedExpression(src, "titleAside={", at);
    cursor = expression ? expression.end : at + "titleAside={".length;
    const tag = enclosingOpeningTag(src, at);
    if (!tag || !expression) continue;
    if (!tag.props.includes("hideTitleOnMobileNav") || tag.props.includes("filterRow")) continue;
    const bare = expression.text.trim().replace(/\s*(\?\?|\|\|)\s*undefined$/, "");
    const resolved = /^[A-Za-z_$][\w$]*$/.test(bare) ? resolveBinding(src, bare) : bare;
    const className = resolved === null ? null : rootClassName(resolved);
    found.push({ tag: tag.name, gated: className !== null && DESKTOP_GATE.test(className) });
  }
  return found;
}

describe("header controls reach mobile exactly once", () => {
  it("every panel with a mobile actions row keeps a desktop-gated titleAside", () => {
    const offenders: string[] = [];
    for (const file of readdirSync(PORTAL_DIR)) {
      if (!file.endsWith(".tsx")) continue;
      const src = readFileSync(join(PORTAL_DIR, file), "utf8");
      if (!RENDERS_MOBILE_ROW.test(src)) continue;
      // Band-only sections must not ALSO ship a mobile row; split sections must gate the band.
      for (const aside of inlineBandTitleAsides(src)) {
        if (!aside.gated) offenders.push(`${file} <${aside.tag}>`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the split-shape panels still render their mobile row (never zero controls)", () => {
    for (const file of SPLIT_SHAPE_PANELS) {
      const src = readFileSync(join(PORTAL_DIR, file), "utf8");
      expect(src, `${file} lost its mobile actions row`).toMatch(RENDERS_MOBILE_ROW);
      const asides = inlineBandTitleAsides(src);
      expect(asides.length, `${file} lost its inline-band titleAside`).toBeGreaterThan(0);
      expect(
        asides.every((aside) => aside.gated),
        `${file} lost its desktop gate`,
      ).toBe(true);
    }
  });

  it("reads the gate off the titleAside binding, not off an unrelated block in the file", () => {
    const ungated = [
      'const headerActions = (\n  <>\n    <button type="button">Send</button>\n  </>\n);',
      '<div className="hidden max-w-full flex-nowrap items-center gap-1 md:flex">detail row</div>',
      "<ManagerPortalPageShell title=\"Applications\" hideTitleOnMobileNav titleAside={headerActions}>",
      "<PortalPageHeaderMobileActionsRow actions={headerActions} />",
    ].join("\n");
    expect(inlineBandTitleAsides(ungated)).toEqual([{ tag: "ManagerPortalPageShell", gated: false }]);

    const gated = ungated.replace(
      "const headerActions = (\n  <>",
      'const headerActions = (\n  <PortalSectionActionRow className="ml-auto hidden gap-3 md:flex">',
    );
    expect(inlineBandTitleAsides(gated)).toEqual([{ tag: "ManagerPortalPageShell", gated: true }]);
  });

  it("a band-only shell renders the primary action once, from the band", () => {
    const applyButton = (
      <button type="button" data-attr="resident-applications-apply">
        Apply to property
      </button>
    );
    render(
      <ManagerPortalPageShell title="Applications" hideTitleOnMobileNav titleAside={applyButton} compactFilterRow>
        <p>body</p>
      </ManagerPortalPageShell>,
    );

    expect(screen.getAllByRole("button", { name: "Apply to property" })).toHaveLength(1);
    const band = document.querySelector('[data-slot="portal-page-title-band"]');
    expect(band).not.toBeNull();
    expect(band?.querySelector('[data-attr="resident-applications-apply"]')).not.toBeNull();
    expect(document.querySelector('[data-slot="portal-page-header-mobile-actions"]')).toBeNull();
  });

  it("a shell with no titleAside still renders a mobile actions row passed as a child", () => {
    // `useInlineTitleBand` is false here, so the shell falls back to `PageHeader`, which
    // carries no actions — the mobile row is the only control and must survive.
    render(
      <ManagerPortalPageShell title="Documents" hideTitleOnMobileNav>
        <PortalPageHeaderMobileActionsRow
          actions={
            <button type="button" data-attr="documents-primary">
              Upload
            </button>
          }
        />
      </ManagerPortalPageShell>,
    );

    expect(document.querySelector('[data-slot="portal-page-header-mobile-actions"]')).not.toBeNull();
    expect(screen.getAllByRole("button", { name: "Upload" })).toHaveLength(1);
  });
});
