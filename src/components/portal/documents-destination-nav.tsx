"use client";

import { DestinationNav } from "@/components/ui/destination-nav";

/** Keeps nine document views out of one overflowing tab row. */
export const DOCUMENT_NAV_GROUPS = [
  {
    id: "files",
    label: "Files",
    tabIds: ["library", "templates"],
  },
  {
    id: "leasing",
    label: "Leasing",
    tabIds: ["applications", "leases"],
  },
  {
    id: "reports",
    label: "Reports",
    tabIds: ["income-documents", "expense-documents", "occupancy", "1099", "tax-summary"],
  },
] as const;

export function documentGroupIdForTab(tabId: string): string {
  for (const group of DOCUMENT_NAV_GROUPS) {
    if ((group.tabIds as readonly string[]).includes(tabId)) return group.id;
  }
  return DOCUMENT_NAV_GROUPS[0].id;
}

type DocumentTabItem = { id: string; label: string; href: string };

const EQUAL_NAV_CLASS = "max-w-none max-lg:rounded-none max-lg:border-0 max-lg:border-b max-lg:border-border max-lg:bg-transparent";

/**
 * Group switcher + full-width sub-tabs — same chrome as Payments list sections.
 */
export function DocumentsDestinationNav({
  tabId,
  tabItems,
}: {
  tabId: string;
  tabItems: DocumentTabItem[];
}) {
  const activeGroupId = documentGroupIdForTab(tabId);
  const activeGroup = DOCUMENT_NAV_GROUPS.find((group) => group.id === activeGroupId) ?? DOCUMENT_NAV_GROUPS[0];
  const subItems = tabItems.filter((item) => (activeGroup.tabIds as readonly string[]).includes(item.id));

  const groupItems = DOCUMENT_NAV_GROUPS.map((group) => {
    const targetTab = (group.tabIds as readonly string[]).includes(tabId) ? tabId : group.tabIds[0];
    const href = tabItems.find((item) => item.id === targetTab)?.href ?? tabItems[0]?.href ?? "";
    return {
      id: group.id,
      label: group.label,
      href,
    };
  });

  return (
    <div className="flex w-full min-w-0 flex-col gap-2">
      <DestinationNav
        items={groupItems}
        activeId={activeGroupId}
        ariaLabel="Document section"
        itemLayout="equal"
        denseEqualRow
        size="toolbar"
        className={EQUAL_NAV_CLASS}
      />
      {subItems.length > 0 ? (
        <DestinationNav
          items={subItems}
          activeId={tabId}
          ariaLabel="Document view"
          itemLayout="equal"
          denseEqualRow
          size="toolbar"
          className={EQUAL_NAV_CLASS}
        />
      ) : null}
    </div>
  );
}
