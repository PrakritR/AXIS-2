import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const PORTAL_DIR = join(process.cwd(), "src/components/portal");

function portalSource(file: string): string {
  return readFileSync(join(PORTAL_DIR, file), "utf8");
}

describe("Finance and Documents title-row controls", () => {
  it("renders the Applications and Leases document filters through the Documents header", () => {
    const documents = portalSource("manager-documents-panel.tsx");
    const leasingTabs = portalSource("manager-documents-leasing-tabs.tsx");

    expect(documents).toContain("const leasingDocumentsFilterSheet = isLeasingDocumentsTab");
    expect(documents).toContain("{leasingDocumentsFilterSheet}");
    expect(documents).toContain("titleAside={documentsHeaderActions}");
    expect(documents).toContain('dataAttr={`documents-${tabId}-filter-sheet-open`}');
    expect(leasingTabs).not.toContain("<PortalFilterSortSheet");
  });

  it("renders special Finance actions through the Finance header instead of a body toolbar", () => {
    const finances = portalSource("manager-finances-panel.tsx");
    const bills = portalSource("manager-bills-panel.tsx");
    const bank = portalSource("manager-bank-reconciliation-panel.tsx");
    const distributions = portalSource("manager-owner-distributions-panel.tsx");

    expect(finances).toContain("const financesAddButton =");
    expect(finances).toContain("PortalAdaptiveHeaderActions");
    expect(finances).toContain("titleAside={financesHeaderActions}");
    expect(finances).toContain('data-attr="finances-add-bill"');
    expect(finances).toContain('data-attr="bank-add-account"');
    expect(finances).toContain('data-attr="bank-add-statement"');
    expect(finances).toContain('data-attr="finances-add-distribution"');

    expect(bills).not.toContain("<PortalSectionActionRow");
    expect(bank).not.toContain('data-attr="bank-add-account"');
    expect(bank).not.toContain('data-attr="bank-add-statement"');
    expect(distributions).not.toContain("<PortalSectionActionRow");
  });

  it("constrains both title-row filters away from adjacent portal rails", () => {
    const documents = portalSource("manager-documents-panel.tsx");
    const finances = portalSource("manager-finances-panel.tsx");

    expect(documents.match(/constrainDropdownToTitleBand/g)).toHaveLength(2);
    expect(finances).toContain("constrainDropdownToTitleBand");
  });

  it("keeps the Communication reference filter inside its title row without excess closed height", () => {
    const communication = portalSource("manager-communication.tsx");
    const filterFields = portalSource("filter-field-lists.tsx");

    expect(communication).toContain("constrainDropdownToTitleBand");
    expect(filterFields).toContain('flex h-[18rem] flex-col overflow-hidden`');
  });
});
