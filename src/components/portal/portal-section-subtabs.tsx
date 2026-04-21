"use client";

import type { TabItem } from "@/components/ui/tabs";
import { TabNav } from "@/components/ui/tabs";

export function PortalSectionSubtabs({ tabs, activeId }: { tabs: TabItem[]; activeId: string }) {
  return (
    <div className="mb-4">
      <TabNav items={tabs} activeId={activeId} />
    </div>
  );
}
