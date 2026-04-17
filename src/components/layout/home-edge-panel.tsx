"use client";

import { useAppUi } from "@/components/providers/app-ui-provider";

/** Floating control on the right edge (reference home page). */
export function HomeEdgePanel() {
  const { showToast } = useAppUi();

  return (
    <button
      type="button"
      aria-label="Panel"
      className="fixed right-0 top-1/2 z-40 hidden h-11 w-11 -translate-y-1/2 translate-x-1/2 rounded-full bg-slate-900 text-white shadow-lg lg:flex lg:items-center lg:justify-center"
      onClick={() => showToast("Coming soon")}
    >
      <span className="text-[10px] leading-none">⚙</span>
    </button>
  );
}
