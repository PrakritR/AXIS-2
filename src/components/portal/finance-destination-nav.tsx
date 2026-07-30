"use client";

import { useRouter } from "next/navigation";
import { DestinationNav, LocalDestinationNav } from "@/components/ui/destination-nav";
import { cn } from "@/lib/utils";

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

const SUB_NAV_WRAP_CLASS =
  "md:flex-wrap md:gap-1 [&_a]:flex-none [&_a]:basis-auto [&_a]:shrink-0 md:[&_a]:flex-none";

/**
 * Two-band finance navigation — group switcher (3 items) + wrapped sub-tabs for the active group.
 * Matches Residents / Properties / Documents list chrome without horizontal overflow.
 */
export function FinanceDestinationNav({
  tabId,
  tabItems,
  basePath,
}: {
  tabId: string;
  tabItems: FinanceTabItem[];
  basePath: string;
}) {
  const router = useRouter();
  const activeGroupId = financeGroupIdForTab(tabId);
  const activeGroup = FINANCE_NAV_GROUPS.find((group) => group.id === activeGroupId) ?? FINANCE_NAV_GROUPS[0];
  const subItems = tabItems.filter((item) => (activeGroup.tabIds as readonly string[]).includes(item.id));

  const groupItems = FINANCE_NAV_GROUPS.map((group) => ({
    id: group.id,
    label: group.label,
  }));

  return (
    <div className="space-y-2">
      <LocalDestinationNav
        items={groupItems}
        activeId={activeGroupId}
        onChange={(groupId) => {
          const group = FINANCE_NAV_GROUPS.find((entry) => entry.id === groupId);
          if (!group) return;
          const targetTab = (group.tabIds as readonly string[]).includes(tabId) ? tabId : group.tabIds[0];
          router.push(`${basePath}/financials/${targetTab}`, { scroll: false });
        }}
        ariaLabel="Finance section"
        size="toolbar"
        className="max-lg:rounded-none max-lg:border-0 max-lg:border-b max-lg:border-border max-lg:bg-transparent"
      />
      {subItems.length > 0 ? (
        <DestinationNav
          items={subItems}
          activeId={tabId}
          ariaLabel="Finance report"
          size="toolbar"
          className={cn(
            SUB_NAV_WRAP_CLASS,
            "max-lg:rounded-none max-lg:border-0 max-lg:border-b-0 max-lg:bg-transparent",
          )}
        />
      ) : null}
    </div>
  );
}
