"use client";

import { DestinationNav } from "@/components/ui/destination-nav";

/** Top-level finance areas — keeps the tab bar from cramming 16 views into one row. */
export const FINANCE_NAV_GROUPS = [
  {
    id: "transactions",
    label: "Transactions",
    tabIds: ["income", "expenses"],
  },
  {
    id: "reports",
    label: "Reports",
    tabIds: [
      "trial-balance",
      "balance-sheet",
      "general-ledger",
      "cash-flow-statement",
      "payout-history",
      "owner-statement",
      "financial-diagnostics",
      "ap-aging",
      "budget-vs-actual",
    ],
  },
  {
    id: "operations",
    label: "Operations",
    tabIds: ["trust-account-balance", "security-deposits", "bills", "bank-reconciliation", "owner-distributions"],
  },
] as const;

export function financeGroupIdForTab(tabId: string): string {
  for (const group of FINANCE_NAV_GROUPS) {
    if ((group.tabIds as readonly string[]).includes(tabId)) return group.id;
  }
  return FINANCE_NAV_GROUPS[0].id;
}

type FinanceTabItem = { id: string; label: string; href: string };

const EQUAL_NAV_CLASS = "max-w-none max-lg:rounded-none max-lg:border-0 max-lg:border-b max-lg:border-border max-lg:bg-transparent";

/**
 * Group switcher + full-width sub-tabs — same chrome as Payments and Documents.
 */
export function FinanceDestinationNav({
  tabId,
  tabItems,
}: {
  tabId: string;
  tabItems: FinanceTabItem[];
}) {
  const activeGroupId = financeGroupIdForTab(tabId);
  const subItems = tabItems.filter((item) => {
    const group = FINANCE_NAV_GROUPS.find((entry) => entry.id === activeGroupId) ?? FINANCE_NAV_GROUPS[0];
    return (group.tabIds as readonly string[]).includes(item.id);
  });

  const groupItems = FINANCE_NAV_GROUPS.map((group) => {
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
        ariaLabel="Finance section"
        itemLayout="equal"
        denseEqualRow
        size="toolbar"
        className={EQUAL_NAV_CLASS}
      />
      {subItems.length > 0 ? (
        <DestinationNav
          items={subItems}
          activeId={tabId}
          ariaLabel="Finance view"
          itemLayout="equal"
          denseEqualRow
          size="toolbar"
          className={EQUAL_NAV_CLASS}
        />
      ) : null}
    </div>
  );
}
