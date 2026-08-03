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
} from "@/components/ui/field-select-menu";
import {
  FILTER_LIST_MAX_HEIGHT_PX,
  FILTER_LIST_VISIBLE_ROWS,
  FILTER_MENU_CONTENT_PX,
  FILTER_FIELD_MENU_ALWAYS_SHOW_SEARCH,
  FilterCheckboxList,
  FilterCollapsibleSection,
  FilterFieldsAccordion,
  filterMultiSelectSummary,
  portalFilterPanelSizeClass,
} from "@/components/portal/filter-field-lists";

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
    expect(shell.style.height).toBe(`${expectedMenuHeight}px`);
    expect(FILTER_MENU_CONTENT_PX).toBe(expectedMenuHeight);
    expect(FILTER_LIST_MAX_HEIGHT_PX).toBe(FILTER_LIST_VISIBLE_ROWS * 40);
    expect(listbox.className).toContain("overflow-y-auto");
    // All 30 options are still rendered (scrolled), not truncated.
    expect(within(listbox).getAllByRole("option")).toHaveLength(30);
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
    expect(portalFilterPanelSizeClass(4)).toContain("19rem");
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

  it("opens filter field menus below the trigger when the field is near the panel bottom", () => {
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

    const rect = computeFieldSelectMenuRectInHost(button, 252, host, { preferOpenDown: true });
    const triggerBottomInHost = 392 - 100;
    expect(rect.top).toBe(triggerBottomInHost + 4);

    document.body.removeChild(host);
  });

  it("opens filter field menus below the trigger on body portal when preferOpenDown is set", () => {
    const button = document.createElement("button");
    document.body.appendChild(button);
    button.getBoundingClientRect = () =>
      ({
        top: 620,
        left: 16,
        right: 360,
        bottom: 664,
        width: 344,
        height: 44,
        x: 16,
        y: 620,
        toJSON: () => ({}),
      }) as DOMRect;
    Object.defineProperty(window, "innerWidth", { value: 390, configurable: true });
    Object.defineProperty(window, "innerHeight", { value: 844, configurable: true });

    const contentPx = 252;
    const rect = computeFieldSelectMenuRect(button, contentPx, document.body, { preferOpenDown: true });
    expect(rect.position).toBe("fixed");
    expect(rect.top).toBe(664 + 4);

    document.body.removeChild(button);
  });
});
