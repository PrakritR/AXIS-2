"use client";

import { useAppUi } from "@/components/providers/app-ui-provider";

export function ChatFab() {
  const { openModal } = useAppUi();
  return (
    <button
      type="button"
      className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-sm font-black text-white shadow-[0_18px_60px_-20px_rgba(37,99,235,0.85)]"
      aria-label="Open chat"
      onClick={() =>
        openModal({
          title: "Axis support chat",
          body: "Live chat is not connected yet. This button exists for the full UI shell.",
        })
      }
    >
      ?
    </button>
  );
}
