"use client";

import type { TabItem } from "@/components/ui/tabs";
import { TabNav } from "@/components/ui/tabs";

export function PortalSectionSubtabs({ tabs, activeId, inline = false }: { tabs: TabItem[]; activeId: string; inline?: boolean }) {
  return (
    <div className={inline ? "shrink-0" : "mb-4"}>
      <TabNav items={tabs} activeId={activeId} />
    </div>
  );
}
