import { Suspense } from "react";
import { ResidentTourScheduleClient } from "@/components/portal/resident-tour-schedule-client";

export default function ResidentTourSchedulePage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center px-6 py-16 text-sm text-muted">Loading tour scheduling…</div>
      }
    >
      <ResidentTourScheduleClient />
    </Suspense>
  );
}
