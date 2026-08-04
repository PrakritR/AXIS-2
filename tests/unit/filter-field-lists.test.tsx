// @vitest-environment jsdom
//
// The one portal filter dropdown pattern (the captain's brief): closed by default,
// opening portals an OVERLAY over the trigger so the controls below it never shift,
// the option list is capped at 5 rows and scrolls the rest, a search box appears
// only once there are more than 5 options, and searching never drops an already-
// selected option. One field open at a time; Escape closes.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import {
  FIELD_SELECT_HOST_CHROME_ATTR,
  FIELD_SELECT_MENU_SEARCH_PX,
  computeFieldSelectMenuRect,
  computeFieldSelectMenuRectInHost,
  computePortalFilterDropdownRect,
  fieldSelectHostTopInsetPx,
  fieldSelectMenuContentPx,
  resolveOpenUp,
} from "@/components/ui/field-select-menu";
import {
  FILTER_LIST_MAX_HEIGHT_PX,
  FILTER_LIST_VISIBLE_ROWS,
  FILTER_MENU_CONTENT_PX,
  FILTER_FIELD_MENU_ALWAYS_SHOW_SEARCH,
  PORTAL_FILTER_COMMUNICATION_PANEL_CLASS,
  PORTAL_FILTER_PANEL_CHROME_PX,
  PORTAL_FILTER_RAISED_SHEET_MIN_HEIGHT_PX,
  PORTAL_FILTER_SHEET_CHROME_PX,
  FilterCheckboxList,
  FilterCollapsibleSection,
  FilterFieldsAccordion,
  FilterSingleSelectList,
  filterMultiSelectSummary,
  portalFilterPanelSizeClass,
} from "@/components/portal/filter-field-lists";
import { VaulBottomSheet } from "@/components/ui/vaul-bottom-sheet";

afterEach(cleanup);

/**
 * Non-option chrome a portal filter menu reserves: the field-name header plus the search
 * row. Both are BUDGETED on top of the five option rows — never taken out of them — so
 * this is what the shell's five-row cap is measured against.
 */
const FILTER_MENU_CHROME_PX = FIELD_SELECT_MENU_SEARCH_PX;

function makeOptions(n: number) {
  return Array.from({ length: n }, (_, i) => ({ value: `p${i}`, label: `Property ${i}` }));
}

/** A two-field filter panel with a static control rendered right below the fields. */
function Harness({ optionCount = 8 }: { optionCount?: number }) {
  const options = makeOptions(optionCount);
  const [propertyFilters, setPropertyFilters] = useState<string[]>([]);
  const [residentFilters, setResidentFilters] = useState<string[]>(["r1"]);
  const residentOptions = [
    { value: "r0", label: "Alice" },
    { value: "r1", label: "Bob" },
    { value: "r2", label: "Carol" },
    { value: "r3", label: "Dave" },
    { value: "r4", label: "Erin" },
    { value: "r5", label: "Frank" },
  ];
  return (
    <div>
      <FilterFieldsAccordion>
        <FilterCollapsibleSection
          sectionId="property"
          label="Property"
          summary={filterMultiSelectSummary(propertyFilters, options, "All properties")}
          empty={propertyFilters.length === 0}
          menuOptionCount={options.length}
          dataAttr="test-filter-property-trigger"
        >
          <FilterCheckboxList
            options={options}
            selected={propertyFilters}
            onChange={setPropertyFilters}
            dataAttr="test-filter-property"
          />
        </FilterCollapsibleSection>
        <FilterCollapsibleSection
          sectionId="resident"
          label="Resident"
          summary={filterMultiSelectSummary(residentFilters, residentOptions, "All residents")}
          empty={residentFilters.length === 0}
          menuOptionCount={residentOptions.length}
          dataAttr="test-filter-resident-trigger"
        >
          <FilterCheckboxList
            options={residentOptions}
            selected={residentFilters}
            onChange={setResidentFilters}
            dataAttr="test-filter-resident"
          />
        </FilterCollapsibleSection>
      </FilterFieldsAccordion>
      <button type="button" data-testid="control-below">
        Reset
      </button>
    </div>
  );
}

describe("FilterCollapsibleSection — the one filter dropdown pattern", () => {
  it("is closed by default and shows the placeholder summary, no option list", () => {
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: /Property/ });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveAttribute("aria-haspopup", "listbox");
    expect(screen.getByText("All properties")).toBeTruthy();
    // No listbox is rendered while every field is closed.
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("opens as a portaled overlay, NOT inline between the fields — the control below never moves", () => {
    const { container } = render(<Harness />);
    const trigger = screen.getByRole("button", { name: /Property/ });
    fireEvent.click(trigger);

    const listbox = screen.getByRole("listbox");
    // The menu is portaled to document.body, not nested inside the accordion tree
    // that also holds the control below it.
    const accordionRoot = container.firstChild as HTMLElement; // <div> harness root
    expect(accordionRoot.contains(listbox)).toBe(false);
    // The static control below the fields is still a direct child of the harness root
    // (its position in the DOM is unchanged by the open menu).
    const control = screen.getByTestId("control-below");
    expect(accordionRoot.contains(control)).toBe(true);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
  });

  it("caps the option list at exactly 5 rows and scrolls the rest", () => {
    render(<Harness optionCount={30} />);
    fireEvent.click(screen.getByRole("button", { name: /Property/ }));
    const listbox = screen.getByRole("listbox");
    // The 5-row cap lives on the portaled shell (search row + 5 option rows); the
    // listbox is the scrollable flex child that shrinks under it.
    const shell = listbox.closest("[data-field-select-menu]") as HTMLElement;
    const expectedMenuHeight = fieldSelectMenuContentPx(FILTER_LIST_VISIBLE_ROWS, FILTER_MENU_CHROME_PX);
    expect(shell.style.maxHeight).toBe(`${expectedMenuHeight}px`);
    expect(FILTER_MENU_CONTENT_PX).toBe(expectedMenuHeight);
    expect(FILTER_LIST_MAX_HEIGHT_PX).toBe(FILTER_LIST_VISIBLE_ROWS * 40);
    expect(listbox.className).toContain("overflow-y-auto");
    // All 30 options are still rendered (scrolled), not truncated.
    expect(within(listbox).getAllByRole("option")).toHaveLength(30);
  });

  it("ends the box early for FEWER than 5 options instead of padding empty rows", () => {
    // The captain's rule: 5+ options → exactly 5 rows and scroll; fewer → the box stops
    // after the last row. A fixed 5-row shell height is what produced the empty padding.
    render(<Harness optionCount={3} />);
    fireEvent.click(screen.getByRole("button", { name: /Property/ }));
    const shell = screen.getByRole("listbox").closest("[data-field-select-menu]") as HTMLElement;

    const threeRowCap = fieldSelectMenuContentPx(3, FILTER_MENU_CHROME_PX);
    const fiveRowCap = fieldSelectMenuContentPx(FILTER_LIST_VISIBLE_ROWS, FILTER_MENU_CHROME_PX);
    expect(threeRowCap).toBeLessThan(fiveRowCap);
    expect(shell.style.maxHeight).toBe(`${threeRowCap}px`);
    // `height: auto` under that cap is what lets the shell stop at its real content.
    expect(shell.style.height).toBe("auto");
  });

  it("does not repeat the field label inside the portaled menu", () => {
    render(<Harness optionCount={30} />);
    fireEvent.click(screen.getByRole("button", { name: /Property/ }));
    const shell = screen.getByRole("listbox").closest("[data-field-select-menu]") as HTMLElement;

    expect(within(shell).queryByText("Property")).toBeNull();
    expect(screen.getByText("Property")).toBeTruthy();
    expect(shell.style.maxHeight).toBe(
      `${fieldSelectMenuContentPx(FILTER_LIST_VISIBLE_ROWS, FILTER_MENU_CHROME_PX)}px`,
    );
    expect(FILTER_MENU_CHROME_PX).toBe(FIELD_SELECT_MENU_SEARCH_PX);
  });

  it("keeps the 3-field panel tall enough for its own chrome AND a full menu", () => {
    // A host must hold the menu BELOW its Filter/Reset/✕ row. Sizing it for the menu alone
    // let the menu fit while painting over Reset and Close — and the same class of bug on
    // the mobile sheet hid the only visible dismiss control. If the header or the menu ever
    // grows past this headroom, either the menu escapes the panel or it eats the chrome;
    // both are silent, so the arithmetic is pinned here.
    const panel3Px = 23 * 16;
    const containmentGap = 4 * 2;
    expect(portalFilterPanelSizeClass(3)).toContain("23rem");
    expect(
      FILTER_MENU_CONTENT_PX + PORTAL_FILTER_PANEL_CHROME_PX + containmentGap,
    ).toBeLessThanOrEqual(panel3Px);
  });

  it("never grows the menu past 5 rows no matter how many options a field has", () => {
    const fiveRowCap = fieldSelectMenuContentPx(FILTER_LIST_VISIBLE_ROWS, FILTER_MENU_CHROME_PX);
    for (const count of [6, 12, 30, 400]) {
      expect(fieldSelectMenuContentPx(count, FILTER_MENU_CHROME_PX)).toBe(fiveRowCap);
    }
  });

  it("keeps every control below an open field at its exact position (nothing reflows)", () => {
    render(<Harness optionCount={30} />);
    const propertyTrigger = screen.getByRole("button", { name: /Property/ });
    const residentTrigger = screen.getByRole("button", { name: /Resident/ });
    const control = screen.getByTestId("control-below");

    // The open menu is portaled OUT of the field stack, so no sibling of the trigger is
    // added or removed — the DOM order the layout derives from is byte-identical.
    const orderBefore = [propertyTrigger, residentTrigger, control].map(
      (el) => el.compareDocumentPosition(control),
    );
    const parentBefore = control.parentElement;
    const siblingsBefore = parentBefore?.childElementCount;

    fireEvent.click(propertyTrigger);

    expect(screen.getByRole("listbox").closest("[data-field-select-menu]")?.parentElement).toBe(
      document.body,
    );
    expect(control.parentElement).toBe(parentBefore);
    expect(parentBefore?.childElementCount).toBe(siblingsBefore);
    expect([propertyTrigger, residentTrigger, control].map((el) => el.compareDocumentPosition(control))).toEqual(
      orderBefore,
    );
  });

  it("shows a search box when there are MORE than 5 options", () => {
    render(<Harness optionCount={8} />);
    fireEvent.click(screen.getByRole("button", { name: /Property/ }));
    expect(screen.getByRole("textbox")).toBeTruthy();
  });

  it("shows a search box on every portal filter menu, and always when there are more than 5 options", () => {
    render(<Harness optionCount={4} />);
    fireEvent.click(screen.getByRole("button", { name: /Property/ }));
    expect(screen.getByRole("textbox")).toBeTruthy();
  });

  it("hides the search box on non-filter field-select menus with 5 or fewer options", () => {
    // FilterCheckboxList always shows search; this documents the filter-specific rule only.
    expect(FILTER_FIELD_MENU_ALWAYS_SHOW_SEARCH).toBe(true);
  });

  it("filters the visible options as you type without dropping the selection", () => {
    render(<Harness optionCount={8} />);
    fireEvent.click(screen.getByRole("button", { name: /Property/ }));
    const listbox = screen.getByRole("listbox");
    // Select an option, then search for something else.
    fireEvent.pointerDown(within(listbox).getByText("Property 0"));
    const search = screen.getByRole("textbox");
    fireEvent.change(search, { target: { value: "Property 7" } });
    // Only the match is visible now …
    expect(within(listbox).getAllByRole("option")).toHaveLength(1);
    expect(within(listbox).getByText("Property 7")).toBeTruthy();
    // … but the earlier selection is preserved: clearing the query shows it checked.
    fireEvent.change(search, { target: { value: "" } });
    const selectedRow = within(listbox).getByText("Property 0").closest('[role="option"]')!;
    expect(selectedRow.getAttribute("aria-selected")).toBe("true");
  });

  it("keeps multi-select semantics: clicking a row toggles without closing the menu", () => {
    render(<Harness optionCount={8} />);
    fireEvent.click(screen.getByRole("button", { name: /Property/ }));
    const listbox = screen.getByRole("listbox");
    fireEvent.pointerDown(within(listbox).getByText("Property 1"));
    // Still open after a pick.
    expect(screen.getByRole("listbox")).toBeTruthy();
    fireEvent.pointerDown(within(listbox).getByText("Property 2"));
    const rows = within(listbox).getAllByRole("option").filter((r) => r.getAttribute("aria-selected") === "true");
    expect(rows.length).toBe(2);
  });

  it("opens one field at a time (accordion)", () => {
    render(<Harness optionCount={8} />);
    fireEvent.click(screen.getByRole("button", { name: /Property/ }));
    expect(screen.getByRole("button", { name: /Property/ })).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(screen.getByRole("button", { name: /Resident/ }));
    // Opening the resident field closes the property field.
    expect(screen.getByRole("button", { name: /Property/ })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: /Resident/ })).toHaveAttribute("aria-expanded", "true");
  });

  it("closes on Escape", () => {
    render(<Harness optionCount={8} />);
    fireEvent.click(screen.getByRole("button", { name: /Property/ }));
    expect(screen.getByRole("listbox")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("sizes the menu from the rows the LIST renders, not the count the caller passed", () => {
    // A hand-synced count that drifts from the array changes `menuContentPx`, which feeds
    // `resolveOpenUp` — so it silently alters both the menu's height and its open
    // direction. The list that renders the rows reports them instead, so the two cannot
    // disagree. Both directions of drift are pinned.
    const options = makeOptions(30);
    render(
      <FilterCollapsibleSection
        label="Property"
        summary="All properties"
        menuOptionCount={1}
      >
        <FilterCheckboxList options={options} selected={[]} onChange={() => {}} dataAttr="drift" />
      </FilterCollapsibleSection>,
    );
    fireEvent.click(screen.getByRole("button", { name: /Property/ }));
    const shell = screen.getByRole("listbox").closest("[data-field-select-menu]") as HTMLElement;
    expect(shell.style.maxHeight).toBe(
      `${fieldSelectMenuContentPx(FILTER_LIST_VISIBLE_ROWS, FILTER_MENU_CHROME_PX)}px`,
    );
  });

  it("counts the leading 'All …' row a single-select list injects, without the caller adding 1", () => {
    // `application-filter-sort-fields` and `report-filter-bar` both build their options with
    // a leading "All …" row, so a caller's raw array length is not the rendered row count.
    const options = [
      { value: "", label: "All properties" },
      { value: "a", label: "Ballard House" },
      { value: "b", label: "Emerald Court" },
    ];
    render(
      <FilterCollapsibleSection label="Property" summary="All properties" menuOptionCount={99}>
        <FilterSingleSelectList options={options} value="" onChange={() => {}} dataAttr="drift" />
      </FilterCollapsibleSection>,
    );
    fireEvent.click(screen.getByRole("button", { name: /Property/ }));
    const shell = screen.getByRole("listbox").closest("[data-field-select-menu]") as HTMLElement;
    // Three rendered rows — the injected "All properties" plus the two real ones — and NOT
    // the caller's 99, which would have reserved a full five-row box.
    expect(shell.style.maxHeight).toBe(`${fieldSelectMenuContentPx(3, FILTER_MENU_CHROME_PX)}px`);
  });

  it("uses a count summary for multi-select so the trigger width stays stable", () => {
    expect(filterMultiSelectSummary([], [{ value: "a", label: "Ballard House" }], "All properties")).toBe(
      "All properties",
    );
    expect(filterMultiSelectSummary(["a"], [{ value: "a", label: "Ballard House" }], "All properties")).toBe(
      "Ballard House",
    );
    expect(
      filterMultiSelectSummary(
        ["a", "b"],
        [
          { value: "a", label: "Ballard House · 3 rooms" },
          { value: "b", label: "Emerald Court · Unit 3" },
        ],
        "All properties",
      ),
    ).toBe("2 selected");
  });
});

describe("portalFilterPanelSizeClass", () => {
  it("uses shorter height for one field and taller for more", () => {
    expect(portalFilterPanelSizeClass(1)).toContain("10.5rem");
    expect(portalFilterPanelSizeClass(2)).toContain("14rem");
    expect(portalFilterPanelSizeClass(3)).toContain("23rem");
    // Four 76px field rows plus header/padding need 23rem; at 19rem the fourth field
    // rendered BELOW the panel and was only reachable by scrolling.
    expect(portalFilterPanelSizeClass(4)).toContain("23rem");
    expect(PORTAL_FILTER_COMMUNICATION_PANEL_CLASS).toContain("23rem");
  });
});

describe("the raised filter sheet is placed statically, never measured", () => {
  it("elevates from a prop alone so an opening dropdown cannot flip the placement", () => {
    const { container } = render(
      <VaulBottomSheet open onOpenChange={() => {}} title="Filter" autoElevate>
        <p>fields</p>
      </VaulBottomSheet>,
    );
    void container;
    const sheet = document.querySelector('[data-slot="vaul-bottom-sheet"]') as HTMLElement;
    expect(sheet.getAttribute("data-elevated")).toBe("true");
    expect(sheet.className).toContain("top-auto");
    // The raised offset AND the max-height derive from the same custom property, so a
    // raised sheet can never run off the top of the viewport — that is what the old
    // `height < viewport * 0.52` measurement was guarding, and the measurement is what
    // made the sheet jump when its content changed.
    expect(sheet.className).toContain("bottom-[var(--portal-raised-sheet-offset)]");
    expect(sheet.className).toContain("max-h-[calc(100dvh-var(--portal-raised-sheet-offset)-1rem)]");
    expect(sheet.style.getPropertyValue("--portal-raised-sheet-offset")).toContain("32vh");
    // Exactly one max-height utility: two would resolve by CSS source order, not class order.
    expect(sheet.className.match(/max-h-\[/g)).toHaveLength(1);
    // …and exactly one `bottom-*`, for the same reason. `bottom-0` alongside the raised
    // offset rendered correctly only because Tailwind happens to emit arbitrary values
    // last; a reordering would drop the sheet back to the viewport bottom and take the
    // containment guarantee — and therefore the uncoverable chrome — with it.
    const bottomUtilities = sheet.className
      .split(/\s+/)
      .filter((token) => /^bottom-/.test(token));
    expect(bottomUtilities).toEqual(["bottom-[var(--portal-raised-sheet-offset)]"]);
  });

  it("keeps the bottom-anchored sheet above the native tab bar inset", () => {
    render(
      <VaulBottomSheet open onOpenChange={() => {}} title="Filter">
        <p>fields</p>
      </VaulBottomSheet>,
    );
    const sheet = document.querySelector('[data-slot="vaul-bottom-sheet"]') as HTMLElement;
    expect(sheet.className.split(/\s+/).filter((token) => /^bottom-/.test(token))).toEqual([
      "bottom-[var(--portal-native-bottom-nav-inset,0px)]",
    ]);
  });

  it("travels its own height PLUS the raised offset so it still animates off screen on close", () => {
    // Vaul's slideFromBottom/slideToBottom keyframes translate by
    // `var(--initial-transform, 100%)` — 100% of the drawer's OWN height, which clears the
    // viewport only for a bottom-anchored drawer. A raised sheet left at the default ends
    // the close animation `offset` px short and then unmounts abruptly.
    render(
      <VaulBottomSheet open onOpenChange={() => {}} title="Filter" autoElevate>
        <p>fields</p>
      </VaulBottomSheet>,
    );
    const sheet = document.querySelector('[data-slot="vaul-bottom-sheet"]') as HTMLElement;
    // Reads the same custom property the placement does, so the two can never disagree.
    expect(sheet.style.getPropertyValue("--initial-transform")).toBe(
      "calc(100% + var(--portal-raised-sheet-offset))",
    );
  });

  it("floors the raised sheet tall enough to contain its widest menu BELOW its own chrome", () => {
    // A one-field sheet measured ~179px and could not contain a 292px menu, so the menu
    // hung onto the dimmed scrim — the first defect. Dropping the chrome term then let the
    // menu fit while painting over the sheet's own close ✕ — the second. The floor is
    // derived from the menu, never typed in, and must clear the REAL predicate:
    // `host.height - topInset - 2*gap >= contentPx`. Omitting the chrome term here is what
    // let a raised PORTAL_FILTER_SHEET_CHROME_PX silently drop the sheet out of the
    // contained branch with a green suite.
    const containmentGap = 4 * 2;
    expect(
      PORTAL_FILTER_RAISED_SHEET_MIN_HEIGHT_PX - PORTAL_FILTER_SHEET_CHROME_PX - containmentGap,
    ).toBeGreaterThanOrEqual(FILTER_MENU_CONTENT_PX);

    render(
      <VaulBottomSheet
        open
        onOpenChange={() => {}}
        title="Filter"
        autoElevate
        minHeightPx={PORTAL_FILTER_RAISED_SHEET_MIN_HEIGHT_PX}
      >
        <p>one field</p>
      </VaulBottomSheet>,
    );
    const sheet = document.querySelector('[data-slot="vaul-bottom-sheet"]') as HTMLElement;
    // Clamped against the raised max-height, never applied raw: a bare pixel floor would
    // out-rank max-height on a short viewport and push the sheet's top off screen. Under
    // ~575px of viewport height the clamp arm wins and containment is unreachable — an
    // accepted degradation documented beside PORTAL_FILTER_RAISED_SHEET_MIN_HEIGHT_PX, which
    // is why nothing here asserts five rows at that size.
    expect(sheet.style.minHeight).toContain(`min(${PORTAL_FILTER_RAISED_SHEET_MIN_HEIGHT_PX}px,`);
    expect(sheet.style.minHeight).toContain("--portal-raised-sheet-offset");
    expect(sheet.style.minHeight).not.toMatch(/^\s*\d+px\s*$/);
  });

  it("leaves a viewport-filling sheet bottom-anchored (raising it would clip its top)", () => {
    render(
      <VaulBottomSheet open onOpenChange={() => {}} title="Filter" maxHeightClass="max-h-[min(92dvh,44rem)]">
        <p>fields</p>
      </VaulBottomSheet>,
    );
    const sheet = document.querySelector('[data-slot="vaul-bottom-sheet"]') as HTMLElement;
    expect(sheet.getAttribute("data-elevated")).toBe("false");
    expect(sheet.className).toContain("max-h-[min(92dvh,44rem)]");
    expect(sheet.className).not.toContain("top-auto");
  });

  it("fills a bottom-anchored sheet to its max height so the card background reaches the tab bar", () => {
    render(
      <VaulBottomSheet
        open
        onOpenChange={() => {}}
        title="Filter"
        fillViewport
        maxHeightClass="max-h-[min(92dvh,calc(100dvh-var(--portal-native-bottom-nav-inset,0px)-0.5rem))]"
      >
        <p>one field</p>
      </VaulBottomSheet>,
    );
    const sheet = document.querySelector('[data-slot="vaul-bottom-sheet"]') as HTMLElement;
    expect(sheet.getAttribute("data-elevated")).toBe("false");
    expect(sheet.className).toContain(
      "min-h-[min(92dvh,calc(100dvh-var(--portal-native-bottom-nav-inset,0px)-0.5rem))]",
    );
    expect(sheet.className).toContain(
      "max-h-[min(92dvh,calc(100dvh-var(--portal-native-bottom-nav-inset,0px)-0.5rem))]",
    );
  });
});

describe("portal filter dropdown positioning", () => {
  it("right-aligns the panel to the trigger and stays inside the viewport", () => {
    const button = document.createElement("button");
    document.body.appendChild(button);
    button.getBoundingClientRect = () =>
      ({
        top: 80,
        left: 900,
        right: 1000,
        bottom: 120,
        width: 100,
        height: 40,
        x: 900,
        y: 80,
        toJSON: () => ({}),
      }) as DOMRect;
    Object.defineProperty(window, "innerWidth", { value: 1024, configurable: true });
    Object.defineProperty(window, "innerHeight", { value: 768, configurable: true });

    const rect = computePortalFilterDropdownRect(button, 168, { widthPx: 352 });
    expect(rect.left + rect.width).toBe(1000);
    expect(rect.left).toBeGreaterThanOrEqual(12);
    expect(rect.top).toBeGreaterThanOrEqual(120);

    document.body.removeChild(button);
  });

  it("keeps field menus inside an open filter dropdown host", () => {
    const host = document.createElement("div");
    host.setAttribute("data-slot", "portal-filter-dropdown-panel");
    host.style.position = "fixed";
    host.style.top = "100px";
    host.style.left = "600px";
    host.style.width = "352px";
    host.style.height = "304px";
    document.body.appendChild(host);

    const button = document.createElement("button");
    host.appendChild(button);
    button.getBoundingClientRect = () =>
      ({
        top: 180,
        left: 612,
        right: 940,
        bottom: 224,
        width: 328,
        height: 44,
        x: 612,
        y: 180,
        toJSON: () => ({}),
      }) as DOMRect;
    host.getBoundingClientRect = () =>
      ({
        top: 100,
        left: 600,
        right: 952,
        bottom: 404,
        width: 352,
        height: 304,
        x: 600,
        y: 100,
        toJSON: () => ({}),
      }) as DOMRect;

    const rect = computeFieldSelectMenuRectInHost(button, 252, host, { minWidth: 328, preferOpenDown: true });
    expect(rect.position).toBe("absolute");
    // The 304px host can hold a 252px menu, so the menu is slid back inside its box rather
    // than hanging off the bottom — full height, wholly within the host.
    expect(rect.maxHeight).toBe(252);
    expect(rect.top).toBeGreaterThanOrEqual(0);
    expect(rect.top + rect.maxHeight).toBeLessThanOrEqual(304);

    document.body.removeChild(host);
  });

  it("opens UP rather than crushing the menu when a field sits at the panel bottom", () => {
    const host = document.createElement("div");
    host.setAttribute("data-slot", "portal-filter-dropdown-panel");
    host.style.position = "fixed";
    host.style.top = "100px";
    host.style.left = "600px";
    host.style.width = "352px";
    host.style.height = "304px";
    document.body.appendChild(host);

    const button = document.createElement("button");
    host.appendChild(button);
    button.getBoundingClientRect = () =>
      ({
        top: 348,
        left: 612,
        right: 940,
        bottom: 392,
        width: 328,
        height: 44,
        x: 612,
        y: 348,
        toJSON: () => ({}),
      }) as DOMRect;
    host.getBoundingClientRect = () =>
      ({
        top: 100,
        left: 600,
        right: 952,
        bottom: 404,
        width: 352,
        height: 304,
        x: 600,
        y: 100,
        toJSON: () => ({}),
      }) as DOMRect;

    // 8px below the trigger inside the host vs 244px above it. `preferOpenDown` still wins
    // whenever the menu fits below (see the viewport-clamped case above, which is the real
    // sheet path); here nothing fits below, so forcing down would render a one-row menu.
    const rect = computeFieldSelectMenuRectInHost(button, 252, host, { preferOpenDown: true });
    const triggerTopInHost = 348 - 100;
    // Opens upward and keeps its full height, clamped inside the host. It may overlap the
    // trigger by the shortfall (244px above vs a 252px menu) — the lesser cost against
    // hanging the menu off the panel or crushing it below five rows.
    expect(rect.top).toBeLessThan(triggerTopInHost);
    expect(rect.maxHeight).toBe(252);
    expect(rect.top).toBeGreaterThanOrEqual(0);
    expect(rect.top + rect.maxHeight).toBeLessThanOrEqual(304);

    document.body.removeChild(host);
  });

  it("keeps a menu INSIDE its sheet when the sheet can seat it, even offered a viewport bound", () => {
    // A menu escaping its sheet onto the dimmed page reads as broken, so containment wins
    // whenever the host can seat the whole menu on either side of the trigger — the
    // viewport bound is a last resort, not the default.
    const host = document.createElement("div");
    host.setAttribute("data-slot", "vaul-bottom-sheet");
    document.body.appendChild(host);
    // A tall sheet: 395px, so 319px sits above this bottom-most trigger.
    host.getBoundingClientRect = () =>
      ({ top: 179, left: 0, right: 390, bottom: 574, width: 390, height: 395, x: 0, y: 179, toJSON: () => ({}) }) as DOMRect;

    const button = document.createElement("button");
    host.appendChild(button);
    // Last field: only ~24px of the host remains below it.
    button.getBoundingClientRect = () =>
      ({ top: 502, left: 16, right: 374, bottom: 546, width: 358, height: 44, x: 16, y: 502, toJSON: () => ({}) }) as DOMRect;
    Object.defineProperty(window, "innerHeight", { value: 844, configurable: true });

    const contentPx = fieldSelectMenuContentPx(FILTER_LIST_VISIBLE_ROWS, FILTER_MENU_CHROME_PX);
    const hostHeight = 395;

    const rect = computeFieldSelectMenuRectInHost(button, contentPx, host, {
      preferOpenDown: true,
      bottomBoundPx: window.innerHeight - 12,
    });
    // Full five rows, opened upward, and wholly within the host's own box.
    expect(rect.maxHeight).toBe(contentPx);
    expect(rect.top).toBeGreaterThanOrEqual(0);
    expect(rect.top + rect.maxHeight).toBeLessThanOrEqual(hostHeight);

    document.body.removeChild(host);
  });

  it("spills to the viewport ONLY when the host is too short to seat the menu at all", () => {
    const host = document.createElement("div");
    host.setAttribute("data-slot", "vaul-bottom-sheet");
    document.body.appendChild(host);
    // A one-field sheet, 179px tall — shorter than a 5-row menu, so containment is
    // impossible and clipping to it would crush the menu to a row or two.
    host.getBoundingClientRect = () =>
      ({ top: 395, left: 0, right: 390, bottom: 574, width: 390, height: 179, x: 0, y: 395, toJSON: () => ({}) }) as DOMRect;

    const button = document.createElement("button");
    host.appendChild(button);
    button.getBoundingClientRect = () =>
      ({ top: 486, left: 16, right: 374, bottom: 530, width: 358, height: 44, x: 16, y: 486, toJSON: () => ({}) }) as DOMRect;
    Object.defineProperty(window, "innerHeight", { value: 844, configurable: true });

    const contentPx = fieldSelectMenuContentPx(FILTER_LIST_VISIBLE_ROWS, FILTER_MENU_CHROME_PX);

    const contained = computeFieldSelectMenuRectInHost(button, contentPx, host, {
      preferOpenDown: true,
    });
    expect(contained.maxHeight).toBeLessThan(contentPx); // crushed with no escape offered

    const spilled = computeFieldSelectMenuRectInHost(button, contentPx, host, {
      preferOpenDown: true,
      bottomBoundPx: window.innerHeight - 12,
    });
    // Showing all five rows outranks staying inside a sheet that cannot hold them.
    expect(spilled.maxHeight).toBe(contentPx);
    expect(spilled.top).toBe(530 - 395 + 4);

    document.body.removeChild(host);
  });

  it("measures the host's tagged chrome from the host's own top edge", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    host.getBoundingClientRect = () =>
      ({ top: 179, left: 0, right: 390, bottom: 574, width: 390, height: 395, x: 0, y: 179, toJSON: () => ({}) }) as DOMRect;

    // Untagged host: nothing to clear, so no inset is invented.
    expect(fieldSelectHostTopInsetPx(host)).toBe(0);

    const handle = document.createElement("div");
    handle.setAttribute(FIELD_SELECT_HOST_CHROME_ATTR, "");
    host.appendChild(handle);
    handle.getBoundingClientRect = () =>
      ({ top: 183, left: 0, right: 390, bottom: 195, width: 390, height: 12, x: 0, y: 183, toJSON: () => ({}) }) as DOMRect;

    const titleRow = document.createElement("div");
    titleRow.setAttribute(FIELD_SELECT_HOST_CHROME_ATTR, "");
    host.appendChild(titleRow);
    titleRow.getBoundingClientRect = () =>
      ({ top: 195, left: 0, right: 390, bottom: 254, width: 390, height: 59, x: 0, y: 195, toJSON: () => ({}) }) as DOMRect;

    // The LOWEST tagged bottom wins, relative to the host — not a sum, and not the first
    // one found: measured at runtime because the chrome differs per host and a stale
    // constant would silently start hiding the close control again.
    expect(fieldSelectHostTopInsetPx(host)).toBe(254 - 179);

    // A collapsed (zero-height) chrome row reserves nothing.
    const collapsed = document.createElement("div");
    collapsed.setAttribute(FIELD_SELECT_HOST_CHROME_ATTR, "");
    host.appendChild(collapsed);
    collapsed.getBoundingClientRect = () =>
      ({ top: 500, left: 0, right: 390, bottom: 500, width: 390, height: 0, x: 0, y: 500, toJSON: () => ({}) }) as DOMRect;
    expect(fieldSelectHostTopInsetPx(host)).toBe(254 - 179);

    document.body.removeChild(host);
  });

  it("never places a CONTAINED menu over the host's chrome, even when the anchor says so", () => {
    // The reported defect: on the 1-field mobile sheet the close ✕, the Filter title, the
    // drag handle and the trigger were ALL 100% covered. FilterCheckboxList does not close
    // on pick and a phone has no Escape key, so hiding the only visible dismiss control can
    // strand the user. Every placement starts at `topInset + gap`.
    const host = document.createElement("div");
    host.setAttribute("data-slot", "vaul-bottom-sheet");
    document.body.appendChild(host);
    host.getBoundingClientRect = () =>
      ({ top: 179, left: 0, right: 390, bottom: 574, width: 390, height: 395, x: 0, y: 179, toJSON: () => ({}) }) as DOMRect;

    const button = document.createElement("button");
    host.appendChild(button);
    // Bottom-most field: opening up anchors the menu at 27px into the host, which is well
    // inside the 88px of chrome above it.
    button.getBoundingClientRect = () =>
      ({ top: 502, left: 16, right: 374, bottom: 546, width: 358, height: 44, x: 16, y: 502, toJSON: () => ({}) }) as DOMRect;
    Object.defineProperty(window, "innerHeight", { value: 844, configurable: true });

    const contentPx = FILTER_MENU_CONTENT_PX;
    const gap = 4;
    const rect = computeFieldSelectMenuRectInHost(button, contentPx, host, {
      preferOpenDown: true,
      topInsetPx: PORTAL_FILTER_SHEET_CHROME_PX,
      bottomBoundPx: window.innerHeight - 12,
    });

    expect(rect.top).toBeGreaterThanOrEqual(PORTAL_FILTER_SHEET_CHROME_PX + gap);
    // The five-row guarantee and containment both survive the clamp — that is what the
    // raised-sheet floor buys.
    expect(rect.maxHeight).toBe(contentPx);
    expect(rect.top + rect.maxHeight).toBeLessThanOrEqual(395);

    document.body.removeChild(host);
  });

  it("floors the SPILLED open-down placement at the chrome too, not just the contained one", () => {
    // The invariant is unconditional — contained and spilled, up and down. The spilled
    // open-down branch used to return `triggerBottom + gap` raw, so the first host short
    // enough to spill AND scrollable enough to put a trigger behind its chrome would have
    // painted over the close control again.
    const host = document.createElement("div");
    host.setAttribute("data-slot", "vaul-bottom-sheet");
    document.body.appendChild(host);
    // 179px: too short to seat a 292px menu below 88px of chrome, so this is the spill branch.
    host.getBoundingClientRect = () =>
      ({ top: 395, left: 0, right: 390, bottom: 574, width: 390, height: 179, x: 0, y: 395, toJSON: () => ({}) }) as DOMRect;

    const button = document.createElement("button");
    host.appendChild(button);
    // A trigger scrolled up behind the chrome: its bottom is 54px into a host reserving 88px.
    button.getBoundingClientRect = () =>
      ({ top: 405, left: 16, right: 374, bottom: 449, width: 358, height: 44, x: 16, y: 405, toJSON: () => ({}) }) as DOMRect;
    Object.defineProperty(window, "innerHeight", { value: 844, configurable: true });

    const gap = 4;
    const rect = computeFieldSelectMenuRectInHost(button, FILTER_MENU_CONTENT_PX, host, {
      preferOpenDown: true,
      topInsetPx: PORTAL_FILTER_SHEET_CHROME_PX,
      bottomBoundPx: window.innerHeight - 12,
    });

    expect(rect.top).toBe(PORTAL_FILTER_SHEET_CHROME_PX + gap);
    // Spilling is what buys the five rows here; the clamp must not cost them.
    expect(rect.maxHeight).toBe(FILTER_MENU_CONTENT_PX);

    document.body.removeChild(host);
  });

  it("honours host chrome in a MODAL host too — the rule has no 'except in a modal' carve-out", () => {
    // `computeFieldSelectMenuRect` is the live path for browse-homes' desktop `panel`
    // presentation, which portals into an open Radix dialog. Its Close was uncovered only
    // because that modal happened to span 162..738 — a coincidence, not a guarantee.
    const host = document.createElement("div");
    host.setAttribute("data-slot", "modal-radix-dialog");
    document.body.appendChild(host);
    host.getBoundingClientRect = () =>
      ({ top: 162, left: 400, right: 900, bottom: 738, width: 500, height: 576, x: 400, y: 162, toJSON: () => ({}) }) as DOMRect;

    const button = document.createElement("button");
    host.appendChild(button);
    button.getBoundingClientRect = () =>
      ({ top: 300, left: 416, right: 884, bottom: 344, width: 468, height: 44, x: 416, y: 300, toJSON: () => ({}) }) as DOMRect;
    Object.defineProperty(window, "innerWidth", { value: 1440, configurable: true });
    // A short viewport, so nothing fits below and the menu is forced upward.
    Object.defineProperty(window, "innerHeight", { value: 400, configurable: true });

    const chromePx = 60;
    const gap = 4;
    const rect = computeFieldSelectMenuRect(button, FILTER_MENU_CONTENT_PX, host, {
      matchTriggerWidth: true,
      topInsetPx: chromePx,
    });

    // Without the inset the menu opened at viewport y=16 — above the modal's own top edge
    // and squarely over its title/close row.
    expect(rect.position).toBe("fixed");
    expect(rect.top).toBeGreaterThanOrEqual(162 + chromePx + gap);
    // Bounded by the space that is actually free, so it never grows back over the chrome.
    expect(rect.top + rect.maxHeight).toBeLessThanOrEqual(300);

    document.body.removeChild(host);
  });

  it("leaves body-portaled menus untouched when there is no host chrome to clear", () => {
    const button = document.createElement("button");
    document.body.appendChild(button);
    button.getBoundingClientRect = () =>
      ({ top: 300, left: 16, right: 360, bottom: 344, width: 344, height: 44, x: 16, y: 300, toJSON: () => ({}) }) as DOMRect;
    Object.defineProperty(window, "innerWidth", { value: 390, configurable: true });
    Object.defineProperty(window, "innerHeight", { value: 844, configurable: true });

    const rect = computeFieldSelectMenuRect(button, 252, document.body, {
      preferOpenDown: true,
      matchTriggerWidth: true,
    });
    expect(rect.top).toBe(344 + 4);
    expect(rect.maxHeight).toBe(252);

    document.body.removeChild(button);
  });

  it("falls back to opening UP when a preferred-down menu cannot fit below", () => {
    // `preferOpenDown` is a preference, not a lock.
    const contentPx = 264;
    expect(resolveOpenUp(300, 100, contentPx, true)).toBe(false); // fits below → down
    expect(resolveOpenUp(300, 700, contentPx, true)).toBe(false); // still fits below → down
    expect(resolveOpenUp(40, 700, contentPx, true)).toBe(true); // cannot fit below → up
    expect(resolveOpenUp(40, 20, contentPx, true)).toBe(false); // neither fits, down roomier
  });

  it("only flips a preferred-down menu up when that buys at least one more whole row", () => {
    // The preference has to MEAN something: without it the roomier side wins on a 1px
    // difference and the menu jumps over the very fields it was opened from. With it,
    // flipping up must gain a full option row (FIELD_SELECT_MENU_ITEM_HEIGHT_PX = 40).
    // Every case here is the NEITHER-fits branch (both sides < contentPx), which is the
    // only place the hysteresis is allowed to arbitrate.
    const contentPx = 264;
    expect(resolveOpenUp(100, 120, contentPx, true)).toBe(false); // +20px above → stay down
    expect(resolveOpenUp(100, 120, contentPx, false)).toBe(true); // no preference → roomier wins
    expect(resolveOpenUp(100, 140, contentPx, true)).toBe(true); // +40px buys a row → up
  });

  it("takes the space ABOVE when it fits whole and below would clip a row short", () => {
    // The captain's requirement is non-negotiable: every dropdown always shows 5 entries.
    // Stickiness is a nicety, so where the two conflict always-5 wins — a pure difference
    // test opened this DOWN at 246px (~4.6 rows) while a full 264px sat above it.
    const contentPx = 264;
    expect(resolveOpenUp(250, 270, contentPx, true)).toBe(true);
    expect(resolveOpenUp(250, 270, contentPx, false)).toBe(true);
    // The fits-below rule still comes first, so a menu that fits below never flips up
    // just because there is even more room above it.
    expect(resolveOpenUp(264, 700, contentPx, true)).toBe(false);
  });

  it("opens filter field menus below the trigger on body portal when the menu fits there", () => {
    const button = document.createElement("button");
    document.body.appendChild(button);
    button.getBoundingClientRect = () =>
      ({
        top: 300,
        left: 16,
        right: 360,
        bottom: 344,
        width: 344,
        height: 44,
        x: 16,
        y: 300,
        toJSON: () => ({}),
      }) as DOMRect;
    Object.defineProperty(window, "innerWidth", { value: 390, configurable: true });
    Object.defineProperty(window, "innerHeight", { value: 844, configurable: true });

    const contentPx = 252;
    const rect = computeFieldSelectMenuRect(button, contentPx, document.body, {
      preferOpenDown: true,
      matchTriggerWidth: true,
    });
    expect(rect.position).toBe("fixed");
    expect(rect.top).toBe(344 + 4);
    expect(rect.width).toBe(344);
    expect(rect.left).toBe(16);
    // Full height below — the preference is honoured and nothing is crushed.
    expect(rect.maxHeight).toBe(contentPx);

    document.body.removeChild(button);
  });

  it("still opens UP on the body portal when a preferred-down menu has no room below", () => {
    const button = document.createElement("button");
    document.body.appendChild(button);
    button.getBoundingClientRect = () =>
      ({
        top: 760,
        left: 16,
        right: 360,
        bottom: 804,
        width: 344,
        height: 44,
        x: 16,
        y: 760,
        toJSON: () => ({}),
      }) as DOMRect;
    Object.defineProperty(window, "innerWidth", { value: 390, configurable: true });
    Object.defineProperty(window, "innerHeight", { value: 844, configurable: true });

    const contentPx = 252;
    const rect = computeFieldSelectMenuRect(button, contentPx, document.body, {
      preferOpenDown: true,
      matchTriggerWidth: true,
    });
    expect(rect.top + rect.maxHeight).toBeLessThanOrEqual(760);
    expect(rect.maxHeight).toBe(contentPx);

    document.body.removeChild(button);
  });
});
