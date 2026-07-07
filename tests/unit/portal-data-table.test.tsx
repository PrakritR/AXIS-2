// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import {
  INBOX_SCHEDULE_TABLE_COLUMN_WEIGHTS,
  portalTableColumnPercents,
  PORTAL_TABLE_INBOX_COLUMN_WEIGHTS,
  PortalTableExpandChevron,
  PortalTableInlineExpand,
} from "@/components/portal/portal-data-table";

describe("portal-data-table column widths", () => {
  it("returns percentage strings that sum to ~100", () => {
    const cols = portalTableColumnPercents(3);
    expect(cols).toHaveLength(3);
    const sum = cols.reduce((acc, p) => acc + Number.parseFloat(p), 0);
    expect(sum).toBeGreaterThan(99.9);
    expect(sum).toBeLessThan(100.1);
  });

  it("supports custom inbox weights", () => {
    const cols = portalTableColumnPercents(3, PORTAL_TABLE_INBOX_COLUMN_WEIGHTS);
    expect(cols).toHaveLength(3);
    const subjectIndex = 1;
    expect(Number.parseFloat(cols[subjectIndex]!)).toBeGreaterThan(Number.parseFloat(cols[0]!));
  });

  it("inbox schedule table uses four data columns without expand column", () => {
    const cols = portalTableColumnPercents(4, INBOX_SCHEDULE_TABLE_COLUMN_WEIGHTS);
    expect(cols).toHaveLength(4);
    const subjectIndex = 3;
    expect(Number.parseFloat(cols[subjectIndex]!)).toBeGreaterThan(Number.parseFloat(cols[1]!));
  });
});

describe("portal expand chevrons", () => {
  it("renders ChevronRight when collapsed and ChevronDown when expanded", () => {
    const { container, rerender } = render(<PortalTableExpandChevron expanded={false} />);
    expect(container.querySelector("svg.lucide-chevron-right")).toBeTruthy();
    expect(container.querySelector("svg.lucide-chevron-down")).toBeNull();

    rerender(<PortalTableExpandChevron expanded />);
    expect(container.querySelector("svg.lucide-chevron-down")).toBeTruthy();
    expect(container.querySelector("svg.lucide-chevron-right")).toBeNull();
  });

  it("places chevron inline after label text", () => {
    const { container } = render(
      <PortalTableInlineExpand expanded={false}>Application</PortalTableInlineExpand>,
    );
    const row = container.firstElementChild;
    expect(row?.className).toContain("inline-flex");
    expect(row?.className).toContain("gap-1.5");
    expect(row?.textContent).toContain("Application");
    expect(row?.querySelector("svg.lucide-chevron-right")).toBeTruthy();
  });
});
