"use client";

import { usePathname } from "next/navigation";
import { TabNav, type TabItem } from "@/components/ui/tabs";

const WORKSPACE_TABS: TabItem[] = [
  { id: "leases", label: "Leases", href: "/resident/leases" },
  { id: "payments", label: "Payments", href: "/resident/payments" },
  { id: "work-orders", label: "Work orders", href: "/resident/work-orders" },
  { id: "inbox", label: "Inbox", href: "/resident/inbox" },
];

export function ResidentPortalPillNav() {
  const pathname = usePathname();
  const segment = pathname.split("/").filter(Boolean)[1] ?? "";
  const activeId = WORKSPACE_TABS.some((t) => t.id === segment) ? segment : "__none__";

  return <TabNav items={WORKSPACE_TABS} activeId={activeId} />;
}
