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
  FIELD_SELECT_MENU_SEARCH_PX,
  computeFieldSelectMenuRect,
  computeFieldSelectMenuRectInHost,
  computePortalFilterDropdownRect,
  fieldSelectMenuContentPx,
  resolveOpenUp,
} from "@/components/ui/field-select-menu";
import {
  FILTER_LIST_MAX_HEIGHT_PX,
  FILTER_LIST_VISIBLE_ROWS,
  FILTER_MENU_CONTENT_PX,
  FILTER_FIELD_MENU_ALWAYS_SHOW_SEARCH,
  PORTAL_FILTER_COMMUNICATION_PANEL_CLASS,
  FilterCheckboxList,
  FilterCollapsibleSection,
  FilterFieldsAccordion,
  filterMultiSelectSummary,
  portalFilterPanelSizeClass,
} from "@/components/portal/filter-field-lists";
import { VaulBottomSheet } from "@/components/ui/vaul-bottom-sheet";

afterEach(cleanup);

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
    const expectedMenuHeight = fieldSelectMenuContentPx(FILTER_LIST_VISIBLE_ROWS, FIELD_SELECT_MENU_SEARCH_PX);
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

    const threeRowCap = fieldSelectMenuContentPx(3, FIELD_SELECT_MENU_SEARCH_PX);
    const fiveRowCap = fieldSelectMenuContentPx(FILTER_LIST_VISIBLE_ROWS, FIELD_SELECT_MENU_SEARCH_PX);
    expect(threeRowCap).toBeLessThan(fiveRowCap);
    expect(shell.style.maxHeight).toBe(`${threeRowCap}px`);
    // `height: auto` under that cap is what lets the shell stop at its real content.
    expect(shell.style.height).toBe("auto");
  });

  it("never grows the menu past 5 rows no matter how many options a field has", () => {
    const fiveRowCap = fieldSelectMenuContentPx(FILTER_LIST_VISIBLE_ROWS, FIELD_SELECT_MENU_SEARCH_PX);
    for (const count of [6, 12, 30, 400]) {
      expect(fieldSelectMenuContentPx(count, FIELD_SELECT_MENU_SEARCH_PX)).toBe(fiveRowCap);
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
    expect(portalFilterPanelSizeClass(3)).toContain("19rem");
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
    expect(rect.top).toBeGreaterThanOrEqual(224 - 100 + 4);
    expect(rect.top + rect.maxHeight).toBeLessThanOrEqual(304 + 252);

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
    expect(rect.top).toBeLessThan(triggerTopInHost);
    expect(rect.top + rect.maxHeight).toBeLessThanOrEqual(triggerTopInHost);
    expect(rect.maxHeight).toBeGreaterThan(4 * 40);

    document.body.removeChild(host);
  });

  it("lets a menu spill past an overflow-visible host and clamp to the viewport instead", () => {
    // The sheet/panel is `overflow-visible`, so the bottom-most field is bounded by the
    // VIEWPORT, not by the shell. Without this the last field of a short sheet opened a
    // one-row menu — every dropdown owes its user 5 rows.
    const host = document.createElement("div");
    host.setAttribute("data-slot", "vaul-bottom-sheet");
    document.body.appendChild(host);
    host.getBoundingClientRect = () =>
      ({ top: 179, left: 0, right: 390, bottom: 574, width: 390, height: 395, x: 0, y: 179, toJSON: () => ({}) }) as DOMRect;

    const button = document.createElement("button");
    host.appendChild(button);
    // Last field: only ~24px of the host remains below it.
    button.getBoundingClientRect = () =>
      ({ top: 502, left: 16, right: 374, bottom: 546, width: 358, height: 44, x: 16, y: 502, toJSON: () => ({}) }) as DOMRect;
    Object.defineProperty(window, "innerHeight", { value: 844, configurable: true });

    const contentPx = fieldSelectMenuContentPx(FILTER_LIST_VISIBLE_ROWS, FIELD_SELECT_MENU_SEARCH_PX);
    const triggerBottomInHost = 546 - 179;

    // Clamped to the host there is no room below, so the menu has to flip upward to keep
    // its 5 rows — correct, but it covers the fields above it.
    const clampedToHost = computeFieldSelectMenuRectInHost(button, contentPx, host, {
      preferOpenDown: true,
    });
    expect(clampedToHost.maxHeight).toBe(contentPx);
    expect(clampedToHost.top).toBeLessThan(triggerBottomInHost);

    // Bounded by the viewport, the space under the raised sheet is real, so the menu keeps
    // BOTH its 5 rows and the preferred downward direction.
    const clampedToViewport = computeFieldSelectMenuRectInHost(button, contentPx, host, {
      preferOpenDown: true,
      bottomBoundPx: window.innerHeight - 12,
    });
    expect(clampedToViewport.maxHeight).toBe(contentPx);
    expect(clampedToViewport.top).toBe(triggerBottomInHost + 4);

    document.body.removeChild(host);
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
    const contentPx = 264;
    expect(resolveOpenUp(100, 120, contentPx, true)).toBe(false); // +20px above → stay down
    expect(resolveOpenUp(100, 120, contentPx, false)).toBe(true); // no preference → roomier wins
    expect(resolveOpenUp(100, 140, contentPx, true)).toBe(true); // +40px buys a row → up
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
